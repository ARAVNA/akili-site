# AKILI ERP — Rapport de corrections et d'audit (13 novembre 2026)

Périmètre : dépôt `ARAVNA/akili-site` (dossier `app/`), branche `fix/lighthouse-securite`. Aucune clé, aucun mot de passe ni jeton n'a été lu, copié ou affiché ; les tests utilisent des valeurs factices.

> **AKILI ERP ne peut pas être déclaré « sécurisé ».** Les failles ci-dessous sont corrigées et prouvées par test, mais des points essentiels n'ont pas pu être vérifiés (section « Non vérifié »).

## 1. Vulnérabilités et défauts

| # | Gravité | Constat | Fichiers | Preuve avant |
|---|---|---|---|---|
| 1 | **Critique** | Un utilisateur peut modifier `profiles.org_id` et se rattacher à l'entreprise d'un autre (lecture/écriture de toute sa comptabilité, paie comprise), s'il en connaît l'identifiant. | `supabase-schema.sql` | Test T5 : accepté |
| 2 | **Haute** | Un utilisateur peut modifier son `role`. | idem | T6 : accepté |
| 3 | **Haute** | Tout membre peut se donner `plan = enterprise` (offre payante gratuite). | idem | T7 : accepté |
| 4 | **Haute** | XSS : le chat affichait le texte saisi ou renvoyé par l'IA en HTML non échappé (`dangerouslySetInnerHTML`). | `src/App.jsx` | Chrome : `onerror` exécuté, `alert()` déclenché |
| 5 | Moyenne | Tout membre peut remettre son quota IA à zéro. | `supabase-schema.sql` | T8 : 29 → 0 |
| 6 | Moyenne | `/api/ia` ouvert si la clé serveur Supabase manque : aucun contrôle d'entreprise ni de quota. | `api/ia.js` | Lecture du code + test |
| 7 | Moyenne | Pendant la phase de test, aucun plafond : un compte détourné peut consommer le crédit Anthropic. | `api/ia.js` | Lecture du code |
| 8 | Moyenne | Rejouer `supabase-schema.sql` (annoncé « sans risque ») recréait les anciennes règles faibles. | `supabase-schema.sql` | Test de rejeu |
| 9 | Moyenne | Aucun journal d'audit : aucune traçabilité des opérations. | — | Absent |
| 10 | Moyenne | **Fonction cassée** : `appelIA()` supprimée par erreur (commit 851234e). L'assistant IA et la génération de documents affichaient « appelIA is not defined ». | `src/App.jsx` | Chrome |
| 11 | Faible | `/api/ia` lisait seulement `VITE_SUPABASE_URL`, alors que le projet Vercel porte `NEXT_PUBLIC_SUPABASE_URL`. | `api/ia.js` | Lecture du code |
| 12 | Faible | Mot de passe : 6 caractères minimum ; incrément de quota non atomique. | `src/App.jsx`, `api/ia.js` | Lecture du code |
| 13 | Faible | Aucun en-tête de sécurité (clickjacking, sniffing, politique de référent). | `vercel.json` | Absent |
| 14 | Info | Les rôles (`profiles.role`) ne sont utilisés par aucune règle : pas de contrôle d'accès par rôle. Sans impact aujourd'hui (une entreprise = un compte), à traiter avant d'inviter des collaborateurs. | — | — |

## 2. Corrections appliquées (commits sur la branche)

