// ═══════════════════════════════════════════════════════════════════
// Création d'une commande d'abonnement — POST /api/paiement-commande   { plan }
//
// L'entreprise vient du compte authentifié, le prix du serveur : le navigateur
// ne fournit que le NOM du plan voulu. La commande ne change PAS le plan ; seul
// un paiement confirmé par signature (api/paiement-webhook) le fait.
// Tant qu'aucun prestataire réel n'est validé, la route répond « indisponible »
// (le faux prestataire n'est actif que hors production).
// ═══════════════════════════════════════════════════════════════════
import { rep, configure, identifier, sbSvc } from "./_commun.js";
import { PRESTATAIRES } from "./_paiement/prestataires.js";

// Prix en FCFA par mois — source de vérité côté serveur (à tenir alignée sur l'offre commerciale).
const PRIX = { business: 15000, enterprise: 50000 };
const DEVISE = "XOF";

export default async function handler(req, res) {
  if (req.method !== "POST") return rep(res, 405, { error: "Méthode non autorisée." });
  if (!configure()) return rep(res, 503, { error: "Service non configuré." });

  const prestataire = Object.values(PRESTATAIRES).find((p) => p.actif(process.env));
  if (!prestataire) return rep(res, 503, { error: "Le paiement en ligne n'est pas encore disponible. Contactez AFRICAViT pour activer votre offre." });

  const qui = await identifier(req);
  if (!qui.uid) return rep(res, qui.code, { error: qui.error });

  const plan = String(req.body?.plan || "");
  if (!Object.hasOwn(PRIX, plan)) return rep(res, 400, { error: "Offre inconnue." });

  const r = await sbSvc("commandes_paiement", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ org_id: qui.orgId, plan, montant: PRIX[plan], devise: DEVISE, prestataire: prestataire.id, cree_par: qui.uid }),
  }).catch(() => null);
  if (!r?.ok) return rep(res, 500, { error: "Commande impossible." });
  const [c] = await r.json();
  return rep(res, 201, { commande_id: c.id, plan, montant: c.montant, devise: c.devise, expire_le: c.expire_le });
}
