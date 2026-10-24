# Schéma réel de la base Supabase `akili.erp`

Relevé le 24 octobre 2026 depuis `information_schema.columns`.
Projet : `phwefeudkkbzknxdjktb` · région europe-west1 · palier Free.

**Ce document fait foi.** L'application doit écrire dans ces tables, et non
dans une table générique. Toute divergence entre ce fichier et le code est
un bug du code.

---

## Observation d'architecture

Toutes les tables portent `org_id uuid` : le cloisonnement se fait par
organisation, pas par utilisateur. C'est le bon choix — il permet à
plusieurs collaborateurs d'une même entreprise de partager les données,
ce qu'exige l'offre Entreprise annoncée sur le site.

Les identifiants sont en `uuid` partout, sauf `achats.id` et `documents.id`
qui sont en `text` — vraisemblablement parce que ces deux-là portent des
numéros lisibles (FAC-2026-0001) plutôt que des identifiants techniques.

---

## Tables relevées

### achats
| colonne | type |
|---|---|
| id | text |
| org_id | uuid |
| fournisseur_id | uuid |
| fournisseur | text |
| montant | numeric |
| description | text |
| statut | text |
| date | text |
| created_at | timestamptz |

### ai_quotas
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| month | text |
| count | integer |

Quota par **organisation** et par mois — pas par utilisateur. Ma route
serveur `/api/ia` compte par utilisateur : à corriger.

### clients
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| nom | text |
| secteur | text |
| statut | text |
| ca | numeric |
| tel | text |
| email | text |
| note | text |
| created_at | timestamptz |

Correspond exactement au module Clients de l'application.

### comptes_tresorerie
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| nom | text |
| type | text |
| solde_initial | numeric |
| devise | text |
| created_at | timestamptz |

Plusieurs comptes de trésorerie avec devise : banque, caisse, Mobile Money.
L'application n'a aucun écran pour cela aujourd'hui.

### crm_leads
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| nom | text |
| entreprise | text |
| email | text |
| tel | text |
| statut | text |
| valeur | numeric |
| source | text |
| notes | text |
| created_at | timestamptz |

Prospects distincts des clients, avec valeur et source. Module absent de
l'application.

### documents
| colonne | type |
|---|---|
| id | text |
| org_id | uuid |
| user_id | uuid |
| type | text |
| client | text |
| montant | numeric |
| devise | text |
| content | text |
| created_at | timestamptz |
| statut_paiement | text |
| date_echeance | date |
| docusign_envelope_id | text |
| docusign_status | text |
| nif_client | text |
| rccm_client | text |
| adresse_client | text |
| montant_ht | numeric |
| tva | numeric |
| montant_tva | numeric |
| lignes | text |

Bien plus riche que le module Documents de l'application : suivi du
paiement, échéance, **intégration DocuSign réelle**, identifiants fiscaux
du client, décomposition HT / TVA / TTC et lignes de détail.

### ecritures
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| date | text |
| libelle | text |
| compte | text |
| debit | numeric |
| credit | numeric |
| piece | text |
| created_at | timestamptz |
| journal | text |

Presque identique à ma structure d'écritures, **avec en plus `journal`** —
qui permet de séparer journal des ventes, des achats, de banque et des
opérations diverses, comme l'exige l'OHADA. Il me manque cette colonne.

Il manque en revanche une colonne de source (`src`) pour relier une
écriture à la pièce qui l'a engendrée. Sans elle, impossible de remplacer
proprement les écritures d'une facture modifiée sans créer de doublon.

### efactures
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| numero | text |
| date_emission | date |
| date_echeance | date |
| client_nom | text |
| client_adresse | text |
| client_nif | text |
| client_rccm | text |
| lignes | jsonb |
| montant_ht | numeric |
| montant_tva | numeric |
| montant_ttc | numeric |
| statut | text |
| nif_emetteur | text |
| rccm_emetteur | text |
| notes | text |
| created_at | timestamptz |

**Facturation électronique** conforme aux exigences DGI : identifiants
fiscaux de l'émetteur et du destinataire, lignes structurées en `jsonb`,
décomposition HT/TVA/TTC. C'est l'atout concurrentiel le plus sérieux de
tout le projet, et l'application ne l'exploite pas du tout.

### employes
| colonne | type |
|---|---|
| id | uuid |
| org_id | uuid |
| nom | text |
| poste | text |
| type_contrat | text |
| salaire_brut | numeric |
| departement | text |
| date_entree | text |
| tel | text |
| email | text |
| conges_restants | integer |

Correspond au module RH, avec en plus le département et le solde de congés.

---

## Tables non encore relevées

Le relevé s'est arrêté à `employes` (ordre alphabétique). Restent à
confirmer, d'après les requêtes enregistrées visibles dans la console :
`fournisseurs`, `organizations`, `profiles`, `signatures`, et
vraisemblablement les stocks, les mouvements et les fiches de paie.

---

## Écarts entre l'application et cette base

| Sujet | Base | Application |
|---|---|---|
| Rangement | Tables relationnelles typées | Blocs JSON dans une table unique |
| Cloisonnement | `org_id` partout | Mélange d'`org` et d'`user` |
| Quotas IA | Par organisation | Par utilisateur |
| Journaux comptables | Colonne `journal` | Absente |
| Lien pièce → écriture | Absent | Colonne `src` |
| Facturation électronique | Table `efactures` complète | Inexistante |
| DocuSign | Colonnes de suivi | Signature simple maison |
| Trésorerie multi-comptes | Table dédiée | Compte 521 en dur |
| Prospects CRM | Table `crm_leads` | Inexistante |

La base est en avance sur l'application. C'est elle qui doit servir de
référence.
