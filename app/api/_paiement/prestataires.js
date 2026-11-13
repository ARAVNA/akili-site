// ═══════════════════════════════════════════════════════════════════
// Registre des prestataires de paiement.
//
// Le dossier « api/_paiement » commence par un souligné : Vercel ne
// l'expose pas comme route publique.
//
// Un prestataire = un objet { id, actif(env), verifier(brut, entetes, secret, maintenant), analyser(brut) }.
//   - verifier : vrai UNIQUEMENT si la signature est valide et récente.
//   - analyser : extrait { eventId, commandeId, statut, montant, devise } du corps.
//     Le plan et l'entreprise ne sont JAMAIS lus dans le corps : ils viennent
//     de la commande enregistrée en base.
//
// Aucune intégration réelle n'existe. Pour en ajouter une (Orange Money, Wave,
// MTN, Moov, carte, PayPal…) : créer un module équivalent à « faux.js » en
// suivant la documentation signée du prestataire, l'ajouter ci-dessous, et
// écrire ses tests AVANT toute mise en production.
// ═══════════════════════════════════════════════════════════════════
import { faux } from "./faux.js";

export const PRESTATAIRES = { [faux.id]: faux };

export const trouver = (id, env = process.env) => {
  const p = PRESTATAIRES[String(id || "").toLowerCase()];
  if (!p || !p.actif(env)) return null;
  return p;
};