- **SQL** : `supabase-schema.sql` sûr par défaut ; `supabase-securite.sql` (nouveau) : droits par colonne sur `profiles`/`organizations`, `ai_quotas` en lecture seule, `incrementer_quota_ia`, `journal_audit` alimenté par déclencheurs, fonctions verrouillées. Idempotent (exécuté 3 fois + schéma rejoué).
- **App** : HTML échappé dans le chat, `appelIA` restaurée, mot de passe ≥ 8 à l'inscription (la connexion reste permissive pour les comptes existants).
- **API** : échec fermé, plafond de 500 requêtes/mois en phase de test, quota atomique avec repli, variables `NEXT_PUBLIC_*` acceptées.
- **Lighthouse** : `robots.txt` et `sitemap.xml` réels ; `/` sert désormais la vitrine (voir ci-dessous) ; `<noscript>` ; `<main>` ; contrastes (boutons, rouge, doré, gris de la vitrine) ; ordre des titres ; graphiques en `React.lazy` ; adresses `akili.africavit.com` remplacées ; `og:url` et canonique ; `/app` en `noindex`.
- **Cause racine du « 0 mot »** : sur Vercel un fichier existant passe avant les rewrites. `dist/index.html` (l'application) masquait donc la règle `/ → accueil.html`. `scripts/postbuild.mjs` renomme l'application en `app.html`.
- **En-têtes** : nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, et une CSP en **mode rapport seul** (voir limites).
- **Décisions volontaires** : source maps laissées désactivées (aucun code exposé ; passer à `hidden` seulement avec un outil d'erreurs) ; `BroadcastChannel`/`WebLocks` viennent de supabase-js (synchronisation entre onglets) et ne sont pas modifiés (gain faible, risque réel) ; `netlify.toml` relu : les redirections ne touchent que l'ancien domaine et la fonction keepalive, aucune modification nécessaire.

## 3. Tests et résultats (avant → après)

| Test | Avant | Après |
|---|---|---|
| RLS sur PostgreSQL réel (PGlite), 2 entreprises, 14 scénarios communs | 10/14 (T5–T8 en échec) | 14/14 ; 21/21 avec journal d'audit et quotas |
| XSS dans Chrome (même charge utile) | exécutée | neutralisée, gras Markdown conservé |
| Assistant IA | `appelIA is not defined` | appel `/api/ia` rétabli |
| API `/api/ia` (services simulés) | — | 12/12 |
| Mot de passe de 7 caractères | accepté | refusé |
| robots.txt / sitemap.xml | 404 (HTML en production) | texte / XML valides |
| `/` : mots visibles dans le HTML | 12 | page complète (vitrine) |
| Lighthouse local mobile, page d'accueil : accessibilité | 96 | 100 |
| Lighthouse local, JS inutilisé / transfert au chargement | 559 Ko / 732 Ko | 0 Ko / 54 Ko (vitrine) ; app : 375 Ko |

Mesures locales (Chrome headless, serveur émulant `vercel.json`), pas sur le site en ligne. Reproduire : `app/tests/README.md`.

## 4. Non vérifié — à contrôler

- **Base Supabase en production** : je n'y ai pas accès. Les règles réelles peuvent différer du fichier SQL, et des tables absentes de sa liste peuvent être sans RLS. Après exécution du SQL, la requête de fin de `supabase-securite.sql` doit n'afficher aucune table « RLS ABSENTE ».
- **Variables Vercel, secrets GitHub, configuration Netlify** : non consultables. Dépôt public : aucune clé trouvée dans les 17 commits (recherche de motifs, pas un scan exhaustif).
- **Comportement de `/` sur Vercel** : déduit de l'audit en ligne (0 mot, titre de l'application) et d'une émulation ; à confirmer sur l'aperçu Vercel de la branche.
- **CSP** en rapport seul : à passer en mode bloquant après vérification de la console sur l'aperçu (la vitrine charge Font Awesome et Google Fonts ; `guide.html` utilise des `onclick` en ligne).
- **CSRF** : non applicable par conception (jeton `Authorization`, pas de cookie) — raisonnement, non testé. **Injection SQL** : aucune requête brute ; tout passe par supabase-js/PostgREST ; aucune faille trouvée à la lecture.
- **Sauvegardes** : aucune n'existe dans le dépôt ; voir `docs/SAUVEGARDE-RESTAURATION.md`.
- Hors périmètre : double authentification, longueur minimale et mots de passe compromis côté Supabase (Authentication → Policies), limitation des tentatives de connexion, prompt `system` encore fourni par le navigateur (borné à 8 000 caractères et au quota).
