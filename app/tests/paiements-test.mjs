// Paiements : base PostgreSQL simulée (PGlite) + routes serveur réelles + prestataire FAUX.
// Les routes appellent un fetch simulé qui exécute les vraies fonctions SQL en tant que service_role.
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { creerBase, comme, peuplerDeuxEntreprises, scriptsSql, IDS, bilan } from "./lib/sim.mjs";
import { signer } from "../api/_paiement/faux.js";

const racine = fileURLToPath(new URL("..", import.meta.url));
const R = []; const t = async (n, f) => { try { await f(); R.push({ nom: n, ok: true }); } catch (e) { R.push({ nom: n, ok: false, detail: e.message.split("\n")[0] }); } };
const db = await creerBase({ scripts: scriptsSql("apres") });
const { orgA, orgB } = await peuplerDeuxEntreprises(db);
const SECRET = "secret-de-test-factice";
const ENV = { VITE_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-factice", PAIEMENT_FAUX_ACTIF: "1", PAIEMENT_SECRET_FAUX: SECRET };
const poseEnv = (e) => { for (const k of Object.keys(process.env).filter((k) => /SUPABASE|PAIEMENT|VERCEL_ENV/.test(k))) delete process.env[k]; Object.assign(process.env, e); };
const JETONS = { "jeton-A1": IDS.A1, "jeton-B1": IDS.B1 };
const sqlSvc = async (sql, params) => { await db.exec("set role service_role"); try { return await db.query(sql, params); } finally { await db.exec("reset role"); } };

globalThis.fetch = async (url, opt = {}) => {
  const u = String(url); const ok = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o });
  if (u.includes("/auth/v1/user")) { const j = (opt.headers?.Authorization || "").replace("Bearer ", ""); return JETONS[j] ? ok({ id: JETONS[j] }) : ok({}, 401); }
  let m;
  if ((m = /profiles\?id=eq\.([0-9a-f-]+)&select=org_id/.exec(u))) return ok((await sqlSvc("select org_id from public.profiles where id=$1", [m[1]])).rows);
  if (u.endsWith("/rest/v1/commandes_paiement") && opt.method === "POST") {
    const b = JSON.parse(opt.body);
    try { return ok((await sqlSvc("insert into public.commandes_paiement (org_id,plan,montant,devise,prestataire,cree_par) values ($1,$2,$3,$4,$5,$6) returning *", [b.org_id, b.plan, b.montant, b.devise, b.prestataire, b.cree_par])).rows); } catch { return ok({}, 400); }
  }
  if (u.endsWith("/rpc/appliquer_paiement")) { const b = JSON.parse(opt.body); try { return ok((await sqlSvc("select public.appliquer_paiement($1,$2,$3,$4,$5) r", [b.p_prestataire, b.p_event_id, b.p_commande, b.p_montant, b.p_devise])).rows[0].r); } catch (e) { return ok({ message: e.message }, 400); } }
  return ok({}, 404);
};
const charge = async (f) => (await import(racine + f + "?v=" + Math.random())).default;
const hWebhook = await charge("api/paiement-webhook.js"), hCmd = await charge("api/paiement-commande.js");
const reponse = () => { const r = { h: {} }; r.setHeader = (k, v) => (r.h[k] = v); r.status = (c) => ({ json: (o) => { r.code = c; r.out = o; } }); return r; };
async function webhook({ corps, signature, methode = "POST", prestataire = "faux", entetes = {} }) {
  const brut = typeof corps === "string" ? corps : JSON.stringify(corps);
  const req = Object.assign(Readable.from([Buffer.from(brut)]), { method: methode, headers: { ...(signature === undefined ? { "x-faux-signature": signer(SECRET, brut) } : signature ? { "x-faux-signature": signature } : {}), ...entetes }, url: `/api/paiement-webhook?p=${prestataire}`, query: { p: prestataire } });
  const res = reponse(); await hWebhook(req, res); return res;
}
async function commande(jeton, plan, env = ENV) { poseEnv(env); const res = reponse(); await hCmd({ method: "POST", headers: { authorization: "Bearer " + jeton }, body: { plan } }, res); return res; }
const etatOrg = async (o) => (await db.query("select plan, plan_expire_le from public.organizations where id=$1", [o])).rows[0];
const nbEv = async () => (await db.query("select count(*)::int n from public.evenements_paiement")).rows[0].n;
const evt = (c, extra = {}) => ({ event_id: "evt_" + Math.random().toString(36).slice(2), commande_id: c, statut: "reussi", montant: 50000, devise: "XOF", ...extra });
poseEnv(ENV);

