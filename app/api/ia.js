// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Route serveur pour l'IA
//
// Pourquoi cette route existe. Avant, l'application appelait
// api.anthropic.com directement depuis le navigateur. Trois problèmes :
//
//   1. La clé Anthropic aurait dû voyager dans le code de la page :
//      n'importe quel visiteur la lisait et consommait votre crédit.
//   2. Anthropic refuse les appels venus d'un navigateur.
//   3. Les quotas étaient comptés dans le navigateur, donc contournables
//      en deux clics par quiconque sait ouvrir la console.
//
// Ici, la clé reste sur le serveur, l'identité de l'appelant est
// vérifiée auprès de Supabase, et le quota est décompté côté serveur.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   ANTHROPIC_API_KEY           secret, JAMAIS préfixé NEXT_PUBLIC_/VITE_
//   SUPABASE_SERVICE_ROLE_KEY   secret, contourne RLS
//   VITE_SUPABASE_URL           déjà présente pour l'application
//   ANTHROPIC_MODEL             facultatif
// ═══════════════════════════════════════════════════════════════════

const SB_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_KEY  = process.env.ANTHROPIC_API_KEY;
const MODEL   = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

// Phase de test annoncée publiquement sur akili.africavit.com.
// Tant qu'elle dure, aucun quota ne s'applique.
const PHASE_TEST_FIN = new Date("2026-11-21T23:59:59Z");
const enPhaseTest = () => new Date() <= PHASE_TEST_FIN;

const QUOTAS = { starter: 30, business: 150, enterprise: 999 };

// Garde-fous indépendants du quota mensuel : ils limitent ce qu'une
// seule requête peut coûter, même pendant la phase gratuite.
const MAX_TOKENS   = 1200;
const MAX_MESSAGES = 20;
const MAX_CARACT   = 24000;

const json = (res, code, corps) => res.status(code).json(corps);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée." });

  if (!AI_KEY)  return json(res, 500, { error: "Service IA non configuré (clé Anthropic absente côté serveur)." });
  if (!SB_URL)  return json(res, 500, { error: "Service IA non configuré (URL Supabase absente)." });

  // ── 1. Qui appelle ? ──
  const jeton = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return json(res, 401, { error: "Connectez-vous pour utiliser l'assistant IA." });

  let utilisateur;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jeton}`, apikey: SB_SVC || jeton },
    });
    if (!r.ok) return json(res, 401, { error: "Session expirée. Reconnectez-vous." });
    utilisateur = await r.json();
  } catch {
    return json(res, 503, { error: "Vérification de session impossible. Réessayez." });
  }
  const uid = utilisateur?.id;
  if (!uid) return json(res, 401, { error: "Session invalide." });

  // ── 2. Quelle offre, et quel quota restant ? ──
  const maintenant = new Date();
  const cleQuota = `q_${maintenant.getUTCMonth()}_${maintenant.getUTCFullYear()}`;
  const scope = `user:${uid}`;
  let plan = "starter", utilises = 0;

  if (SB_SVC) {
    const sbGet = (chemin) =>
      fetch(`${SB_URL}/rest/v1/${chemin}`, {
        headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    const profils = await sbGet(`profiles?id=eq.${uid}&select=plan`);
    if (Array.isArray(profils) && profils[0]?.plan) plan = profils[0].plan;

    const lignes = await sbGet(`akili_stores?scope=eq.${encodeURIComponent(scope)}&key=eq.${cleQuota}&select=data`);
    if (Array.isArray(lignes) && lignes[0]?.data?.count) utilises = Number(lignes[0].data.count) || 0;
  }

  const plafond = QUOTAS[plan] || QUOTAS.starter;
  if (!enPhaseTest() && utilises >= plafond) {
    return json(res, 429, {
      error: `Quota IA épuisé pour ce mois (${plafond} requêtes incluses dans l'offre ${plan}).`,
      quota: { plan, utilises, plafond, restant: 0 },
    });
  }

  // ── 3. La demande ──
  const { system, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return json(res, 400, { error: "Aucune question transmise." });

  const propres = messages
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CARACT) }));
  if (!propres.length) return json(res, 400, { error: "Message vide." });

  // ── 4. L'appel à Anthropic, avec la clé qui ne quitte jamais le serveur ──
  let reponse;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...(typeof system === "string" && system ? { system: system.slice(0, 8000) } : {}),
        messages: propres,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // On ne renvoie jamais l'erreur brute d'Anthropic au navigateur :
      // elle peut contenir des détails de configuration.
      const lisible =
        r.status === 429 ? "L'assistant est très sollicité. Réessayez dans un instant."
      : r.status === 401 ? "Clé Anthropic invalide — à corriger dans les variables Vercel."
      : "L'assistant n'a pas pu répondre. Réessayez.";
      console.error("Anthropic", r.status, d?.error?.message || "");
      return json(res, r.status === 429 ? 429 : 502, { error: lisible });
    }
    reponse = d?.content?.[0]?.text;
    if (!reponse) return json(res, 502, { error: "Réponse vide de l'assistant." });
  } catch (e) {
    console.error("Anthropic", e?.message);
    return json(res, 503, { error: "Assistant injoignable. Vérifiez votre connexion." });
  }

  // ── 5. Décompte du quota, après succès seulement ──
  // Échouer ici ne doit pas priver l'utilisateur de sa réponse : elle est
  // déjà payée. On journalise et on continue.
  if (SB_SVC) {
    try {
      await fetch(`${SB_URL}/rest/v1/akili_stores`, {
        method: "POST",
        headers: {
          apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}`,
          "content-type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          scope, key: cleQuota,
          data: { count: utilises + 1 },
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (e) { console.error("quota", e?.message); }
  }

  return json(res, 200, {
    texte: reponse,
    quota: {
      plan, utilises: utilises + 1, plafond,
      restant: enPhaseTest() ? null : Math.max(0, plafond - utilises - 1),
      phaseTest: enPhaseTest(),
    },
  });
}
