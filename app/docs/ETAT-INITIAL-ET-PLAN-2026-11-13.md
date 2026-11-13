# AKILI ERP — Étape 1 : état initial documenté et plan de correction

Date : 13/11/2026 · Branche `fix/lighthouse-securite` · **Aucune modification de la base réelle, du code ou des paramètres lors de cette étape.** Aucun secret n'apparaît dans ce document (seuls des noms de variables).

## 1. État initial (inventaire)

| Point | Constat |
|---|---|
| Dépôt | App React/Vite : `src/App.jsx` (2 855 lignes, monolithique), `Graphiques.jsx`, une route serveur `api/ia.js` (201 lignes), 5 pages statiques, `vercel.json`. Aucun workflow GitHub Actions. Dépôt **public**. |
| Migrations | Deux fichiers seulement : `supabase-schema.sql`, `supabase-securite.sql` (+ diagnostic en lecture seule). Pas de dossier `supabase/migrations`, pas de versionnage. |
| Schéma réel | Relevé du 24/10 **incomplet** (arrêté à `employes`). `organizations`, `profiles`, `fournisseurs`, `signatures`, stocks, paie : existence en production non confirmée. |
| Tables utilisées par l'app | 14 tables métier via une couche `Store` ; `profiles` (3 usages), `ai_quotas`, `taux_change` en direct. |
| RLS / GRANT | Définis dans les deux scripts (voir REVUE-FINALE). **État réel de la base : inconnu.** |
| SECURITY DEFINER | 4 : `mon_org`, `creer_profil`, `journaliser`, `incrementer_quota_ia` (`search_path=public`, exécution restreinte). |
| Déclencheurs | `on_auth_user_created` (auth.users), `akili_audit` sur 11 tables. |
| RPC appelées | `incrementer_quota_ia` (serveur seul, `service_role`). |
| Authentification | Supabase Auth : inscription, connexion, déconnexion, réinitialisation, changement de mot de passe. **Pas de MFA, pas de CAPTCHA.** Mot de passe ≥ 8 caractères à l'inscription. |
| Rôles | **Aucun.** `role:"admin"` est codé en dur dans l'interface ; la colonne `profiles.role` (défaut `admin`) n'est lue nulle part. |
| Plans | `PLANS` codé dans l'interface (starter…enterprise). Le plan lu vient de `profiles.plan` (inexistant) ; le serveur lit `organizations.plan`. **Aucun paiement, aucun webhook.** |
| Variables d'environnement (noms) | Navigateur : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ variantes `NEXT_PUBLIC_*`). Serveur (`api/ia.js`) : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (+ variantes). Seule la clé publique `anon` est lue par le code navigateur ; `SUPABASE_SERVICE_ROLE_KEY` n'apparaît dans aucun fichier du navigateur. **Valeurs réelles dans Vercel : non vérifiées.** |
| Données sensibles | Paie (`fiches_paie`), RH (`employes`), comptabilité, `documents.content`, signatures (image), e-mails. Aujourd'hui lisibles par tous les membres d'une entreprise. |
| Secrets | Historique Git (20 commits, 5 références) : aucun motif de secret. |
| Dépendances | `supabase-js 2.45.4` (2 alertes **faibles**, `auth-js`, correctif = montée de version), react 18.3.1, recharts 2.12.7, vite 5.4.8. |
| GitHub | Secret scanning + push protection activés ; `main` non protégée ; Dependabot désactivé. |

### Nouvelles anomalies découvertes pendant l'inventaire
- **23 — MOYEN : mode démo local sans mot de passe.** Si `VITE_SUPABASE_*` manque au moment du build, l'application bascule silencieusement en mode local : « inscription/connexion » sans mot de passe, données dans le navigateur (`localStorage`). Un client croirait enregistrer ses données, elles resteraient sur son téléphone. → refuser de démarrer en production sans Supabase, ou bandeau « DÉMO » bien visible.
- **24 — FAIBLE : code mort** `profiles.insert({id,email,name})` (colonne `name` inexistante, droit retiré) : échec ignoré. À supprimer.

## 2. Ce que je peux faire seul, et ce qui exige l'infrastructure réelle

**Règle appliquée à vos exigences :** une anomalie ne passe à CORRIGÉ qu'avec une preuve **sur un environnement Supabase réel isolé**. Mes tests PGlite (PostgreSQL simulé) donnent au mieux **PARTIELLEMENT CORRIGÉ**.

| Lot | Contenu | Ce dont j'ai besoin |
|---|---|---|
| **0. Prérequis** | Environnement de test isolé | Vous créez un **second projet Supabase gratuit** « akili-test » (aucune donnée client). Vous saisissez vous-même ses clés dans Vercel (Preview) : **jamais dans le chat**. |
| **A. Code + SQL + tests simulés** (sans toucher à la prod) | Anomalies 3, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24 | Vos décisions (§4) |
| **B. Contrôles sur l'infrastructure réelle** | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 17 | Votre action dans les tableaux de bord (Supabase, Vercel, GitHub) ou une autorisation écrite précise pour que j'agisse par l'API GitHub |

## 3. Plan par anomalie