// ── Création de commande ──
let cmdA;
await t("commande : l'entreprise vient du compte, le prix du serveur (le navigateur ne fournit que le nom du plan)", async () => {
  const r = await commande("jeton-A1", "enterprise"); assert.equal(r.code, 201);
  cmdA = r.out.commande_id; const c = (await db.query("select * from public.commandes_paiement where id=$1", [cmdA])).rows[0];
  assert.equal(c.org_id, orgA); assert.equal(Number(c.montant), 50000); assert.equal(c.statut, "en_attente");
  assert.equal((await etatOrg(orgA)).plan, "starter", "créer une commande ne change PAS le plan");
});
await t("commande : prix et entreprise falsifiés dans le corps sont ignorés ; plan inconnu refusé", async () => {
  poseEnv(ENV); const res = reponse(); await hCmd({ method: "POST", headers: { authorization: "Bearer jeton-B1" }, body: { plan: "business", montant: 1, org_id: orgA } }, res);
  assert.equal(res.code, 201); const c = (await db.query("select org_id, montant from public.commandes_paiement where id=$1", [res.out.commande_id])).rows[0];
  assert.equal(c.org_id, orgB); assert.equal(Number(c.montant), 15000);
  assert.equal((await commande("jeton-A1", "gratuit")).code, 400);
  assert.equal((await commande("jeton-A1", "__proto__")).code, 400);
});
await t("commande : sans jeton valide → 401 ; sans prestataire actif → 503 ; faux prestataire inactif en production", async () => {
  poseEnv(ENV); let res = reponse(); await hCmd({ method: "POST", headers: {}, body: { plan: "business" } }, res); assert.equal(res.code, 401);
  assert.equal((await commande("jeton-inconnu", "business")).code, 401);
  assert.equal((await commande("jeton-A1", "business", { ...ENV, PAIEMENT_FAUX_ACTIF: "0" })).code, 503);
  assert.equal((await commande("jeton-A1", "business", { ...ENV, VERCEL_ENV: "production" })).code, 503);
});
await t("les prix du serveur correspondent à ceux de l'offre affichée dans l'application", async () => {
  const app = readFileSync(racine + "src/App.jsx", "utf8");
  for (const [p, prix] of [["business", 15000], ["enterprise", 50000]]) assert.ok(new RegExp(`${p}:\\s*\\{[^}]*prix:${prix}`).test(app), p);
  const cmd = readFileSync(racine + "api/paiement-commande.js", "utf8"); assert.ok(/business: 15000, enterprise: 50000/.test(cmd));
});

