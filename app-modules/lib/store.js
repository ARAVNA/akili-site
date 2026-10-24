// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Couche de données (Supabase + cache local)
//
// Interface SYNCHRONE : Store.get(cle, defaut) et Store.set(cle, valeur).
// Tes écrans lisent et écrivent comme avec localStorage ; cette couche se
// charge de Supabase, du temps réel et du hors ligne.
//
//   lecture  → cache mémoire, alimenté par une copie locale + Realtime
//   écriture → cache + copie locale immédiats, puis Supabase (groupé 600 ms)
//
// Sans configuration Supabase, tout fonctionne en local : l'application
// reste utilisable, les données vivent sur l'appareil uniquement.
//
// ─── PORTÉE ────────────────────────────────────────────────────────
// Cette couche est ADDITIVE : elle écrit dans une seule table,
// `akili_stores`, et ne touche pas à tes tables existantes
// (organizations, profiles, clients). Elle est faite pour les modules
// qui n'ont pas encore de table dédiée : documents, stocks, mouvements,
// employés, paie, écritures OHADA, chat, quotas.
//
// Un module à fort volume (les factures d'une entreprise active pendant
// des années) gagnera à recevoir sa propre table avec une ligne par
// enregistrement. Voir la note de fin de supabase/schema.sql.
// ═══════════════════════════════════════════════════════════════════

import { sb, supabaseConfigure } from "./supabase";

const TABLE = "akili_stores";
const DELAI_GROUPAGE = 600;          // ms
const CLE_ATTENTE = "akili_attente";

const navigateur = () => typeof window !== "undefined";
const actif = () => navigateur() && supabaseConfigure && !!sb();

// Modules dont les données appartiennent à l'ENTREPRISE
const MODULES_ORG = ["docs", "clients", "stocks", "mvts", "employes", "paie", "ecrit"];

