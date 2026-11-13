# Matrice des permissions proposée (À VALIDER — rien n'est implémenté)

L = lire · E = créer/modifier · S = supprimer · — = aucun accès · (propres) = uniquement ses propres lignes
Appliquée **dans les politiques RLS** et dans les fonctions serveur ; l'interface ne fait que masquer.

| Ressource | Propriétaire | Administrateur | Gestionnaire | Comptable | Resp. RH | Employé |
|---|---|---|---|---|---|---|
| Coordonnées de l'entreprise | L E | L E | L | L | L | L |
| Plan / abonnement (lecture) | L | L | L | L | L | L |
| Plan / paiement (écriture) | serveur seul (webhook) | — | — | — | — | — |
| Membres et rôles | L E S (tous rôles, transfert de propriété) | L E S (sauf Propriétaire et Administrateur) | L (noms) | L (noms) | L (noms) | L (son profil) |
| Clients, prospects (CRM) | L E S | L E S | L E S | L | — | L |
| Fournisseurs | L E S | L E S | L E | L E | — | — |
| Achats | L E S | L E S | L E | L E | — | — |
| Stocks, mouvements | L E S | L E S | L E S | L | — | L |
| Projets | L E S | L E S | L E S | L | — | L |
| Documents (factures, devis…) | L E S | L E S | L E | L E | — | L E (propres) |
| Factures électroniques | L E S | L E S | L | L E | — | — |
| Écritures comptables, trésorerie, taux | L E S | L E S | L | L E (pas de suppression d'écriture validée) | — | — |
| Fiches RH (employés) | L E S | L E S | — | — | L E S | — |
| **Fiches de paie** | L E S | L E S | — | L (comptabilisation) | L E S | — |
| Signatures | L E S | L E S | L E | L E | L (propres) | L (propres) |
| Quota IA (lecture) | L | L | L | L | L | L |
| Utilisation de l'assistant IA | oui | oui | oui | oui | oui | oui (plafond par utilisateur possible) |
| Journal d'audit | L | L | — | — | — | — |
| Export complet / sauvegarde | oui | oui | — | — | — | — |

## Règles transversales
- Le créateur de l'organisation est **Propriétaire** (un seul par organisation). Seul lui peut nommer un Administrateur ou transférer la propriété.
- Un utilisateur ne peut **jamais** modifier son propre rôle, son organisation, son plan ou son quota ; un changement de rôle passe par une fonction serveur qui contrôle le rôle de l'appelant.
- Le dernier Propriétaire ne peut ni être supprimé ni rétrogradé.
- Les données de paie et de RH ne sont jamais copiées en clair dans le journal d'audit (seuls identifiants et noms des colonnes modifiées).
- Comptes existants : chacun devient Propriétaire de sa propre entreprise (cohérent avec l'état actuel : une entreprise par compte).

## Points à trancher
1. Le **comptable** peut-il lire les fiches de paie (proposé : oui, lecture seule) ?
2. Le **gestionnaire** voit-il un annuaire du personnel sans salaires (proposé : non, pour l'instant) ?
3. L'**employé** ne voit-il que ses propres documents (proposé : oui) ?
4. Une personne peut-elle appartenir à plusieurs entreprises (proposé : non, une seule, comme aujourd'hui) ?
5. Les invitations de collaborateurs : par e-mail avec rôle imposé à l'avance (proposé).