// ── Webhook ──
poseEnv(ENV);
await t("webhook falsifié : signature absente, fausse, mal formée ou expirée → 401, aucun effet", async () => {
  const e = evt(cmdA);
  for (const sig of [null, "t=1,v1=" + "0".repeat(64), "n'importe quoi", signer(SECRET, JSON.stringify(e), Math.floor(Date.now() / 1000) - 3600), signer("mauvais-secret", JSON.stringify(e))]) {
    const r = await webhook({ corps: e, signature: sig }); assert.equal(r.code, 401, String(sig));
  }
  assert.equal((await etatOrg(orgA)).plan, "starter"); assert.equal(await nbEv(), 0);
});
await t("webhook : corps modifié après signature → 401", async () => {
  const e = evt(cmdA); const sig = signer(SECRET, JSON.stringify(e)); const r = await webhook({ corps: { ...e, montant: 1 }, signature: sig });
  assert.equal(r.code, 401); assert.equal((await etatOrg(orgA)).plan, "starter");
});
await t("webhook : méthode GET → 405 ; prestataire inconnu → 404 ; secret absent → 503 ; faux inactif en production → 404", async () => {
  assert.equal((await webhook({ corps: {}, methode: "GET" })).code, 405);
  assert.equal((await webhook({ corps: evt(cmdA), prestataire: "orange" })).code, 404);
  poseEnv({ ...ENV, PAIEMENT_SECRET_FAUX: "" }); assert.equal((await webhook({ corps: evt(cmdA) })).code, 503);
  poseEnv({ ...ENV, VERCEL_ENV: "production" }); assert.equal((await webhook({ corps: evt(cmdA) })).code, 404);
  poseEnv(ENV);
});
await t("webhook : corps > 64 Ko → 413", async () => { assert.equal((await webhook({ corps: "x".repeat(70000) })).code, 413); });
await t("webhook : montant insuffisant, devise différente, autre commande inconnue → refus, plan inchangé", async () => {
  for (const e of [evt(cmdA, { montant: 49999 }), evt(cmdA, { devise: "EUR" }), evt("99999999-9999-4999-8999-999999999999")]) {
    const r = await webhook({ corps: e }); assert.equal(r.code, 200); assert.equal(r.out.resultat, "refuse");
  }
  assert.equal((await etatOrg(orgA)).plan, "starter");
});
await t("webhook : événement non « réussi » (échec) → acquitté sans effet", async () => {
  const r = await webhook({ corps: evt(cmdA, { statut: "echec" }) }); assert.equal(r.out.resultat, "ignore"); assert.equal((await etatOrg(orgA)).plan, "starter");
});
let evOK, apres1;
await t("webhook authentique + commande valide → plan Enterprise activé pour l'entreprise de la commande (A), pas B", async () => {
  evOK = evt(cmdA, { org_id: orgB, plan: "starter" });                 // champs hostiles dans le corps : ignorés
  const r = await webhook({ corps: evOK }); assert.equal(r.out.resultat, "active");
  apres1 = await etatOrg(orgA); assert.equal(apres1.plan, "enterprise"); assert.ok(apres1.plan_expire_le > new Date());
  assert.equal((await etatOrg(orgB)).plan, "starter");
});
await t("REJEU du même événement (même signature) → 'deja_traite', ni double activation ni prolongation", async () => {
  const r = await webhook({ corps: evOK }); assert.equal(r.out.resultat, "deja_traite");
  assert.equal(JSON.stringify(await etatOrg(orgA)), JSON.stringify(apres1));
  assert.equal((await db.query("select count(*)::int n from public.evenements_paiement where event_id=$1", [evOK.event_id])).rows[0].n, 1);
});
await t("même commande payée avec un NOUVEL identifiant d'événement → refus (pas de double activation)", async () => {
  const r = await webhook({ corps: evt(cmdA) }); assert.equal(r.out.resultat, "refuse"); assert.equal(JSON.stringify(await etatOrg(orgA)), JSON.stringify(apres1));
});
await t("deux notifications simultanées identiques → une seule activation", async () => {
  const c = (await commande("jeton-B1", "enterprise")).out.commande_id; const e = evt(c);
  const [x, y] = await Promise.all([webhook({ corps: e }), webhook({ corps: e })]);
  assert.deepEqual([x.out.resultat, y.out.resultat].sort(), ["active", "deja_traite"]);
  assert.equal((await db.query("select count(*)::int n from public.evenements_paiement where commande_id=$1 and resultat='active'", [c])).rows[0].n, 1);
});
await t("commande expirée → refus", async () => {
  const c = (await commande("jeton-A1", "business")).out.commande_id; await db.exec(`update public.commandes_paiement set expire_le = now() - interval '1 hour' where id='${c}'`);
  const r = await webhook({ corps: evt(c, { montant: 15000 }) }); assert.equal(r.out.resultat, "refuse");
});

// ── Droits en base : le navigateur ne peut rien ──
await t("un utilisateur connecté ne peut ni lire ni écrire commandes/événements, ni appeler appliquer_paiement, ni modifier plan/expiration", async () => {
  for (const sql of ["select * from public.commandes_paiement", "select * from public.evenements_paiement", `insert into public.commandes_paiement (org_id,plan,montant,prestataire) values ('${orgA}','enterprise',1,'faux')`,
    `update public.commandes_paiement set statut='payee'`, `select public.appliquer_paiement('faux','x','${cmdA}',50000,'XOF')`]) {
    const r = await comme(db, "authenticated", IDS.A1, sql); assert.equal(r.ok, false, sql); assert.match(r.err, /permission denied/, sql);
  }
  for (const [u, sql] of [[IDS.A1, `update public.organizations set plan_expire_le='2099-01-01' where id='${orgB}'`], [IDS.B1, `update public.organizations set plan='enterprise' where id='${orgB}'`], [IDS.B1, `update public.organizations set plan_expire_le='2099-01-01' where id='${orgB}'`]]) {
    const r = await comme(db, "authenticated", u, sql); assert.equal(r.ok, false, sql); assert.match(r.err, /permission denied/);
  }
  assert.ok(!String((await etatOrg(orgB)).plan_expire_le).includes("2099"));
});
await t("anonyme : aucune des tables ni fonction de paiement", async () => {
  for (const sql of ["select * from public.commandes_paiement", `select public.appliquer_paiement('faux','x','${cmdA}',1,'XOF')`]) { const r = await comme(db, "anon", null, sql); assert.equal(r.ok, false, sql); }
});
await t("un utilisateur peut LIRE le plan de son entreprise (lecture seule)", async () => {
  const r = await comme(db, "authenticated", IDS.A2, "select plan from public.organizations"); assert.ok(r.ok && r.rows.length === 1 && r.rows[0].plan === "enterprise");
});
process.exit(bilan("PAIEMENTS (prestataire FAUX, base simulée)", R) ? 1 : 0);