export const Store = {
  _c: new Map(),       // cache mémoire
  _subs: new Set(),    // abonnés (tout changement)
  _rsubs: new Set(),   // abonnés (changement venu d'un autre appareil)
  _chan: null,         // canal Realtime
  _t: new Map(),       // minuteries de groupage
  _d: null,            // écritures non confirmées
  _scope: null,
  _pending: 0,
  _hooked: false,

  // ── Portées ───────────────────────────────────────────────────
  // akili_clients_<orgId> → scope "org:<orgId>",  key "clients"
  // akili_chat_<uid>      → scope "user:<uid>",   key "chat"
  // akili_q_<uid>_9_2026  → scope "user:<uid>",   key "q_9_2026"
  _ref(k) {
    const s = Store._scope;
    if (!s) return null;
    if (k === `akili_chat_${s.uid}`)
      return { scope: `user:${s.uid}`, key: "chat" };
    if (k.startsWith(`akili_q_${s.uid}_`))
      return { scope: `user:${s.uid}`, key: "q_" + k.slice(`akili_q_${s.uid}_`.length) };
    if (s.orgId && k.endsWith(`_${s.orgId}`))
      return { scope: `org:${s.orgId}`, key: k.slice(6, -(s.orgId.length + 1)) };
    return null;
  },
  // Chemin inverse : une ligne Supabase → la clé locale correspondante
  _cle(scope, key) {
    const s = Store._scope;
    if (!s) return null;
    if (scope === `user:${s.uid}`)  return key === "chat" ? `akili_chat_${s.uid}` : `akili_q_${s.uid}_${key.slice(2)}`;
    if (scope === `org:${s.orgId}`) return `akili_${key}_${s.orgId}`;
    return null;
  },

  // ── Copie locale ──────────────────────────────────────────────
  _localGet(k, d) {
    if (!navigateur()) return d;
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch { return d; }
  },
  _localSet(k, v) {
    if (!navigateur()) return false;
    try {
      const s = JSON.stringify(v);
      if (s.length > 4_000_000 && Array.isArray(v)) return Store._localSet(k, v.slice(0, 50));
      localStorage.setItem(k, s);
      return true;
    } catch (e) {
      if (e?.name === "QuotaExceededError") {
        try {
          const a = Store._localGet(k, []);
          if (Array.isArray(a)) localStorage.setItem(k, JSON.stringify(a.slice(0, 20)));
        } catch {}
      }
      return false;
    }
  },

  // ── Écritures non confirmées ──────────────────────────────────
  // Registre des clés écrites localement mais pas encore acquittées par
  // le serveur. Il survit à la fermeture de l'application.
  //
  // Pourquoi il existe : sans lui, une saisie faite juste avant que
  // l'utilisateur quitte l'app n'est jamais partie — et au redémarrage,
  // la version plus ancienne du serveur l'écrase. La donnée disparaît
  // des deux côtés. Bug constaté, reproduit, puis corrigé par ce registre.
  attente() {
    if (!Store._d) {
      try { Store._d = new Set(JSON.parse(Store._localGet(CLE_ATTENTE, "[]") || "[]")); }
      catch { Store._d = new Set(); }
      if (!(Store._d instanceof Set)) Store._d = new Set();
    }
    return Store._d;
  },
  _attenteSave()  { Store._localSet(CLE_ATTENTE, JSON.stringify([...Store.attente()])); },
  _attenteAdd(k)  { Store.attente().add(k);    Store._attenteSave(); },
  _attenteDone(k) { Store.attente().delete(k); Store._attenteSave(); },

  // ── Lecture / écriture ────────────────────────────────────────
  get(k, d = []) {
    if (Store._c.has(k)) return Store._c.get(k);
    const v = Store._localGet(k, d);
    Store._c.set(k, v);
    return v;
  },

  set(k, v) {
    Store._c.set(k, v);
    Store._localSet(k, v);               // immédiat : rien n'est perdu hors ligne
    if (actif() && Store._ref(k)) Store._attenteAdd(k);
    Store._push(k, v);
    Store._emit();
    return true;
  },

  // Envoi groupé : évite une requête par frappe clavier.
  _push(k, v) {
    if (!actif()) return;
    const r = Store._ref(k);
    if (!r) return;
    clearTimeout(Store._t.get(k));
    Store._t.set(k, setTimeout(async () => {
      try {
        Store._pending++; Store._emit();
        const { error } = await sb().from(TABLE).upsert(
          { scope: r.scope, key: r.key, data: v, updated_at: new Date().toISOString() },
          { onConflict: "scope,key" }
        );
        if (error) throw error;
        Store._attenteDone(k);
      } catch (e) {
        // Hors ligne ou refus RLS : la clé reste « en attente », donc le
        // serveur ne pourra pas écraser la version locale, et l'envoi sera
        // retenté à la prochaine connexion.
        console.warn("Supabase upsert", k, e?.message);
      } finally {
        Store._pending--; Store._emit();
      }
    }, DELAI_GROUPAGE));
  },

  // Vide la file sans attendre : appelé quand l'app passe en arrière-plan
  // ou se ferme, moment où une saisie récente serait sinon perdue.
  flush() {
    Store._t.forEach(t => clearTimeout(t));
    Store._t.clear();
    if (!actif()) return;
    [...Store.attente()].forEach(k => {
      const r = Store._ref(k);
      if (!r) return;
      const v = Store._c.has(k) ? Store._c.get(k) : Store._localGet(k, null);
      if (v === null) return;
      try {
        sb().from(TABLE)
          .upsert({ scope: r.scope, key: r.key, data: v, updated_at: new Date().toISOString() },
                  { onConflict: "scope,key" })
          .then(({ error }) => { if (!error) Store._attenteDone(k); });
      } catch {}
    });
  },

  // ── Chargement initial + temps réel ───────────────────────────
  // À appeler dès que l'utilisateur connecté est connu :
  //   Store.bind({ uid: user.id, orgId: profil.organization_id || user.id })
  async bind(scope) {
    await Store.unbind();
    Store._scope = scope;
    if (!actif() || !scope) return;

    const client = sb();
    const scopes = [`org:${scope.orgId}`, `user:${scope.uid}`];

    // 1. Chargement initial — une seule requête pour tous les modules
    try {
      const { data, error } = await client
        .from(TABLE).select("scope,key,data").in("scope", scopes);
      if (error) throw error;
      (data || []).forEach(row => {
        const k = Store._cle(row.scope, row.key);
        if (!k) return;
        if (Store.attente().has(k)) return;   // local plus récent : on le garde
        Store._c.set(k, row.data);
        Store._localSet(k, row.data);
      });
      Store._emit();
      Store._emitRemote();
    } catch (e) {
      console.warn("Supabase chargement initial", e?.message);
    }

    // 2. Temps réel — un canal pour les deux portées
    Store._chan = client.channel("akili_stores_sync");
    scopes.forEach(sc => {
      Store._chan.on("postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `scope=eq.${sc}` },
        payload => {
          const row = payload.new;
          if (!row) return;
          const k = Store._cle(row.scope, row.key);
          if (!k) return;
          // Une écriture locale attend encore son accusé : elle est plus
          // récente que le serveur, on la protège.
          if (Store.attente().has(k)) return;
          // Supabase renvoie aussi nos propres écritures : on ignore si rien
          // n'a changé, sinon chaque saisie ferait sauter les écrans.
          try { if (JSON.stringify(Store._c.get(k)) === JSON.stringify(row.data)) return; } catch {}
          Store._c.set(k, row.data);
          Store._localSet(k, row.data);
          Store._emit();
          Store._emitRemote();
        });
    });
    Store._chan.subscribe();

    // 3. Rattrapage : ce qui n'est jamais parti lors de la session précédente
    [...Store.attente()].forEach(k => {
      const v = Store._localGet(k, null);
      if (v !== null) Store._push(k, v);
    });

    // 4. Filet de sécurité : ne jamais perdre une saisie parce que l'app se ferme
    if (!Store._hooked && navigateur()) {
      Store._hooked = true;
      window.addEventListener("pagehide", () => Store.flush());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") Store.flush();
      });
    }
  },

  async unbind() {
    if (Store._chan) {
      try { await sb()?.removeChannel(Store._chan); } catch {}
      Store._chan = null;
    }
    Store._scope = null;
  },

  // À la déconnexion : sinon l'utilisateur suivant verrait les données du précédent.
  async clear() {
    Store.flush();
    await Store.unbind();
    Store._c.clear();
  },

  // ── Abonnements ───────────────────────────────────────────────
  subscribe(cb)       { Store._subs.add(cb);  return () => Store._subs.delete(cb); },
  subscribeRemote(cb) { Store._rsubs.add(cb); return () => Store._rsubs.delete(cb); },
  _emit()       { Store._subs.forEach(f => { try { f(); } catch {} }); },
  _emitRemote() { Store._rsubs.forEach(f => { try { f(); } catch {} }); },

  syncing()   { return Store._pending > 0; },
  enAttente() { return Store.attente().size; },

  // Clés surveillées, pour information
  modules: MODULES_ORG,
};

// ─── Quotas IA mensuels ───────────────────────────────────────────
export const cleQuota = (uid) =>
  `akili_q_${uid}_${new Date().getMonth()}_${new Date().getFullYear()}`;

export const QUOTAS = { starter: 30, business: 150, enterprise: 999 };

export const Quota = {
  usage: (uid)       => Store.get(cleQuota(uid), { count: 0 }),
  inc:   (uid)       => { const u = Quota.usage(uid); Store.set(cleQuota(uid), { count: u.count + 1 }); return u.count + 1; },
  peut:  (uid, plan) => Quota.usage(uid).count < (QUOTAS[plan] || 30),
  reste: (uid, plan) => Math.max(0, (QUOTAS[plan] || 30) - Quota.usage(uid).count),
};

export default Store;
