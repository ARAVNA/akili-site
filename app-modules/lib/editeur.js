// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Identité de l'éditeur
// Référence UNIQUE : toute mention légale de l'application lit ici.
// Si une information change (nouveau siège, nouveau gérant), elle se
// corrige à cet endroit et nulle part ailleurs.
//
// Source : mentions légales publiées sur www.africavit.com
// ═══════════════════════════════════════════════════════════════════

export const EDITEUR = {
  nom:      "AFRICAViT SARL",
  capital:  "10 000 000 FCFA",
  rccm:     "CI-ABJ-03-2026-B12-06782",
  ncc:      "2606664 R",
  idu:      "CI-2026-0076905 F",
  siege:    "Cocody-Angré, Lot 4527, Abidjan, Côte d'Ivoire",
  tel:      "+225 27 22 35 33 27",
  whatsapp: "+225 05 74 19 97 60",
  email:    "contact@africavit.com",
  site:     "www.africavit.com",
  produit:  "AKILI ERP",
  marques:  "AKILI ERP et IVOORIA sont des marques et produits d'AFRICAViT SARL.",
  droit:    "Droit ivoirien — tribunaux d'Abidjan exclusivement compétents.",
  hebergeur:"Netlify, Inc. — San Francisco, États-Unis",
};

// Ligne compacte à poser en pied de page ou sur un document généré.
export const mentionCourte = () =>
  `${EDITEUR.nom} · RCCM ${EDITEUR.rccm} · NCC ${EDITEUR.ncc} · ${EDITEUR.site}`;

// Note de bas de page à injecter dans chaque devis, facture ou contrat
// produit par l'IA. C'est elle qui rend le caractère indicatif opposable.
export const noteDocument = () =>
  `Document généré par ${EDITEUR.produit} — ${EDITEUR.nom} (RCCM ${EDITEUR.rccm}) ` +
  `à titre indicatif. À faire valider par un professionnel qualifié avant tout usage ` +
  `juridique, comptable ou fiscal.`;

export default EDITEUR;
