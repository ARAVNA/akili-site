# AKILI ERP — Rapport de validation de sécurité (avant fusion)

Date : 13/11/2026 · Branche : `fix/lighthouse-securite` · Rien n'est fusionné, rien n'est déployé, la base Supabase réelle n'a pas été touchée.

> **Indépendance limitée.** Ce rapport est rédigé par l'assistant qui a aussi écrit les correctifs. Les tests sont reproductibles (`app/tests/`), mais un relecteur humain ou externe reste souhaitable.
>
> **AKILI ERP n'est PAS déclaré sécurisé.** Les contrôles côté production (section 3) ne sont pas faits. Ce qui est démontré ici : sur une **simulation** PostgreSQL (PGlite), les correctifs tiennent.

## 1. Résultats des tests (reproductibles)

| Test | Avant correctifs | Après |
|---|---|---|
| Matrice RLS : 2 entreprises, 4 utilisateurs (A1, A2, B1, B2) + anonyme, 19 tables, SELECT/INSERT/UPDATE/DELETE/upsert/TRUNCATE | 418/476 (échecs : profiles, organizations, ai_quotas, TRUNCATE partout) | **485/485** |
| Privilèges, fonctions SECURITY DEFINER, RLS (`privileges.mjs`) | non conforme | **55/55** |
| Rejeu des SQL, migration depuis l'ancien état, sans perte de données (`replay.mjs`) | — | **15/15** |
| Documents : lecture/écriture/suppression inter-entreprises, collisions d'id (`documents-db-test.mjs`) | collisions d'id dans 38 % des séries de 100 | **14/14**, 0 collision sur 300 000 ids |
| XSS, API IA, CSV (`api-xss-test.mjs`) | 22/24 vecteurs XSS exécutaient du code (Chrome) | **24/24**, 0 exécution |
| Sauvegarde / restauration simulée avec vrai `pg_dump` (`restore-drill.mjs`) | — | **12/12** |
| CSP en Report-Only, 7 pages, Chrome | 2 violations (guide.html) | **0 violation** |
| Lighthouse local / parcours | accueil accessibilité 96, JS inutilisé 559 Ko | 100, 0 Ko ; parcours 10/10 |

## 2. Réponse point par point

1. **Quatre failles critiques** (changer son `org_id`, son rôle/plan Enterprise, son quota IA ; XSS du chat) : corrigées dans le code et dans les politiques/GRANT par colonne ; vérifiées en simulation. Corrections de plus trouvées : TRUNCATE ouvert à `anon`/`authenticated` (droits par défaut Supabase), injection de formules CSV, collisions d'id.
2. **Deux entreprises, accès croisés** : 485 tentatives, toutes refusées ou sans effet.
3. **Modification directe** de `org_id`, rôle, plan, quota : bloquée (GRANT UPDATE limité aux colonnes `nom`, `cgu_acceptees_le` ; quota en lecture seule, incrément par fonction réservée au `service_role`).
4. **SECURITY DEFINER** : 4 fonctions, `search_path=public` fixé ; `creer_profil`, `journaliser`, `incrementer_quota_ia` exécutables par personne sauf `service_role` ; `mon_org` par `authenticated` seulement ; aucune politique `USING (true)`.
5. **Secrets GitHub, variables Vercel, clés Supabase** : **non consultables d'ici.** Dépôt public : aucune clé trouvée dans l'historique (recherche de motifs, pas un scan exhaustif). `/api/ia` refuse de fonctionner sans `SUPABASE_SERVICE_ROLE_KEY`.
6. **Rejouabilité** : les deux SQL rejoués dans n'importe quel ordre donnent la même empreinte de sécurité et conservent les données ; aucune instruction destructive.
7. **Restauration** : procédure validée **en simulation** (tables identiques ligne à ligne, droits identiques, RLS opérante). Piège confirmé : restaurer sans neutraliser les déclencheurs corrompt les données ; un dump `--no-privileges` ne rétablit pas les REVOKE → rejouer `supabase-securite.sql` après toute restauration. **Restauration réelle sur Supabase : non faite.** Le plan gratuit n'a pas de sauvegarde automatique ; aucune sauvegarde n'existe à ce jour.
8. **XSS / API IA / documents** : voir tableau. L'API ne peut pas être détournée (modèle, `max_tokens`, `org_id` figés ; 20 messages, 24 000 caractères max ; erreurs amont non renvoyées).
9. **CSP** : 0 violation en Report-Only sur 7 pages (build local, Supabase factice). Non testé : écrans connectés avec un vrai Supabase, comportement réel sur Vercel. **Ne pas passer en mode bloquant avant 1 à 2 semaines de rapports propres en production.**
10. Ce rapport.

## 3. NON validé (à faire avant de parler de « sécurisé »)

- Politiques RLS et droits **réels** de la base Supabase (et tables hors schéma du dépôt).
- Variables Vercel, secrets GitHub, clés Supabase (rotation recommandée si une clé a déjà été exposée).
- Sauvegarde et restauration réelles.
- Comportement réel de `/` et des en-têtes sur Vercel (prévisualisation à ouvrir).
- Mise à jour de `supabase-js` (alertes npm faibles) à tester séparément.
- Simulation ≠ Supabase : PGlite n'est ni PostgREST, ni GoTrue, ni Realtime.

## 4. Limites connues (non corrigées)

Clé primaire globale sur `documents`/`achats` (atténuée par des ids aléatoires) · `user_id` falsifiable au sein d'une même entreprise · pas de rôles fins (colonne `role` inutilisée) · les collaborateurs d'une entreprise voient tous les documents de celle-ci · prompt système envoyé depuis le navigateur · branche `main` non protégée, alertes Dependabot désactivées · CSP encore en Report-Only.

## 5. Ordre recommandé

1. Exporter une sauvegarde manuelle de la base (pg_dump / Supabase). 2. Exécuter `supabase-schema.sql` puis `supabase-securite.sql`. 3. Ouvrir la prévisualisation Vercel et dérouler les parcours. 4. Vérifier les variables Vercel (`SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement). 5. Vous autorisez la fusion.

Note : `mentions-legales.html` indiquait Netlify comme hébergeur ; remplacé par Vercel Inc. — à vérifier par vous.
