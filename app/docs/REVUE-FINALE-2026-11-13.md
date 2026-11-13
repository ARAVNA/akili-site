# AKILI ERP — Revue finale de sécurité avant fusion

Date : 13/11/2026 · Branche `fix/lighthouse-securite` · **Rien fusionné, rien déployé, aucune migration lancée, aucune donnée ni aucun secret touché.**

> **AKILI ERP n'est PAS déclaré sécurisé.** Le code et les scripts SQL tiennent sur une **simulation** PostgreSQL. La vraie base Supabase, Vercel et les secrets GitHub n'ont **pas** pu être contrôlés depuis cet environnement. Rédigé par l'assistant qui a écrit les correctifs : indépendance limitée.

## A. Ce qui a été testé, et où

| Environnement | Ce qui y a été fait |
|---|---|
| **PostgreSQL simulé** (PGlite : vrai moteur Postgres, rôles anon/authenticated/service_role recréés, droits par défaut Supabase reproduits) | matrice RLS (485), privilèges (55), rejeu des SQL (15), documents (14), restauration simulée avec vrai `pg_dump` (17), données anciennes (7) |
| **Chrome + serveur local** émulant `vercel.json` (Supabase absent ou factice) | XSS/API IA/CSV (24), CSP (0 violation), parcours 10/10 + parcours inscription/IA/graphiques |
| **Dépôt GitHub** (API REST, lecture seule) | paramètres du dépôt, historique Git (20 commits, 5 références) |
| **Vraie base Supabase** | **RIEN.** Aucun accès. |
| **Vercel** | **RIEN.** Aucun accès. |
| **Secrets / variables GitHub Actions** | **Inaccessibles** (le proxy refuse ce chemin). |

## B. Fichiers SQL : peut-on les exécuter sur la base actuelle sans risque ?

**Réponse honnête : non prouvé. Ni perte de données, ni suppression — mais d'autres risques ne sont levés qu'après le diagnostic ci-dessous.**

Ce qui est établi (code relu intégralement + tests) :
- Aucun `DROP TABLE/SCHEMA/COLUMN`, `DELETE`, `TRUNCATE`, ni `UPDATE` de données dans les deux fichiers (recherche automatique ; seuls `drop policy`/`drop trigger` : 16, pour les recréer). Les `ON DELETE CASCADE` (profil→compte, mouvements→stock) ne jouent que lors de suppressions **futures**.
- Sur une copie simulée « ancien état » avec données : empreinte MD5 des lignes **identique** après migration (hors colonnes ajoutées `src`, `tva`, `piece`, `doc_type`, `doc_client`), et identique après une seconde exécution.
- Les deux scripts sont maintenant **transactionnels** (`begin/commit`) : une erreur annule tout.
- Fonctions SECURITY DEFINER : 4 (`mon_org`, `creer_profil`, `journaliser`, `incrementer_quota_ia`), `search_path=public` fixé, exécution retirée à `public`/`anon`.

