// ═══════════════════════════════════════════════════════════════════
// Notification de paiement (webhook) — POST /api/paiement-webhook?p=<prestataire>
//
// Seule porte par laquelle organizations.plan peut changer. Chaîne de
// contrôles, dans cet ordre, sans exception :
//   1. méthode POST ; corps limité à 64 Ko ;
//   2. prestataire connu ET actif ; secret présent (sinon échec fermé) ;
//   3. signature HMAC valide et récente, calculée sur le corps BRUT ;
//   4. corps lisible, événement « réussi » ;
//   5. fonction SQL appliquer_paiement : vérifie la commande (montant, devise,
//      prestataire, validité), refuse les rejeux (event_id unique).
// Les réponses ne détaillent jamais la raison d'un refus au prestataire.
// ═══════════════════════════════════════════════════════════════════
import { trouver } from "./_paiement/prestataires.js";

export const config = { api: { bodyParser: false } };

const SB_URL = () => process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_SVC = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_OCTETS = 64 * 1024;

const lireBrut = async (req) => {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  const morceaux = []; let total = 0;
  for await (const m of req) {
    total += m.length;
    if (total > MAX_OCTETS) throw Object.assign(new Error("trop gros"), { code: 413 });
    morceaux.push(m);
  }
  return Buffer.concat(morceaux).toString("utf8");
};

const rep = (res, code, corps) => { res.setHeader("Cache-Control", "no-store"); return res.status(code).json(corps); };

export default async function handler(req, res) {
  if (req.method !== "POST") return rep(res, 405, { error: "Méthode non autorisée." });

  const id = String(req.query?.p || new URL(req.url, "http://x").searchParams.get("p") || "");
  const prestataire = trouver(id);
  if (!prestataire) return rep(res, 404, { error: "Inconnu." });

  const secret = process.env[`PAIEMENT_SECRET_${prestataire.id.toUpperCase()}`];
  if (!secret || !SB_URL() || !SB_SVC()) return rep(res, 503, { error: "Non configuré." });

  let brut;
  try { brut = await lireBrut(req); }
  catch (e) { return rep(res, e.code === 413 ? 413 : 400, { error: "Corps invalide." }); }
  if (Buffer.byteLength(brut) > MAX_OCTETS) return rep(res, 413, { error: "Corps trop gros." });

  if (!prestataire.verifier(brut, req.headers || {}, secret)) {
    console.error("paiement: signature refusée", prestataire.id);
    return rep(res, 401, { error: "Signature invalide." });
  }

  const ev = prestataire.analyser(brut);
  if (!ev || !ev.eventId || !/^[0-9a-f-]{36}$/i.test(ev.commandeId) || !Number.isFinite(ev.montant)) {
    return rep(res, 400, { error: "Événement illisible." });
  }
  // Un événement authentique mais non « réussi » (échec, annulation) est acquitté sans effet.
  if (ev.statut !== "reussi") return rep(res, 200, { resultat: "ignore" });

  let resultat;
  try {
    const r = await fetch(`${SB_URL()}/rest/v1/rpc/appliquer_paiement`, {
      method: "POST",
      headers: { apikey: SB_SVC(), Authorization: `Bearer ${SB_SVC()}`, "content-type": "application/json" },
      body: JSON.stringify({ p_prestataire: prestataire.id, p_event_id: ev.eventId, p_commande: ev.commandeId, p_montant: ev.montant, p_devise: ev.devise }),
    });
    if (!r.ok) { console.error("paiement: rpc", r.status); return rep(res, 500, { error: "Traitement impossible." }); }
    resultat = await r.json();
  } catch (e) {
    console.error("paiement: rpc", e?.message);
    return rep(res, 500, { error: "Traitement impossible." });
  }
  // 'active' et 'deja_traite' : succès (le prestataire ne doit pas réessayer). 'refuse' : 200 aussi
  // (rejouer ne changerait rien) mais sans activation ; le motif est dans evenements_paiement.
  if (resultat === "refuse") console.error("paiement: événement authentique REFUSÉ (voir evenements_paiement)", prestataire.id);
  return rep(res, 200, { resultat: typeof resultat === "string" ? resultat : "inconnu" });
}