| # | Anomalie | Plan | Lot | Preuve visée | Statut honnête visé à l'issue du lot A |
|---|---|---|---|---|---|
| 1 | RLS/droits réels | Diagnostic SQL sur la base réelle (lecture seule), puis comparaison avec la matrice attendue ; matrice RLS rejouée sur « akili-test » | B | résultat du diagnostic + matrice sur Supabase réel | non corrigé tant que B non fait |
| 2 | Sauvegardes | Procédure rédigée ; exécution réelle + empreintes + restauration sur base jetable | B | fichiers, empreintes, comptage identique | partiel |
| 3 | Plan Enterprise / paiement | UI lit `organizations.plan` (lecture seule) ; table `evenements_paiement` (identifiant unique de l'événement = anti-rejeu) ; route serveur `api/paiement-webhook` : vérification de signature HMAC sur le corps brut, comparaison à temps constant, tolérance d'horodatage, idempotence, seule écriture de `organizations.plan` via fonction réservée au `service_role` ; journal des activations | A (+B avec le vrai prestataire) | tests : signature falsifiée refusée, rejeu sans double activation, navigateur impossible | partiel (prestataire réel non branché) |
| 4 | Anciennes données `org_id` | Requêtes de correspondance (lecture seule) : lignes dont `org_id` ≠ aucune entreprise ; **aucune attribution par supposition** : migration seulement pour les correspondances exactes avec un compte ; le reste listé pour décision humaine | A (+B pour le comptage réel) | listes avant/après, MD5 | partiel |
| 5 | Restauration | Essai réel sur base jetable | B | comptage + RLS après restauration | non corrigé |
| 6 | Vercel | Liste de contrôle ; garde-fou à la construction : le build **échoue** si une variable `VITE_*` contient « service_role » ou si le bundle contient la clé ; test du bundle | A (garde-fou) + B (variables réelles) | analyse du bundle ; vous confirmez les variables | partiel |
| 7 | GitHub | Protéger `main` (revue obligatoire), activer Dependabot + alertes + mises à jour | B | réponse de l'API / capture | non corrigé |
| 8 | Authentification | Paramètres Supabase Auth (limites, CAPTCHA Turnstile, durée de session, MFA TOTP) ; code : écran d'activation MFA pour administrateurs, délai croissant après échecs, message neutre à la connexion | A (code) + B (paramètres) | tests sur « akili-test » | partiel |
| 9 | Secrets Actions/collaborateurs/webhooks | Contrôle dans les paramètres GitHub | B | liste des noms (sans valeurs) | non corrigé |
| 10 | Tests réels Supabase | Parcours automatisé (Playwright) contre « akili-test » : inscription, connexion, 2 entreprises, rôles, documents, achats | B | rapport RAPPORT-TESTS-RLS.md | non corrigé |
| 11 | CSP effective | Collecte des violations sur la préversion réelle, puis passage en blocage sur la préversion ; production après validation | B | 0 violation sur le parcours réel | non corrigé |
| 12 | Journalisation | Rétention (purge > 12 mois, tâche planifiée), suppression des champs inutiles (contenu des documents, e-mails), lecture réservée aux administrateurs, déclencheur **non bloquant** (exception interceptée) | A | tests simulés (écriture réussit même si l'audit échoue) | partiel |
| 13 | Rôles et permissions | Rôles : administrateur, gestionnaire, comptable, RH, utilisateur ; fonction `mon_role()` ; politiques RLS par table (paie/RH : RH + administrateur ; comptabilité : comptable + administrateur + gestionnaire ; etc.) ; changement de rôle réservé à l'administrateur par fonction serveur ; masquage dans l'interface en complément (jamais seul) | A | matrice rôles × tables × opérations | partiel |
| 14 | `user_id` des documents | `user_id` forcé à `auth.uid()` (déclencheur + politique) ; lecture selon le rôle | A | tests | partiel |
| 15 | Clés primaires globales | Clé `(org_id, id)` sur `documents` et `achats` : migration non destructive sur copie d'abord ; contrôle des références | A (+B : vérifier les dépendances réelles) | tests + comptage | partiel |
| 16 | Quotas IA | Quota entreprise conservé ; plafond par utilisateur optionnel (table + incrément atomique côté serveur) ; le compteur client reste cosmétique | A | tests de contournement | partiel |
| 17 | `creer_profil` / `supabase_auth_admin` | Inscription réelle sur « akili-test » | B | profil créé | non corrigé |
| 18 | Prompt système côté navigateur | Déplacer le prompt dans `api/ia.js` ; le navigateur n'envoie que les messages | A | test API : prompt client ignoré | partiel |
| 19 | npm (2 alertes) | Montée de `supabase-js` vers la version corrigée, testée (parcours, build) | A | `npm audit` propre + tests | partiel |
| 20 | Keepalive Netlify | Remplacer par une tâche planifiée Vercel (cron) ou GitHub Actions ; arrêter Netlify **après** vérification | A + B | exécution réelle | partiel |
| 21 | Adresse légale | Vous confirmez l'adresse de Vercel Inc. | B | — | à confirmer |
| 22 | BroadcastChannel / source maps | Réexamen documenté ; décision | A | — | corrigé si décision documentée |
| 23 | Mode démo local | Échec explicite en production sans Supabase | A | test de build | partiel |
| 24 | Code mort profils | Suppression | A | non-régression | corrigé après tests |

## 4. Décisions dont j'ai besoin (avant le lot A)

1. **Prestataire de paiement** : lequel ? (Stripe, CinetPay, PayDunya, Wave, Orange Money, Flutterwave, autre). La vérification de signature dépend de lui. Sans choix, je construis une couche neutre (HMAC) testée avec un prestataire simulé, mais **aucun paiement réel ne sera possible**.
2. **Rôles** : valider la matrice proposée (je vous la présente avant de coder) ; qui est « administrateur » : le créateur du compte ?
3. **Environnement de test** : acceptez-vous de créer le projet Supabase « akili-test » ?
4. **GitHub** : voulez-vous que j'essaie de protéger `main` par l'API (autorisation écrite) ou le faire vous-même dans Settings → Branches ?

## 5. Règles tenues
Aucune migration en production ; sauvegarde vérifiée obligatoire avant ; aucune désactivation de RLS ; secrets jamais copiés ; résultats non inventés ; **aucune anomalie déclarée corrigée sur simulation seule**.