Corrigé pendant cette revue :
1. **Données anciennes invisibles** (risque ÉLEVÉ découvert) : l'ancienne application rangeait les données avec `org_id = identifiant du compte`. Le rattrapage créait une entreprise à identifiant aléatoire → ces lignes seraient devenues invisibles (non supprimées, mais inaccessibles). Le rattrapage donne désormais à l'entreprise l'identifiant du compte. Test : 7/7.
2. `supabase-schema.sql` n'était pas transactionnel et son en-tête affirmait « ne détruit rien » alors qu'il retire des droits et remplace des politiques : en-tête corrigé.
3. Section ROLLBACK trompeuse (« rejouer le schéma restaure l'ancien état » : faux) : réécrite.

Risques restants **non levés** (cause : prod non consultée) :
- **Politiques anciennes cumulatives** : dans Postgres les politiques permissives s'additionnent. Si la vraie base contient une ancienne politique large (ex. `USING (true)`) sous un autre nom, nos scripts ne la suppriment pas et l'isolation serait faussée.
- **Structure réelle de `organizations`/`profiles`** inconnue (relevé du 24/10 s'arrêtant à `employes`) : un écart de colonnes ferait échouer le script (annulé proprement).
- **Droits retirés à `anon`** : tout usage anonyme existant de ces 18 tables cesserait (limité à ces tables nommées ; le keepalive Netlify recevra « permission denied »).
- Déclencheur `on_auth_user_created` remplacé : un autre déclencheur d'inscription existant ferait doublon.
- Doublons dans `ai_quotas (org_id, month)` : l'index unique échouerait (annulation propre).

➡ **`supabase-diagnostic-lecture-seule.sql`** (SELECT uniquement, testé sur 3 états simulés) répond à tous ces points en une exécution. Envoyez-moi son résultat avant toute migration.

## C. Tableau final

| # | Contrôle effectué | Résultat | Preuve disponible | Risque restant | Action nécessaire |
|---|---|---|---|---|---|
| 1 | RLS réelle de la base Supabase | **NON VÉRIFIÉ** | aucune (pas d'accès) | **CRITIQUE** : politique ancienne large possible | Lancer le diagnostic SQL, me transmettre le résultat |
| 2 | Sauvegarde avant migration | **Inexistante** | docs/SAUVEGARDE-RESTAURATION.md §1 | **CRITIQUE** si SQL lancé sans sauvegarde | Faire la sauvegarde §1 avant tout |
| 3 | Isolation 2 entreprises × 4 utilisateurs + anonyme | Conforme (simulation) | `rls-matrix.mjs` 485/485 | Simulation ≠ Supabase (pas PostgREST) | Refaire 2 comptes de test sur prévisualisation |
| 4 | Modification directe `org_id`/rôle/plan/quota | Bloquée (simulation) | matrice + `privileges.mjs` 55/55 | idem | idem |
| 5 | SECURITY DEFINER, droits, TRUNCATE | Conforme (simulation) | `privileges.mjs` | `creer_profil` exécuté par `supabase_auth_admin` : non vérifié (FAIBLE) | Tester une inscription réelle sur prévisualisation |
| 6 | Données anciennes (org_id = compte) | **Corrigé**, conforme (simulation) | `legacy-orgid-test.mjs` 7/7 | **ÉLEVÉ** tant que le diagnostic n'a pas compté ces lignes en prod | Diagnostic contrôle 13 |
| 7 | SQL rejouables, sans perte | Conforme (simulation) | `replay.mjs` 15/15, MD5 identique | Prod inconnue (voir §B) | Diagnostic puis exécution après sauvegarde |
| 8 | Restauration d'une sauvegarde | **Simulée seulement** | `restore-drill.mjs` 17/17 | **ÉLEVÉ** : restauration réelle jamais faite | Section 2 de la procédure, sur base jetable |
| 9 | Secrets dans le code et l'historique Git | **Aucun trouvé** | 20 commits, 5 références, 9 motifs (JWT, `sk-ant-`, `sbp_`, GitHub, AWS, Stripe, clés privées, mots de passe, service_role) : 0 occurrence | Recherche par motifs, pas un audit exhaustif | Faire tourner une clé si doute |
| 10 | Variables Vercel (dont `SUPABASE_SERVICE_ROLE_KEY`) | **NON VÉRIFIÉ** | aucune | **ÉLEVÉ** : clé serveur mal placée = accès total | Vérifier dans Vercel : clé service_role **uniquement** côté serveur, jamais en `VITE_*`/`NEXT_PUBLIC_*` |
| 11 | Secrets GitHub Actions / accès / webhooks | **NON VÉRIFIÉ** (proxy bloque) | aucun workflow dans le dépôt | MOYEN | Vérifier Settings → Secrets, collaborateurs, webhooks |
| 12 | Paramètres GitHub | Secret scanning **activé**, push protection **activée** ; `main` **non protégée** ; Dependabot **désactivé** | API REST | **ÉLEVÉ** (`main` non protégée) / MOYEN | Protéger `main`, activer Dependabot |
| 13 | XSS (24 vecteurs), CSV, API IA | Conforme | `api-xss-test.mjs` 24/24 ; ancien code : 22/24 exécutaient du code | MOYEN : jamais testé avec un vrai Supabase connecté | Parcourir l'app sur la prévisualisation |
| 14 | CSP | 0 violation en Report-Only (7 pages) | script `csp` local | MOYEN : pas en production, pas bloquante | Après 1–2 semaines de rapports propres, passer en blocage |
| 15 | Fonctionnel : inscription, connexion, tableau de bord, graphiques, chat IA, XSS | Conforme **en mode local** | parcours Chrome 10/10 + flow | **MOYEN** : connexion/rôles/organisations/documents **avec vrai Supabase non testés de bout en bout** | Liste de contrôle manuelle ci-dessous |
| 16 | Plan Enterprise | **Limitation constatée** : l'écran lit `profiles.plan` (colonne inexistante) et « Changer de plan » n'écrit plus rien en base | lecture du code | MOYEN : l'offre Enterprise n'est pas gérée côté base ; le quota IA serveur lit bien `organizations.plan` | Décider du circuit d'activation (paiement → serveur) |
| 17 | Journal d'audit | Fonctionne (simulation) | tests | MOYEN : croît sans purge (500 Mo gratuits), copie les données de paie, lisible par tous les membres de l'entreprise ; une erreur du déclencheur bloquerait l'écriture | Purge/rétention ; restreindre par rôle |
| 18 | Rôles fins, `user_id` falsifiable, clé primaire globale `documents`/`achats` | Non corrigés | tests `documents-db-test` | MOYEN | Voir TRAVAUX-RESTANTS.md |
| 19 | 2FA, limitation des tentatives de connexion | Non faits | — | **ÉLEVÉ** (force brute) | TRAVAUX-RESTANTS.md |
| 20 | `supabase-js`/npm audit | 2 alertes faibles non traitées | `npm audit` | FAIBLE | Mise à jour testée à part |
| 21 | Keepalive Netlify | Recevra « permission denied » ; réveil de la base supposé, non vérifié | code | FAIBLE | Vérifier après migration ; migrer vers Vercel |
| 22 | Mentions légales : hébergeur | Remplacé par Vercel Inc. (adresse non vérifiée) | diff | FAIBLE | Vérifier l'adresse |

## D. Vérification manuelle sur la prévisualisation Vercel (après sauvegarde et migration sur une base de TEST)

1. Inscription d'un compte A et d'un compte B (deux entreprises) → connexion → chacun voit un tableau vide.
2. A crée un client, une facture, une fiche de paie ; B ne les voit pas (recharger la page, vérifier aussi le chat IA).
3. Export CSV : ouvrir dans Excel un nom commençant par `=` : il doit s'afficher en texte.
4. Chat IA : message `<img src=x onerror=alert(1)>` → affiché tel quel. Quota : le compteur augmente de 1 par question.
5. Un ancien compte (données d'avant migration) retrouve ses données.
6. Journal d'audit : une écriture crée une ligne ; une tentative de modification de `org_id` par A échoue.

## E. Ordre d'action recommandé (rien n'est fait sans votre autorisation écrite)

1. Sauvegarde réelle (§1 de la procédure). 2. Diagnostic SQL en lecture seule → me transmettre le résultat. 3. Migration sur une base de **test** (copie restaurée = aussi le test de restauration n°8). 4. Vérifier Vercel (variables) et GitHub (secrets, protection de `main`). 5. Liste §D sur la prévisualisation. 6. Votre autorisation écrite → fusion → migration sur la production.
