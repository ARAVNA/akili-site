# Lot A — Résultats (branche `lot-a-securite`)

Preuves = tests reproductibles dans `app/tests/`. **Aucune anomalie n'est « CORRIGÉE » : ce sont des corrections de code et de SQL validées sur une base PostgreSQL SIMULÉE et dans Chrome local. Rien n'a été testé sur Supabase réel.**

| # | Anomalie | Statut | Ce qui est fait | Preuve | Reste à faire |
|---|---|---|---|---|---|
| 3 | Plan Enterprise / paiement | PARTIELLEMENT CORRIGÉ | Plan lu sur `organizations` (avec échéance) ; commande créée côté serveur (prix et entreprise venant du serveur) ; webhook à signature HMAC, anti-rejeu, montant/devise vérifiés ; seul `appliquer_paiement` (service_role) modifie le plan ; faux prestataire désactivé en production | `paiements-test.mjs` 18/18 | Choisir et brancher un vrai prestataire (signature, conditions techniques), lier la commande à son checkout, tester sur akili-test |
| 4 | Anciennes données `org_id` | PARTIELLEMENT CORRIGÉ | (lot précédent) rattrapage non destructif `org_id = compte` | `legacy-orgid-test.mjs` 7/7 | Compter les lignes réelles (diagnostic 13) |
| 6 | Secrets exposés au bundle | PARTIELLEMENT CORRIGÉ | Garde-fous de build (noms de variables, jetons service_role, valeurs des secrets, sources maps) | `garde-fous-test.mjs` 13/13 ; build réel OK | Vérifier les variables réelles dans Vercel |
| 12 | Journalisation | PARTIELLEMENT CORRIGÉ | Paie/RH/profils : noms de colonnes seulement ; contenus et images exclus ; une panne du journal ne bloque plus l'opération ; fonction de purge préparée **en commentaire** | `integrite-test.mjs` (audit) | Restreindre la lecture aux administrateurs (rôles) ; décider et planifier la rétention |
| 14 | `user_id` falsifiable | PARTIELLEMENT CORRIGÉ | Déclencheur : auteur = utilisateur connecté, immuable | `documents-db-test.mjs` 22/22 | Lecture des documents par rôle (rôles) |
| 15 | Clés primaires globales | PARTIELLEMENT CORRIGÉ | Phase 1 additive (index unique) + application en `onConflict org_id,id` + phase 2 (clé primaire) avec garde-fous (NULL, clés étrangères) | `integrite-test.mjs`, `documents-db-test.mjs` | Exécuter dans l'ordre prévu sur akili-test puis prod |
| 18 | Prompt système côté navigateur | PARTIELLEMENT CORRIGÉ | Prompt dans `api/ia.js` ; tout `system` du client ignoré | `api-xss-test.mjs` 25/25 | Vérification sur préversion |
| 19 | Alertes npm | PARTIELLEMENT CORRIGÉ | `supabase-js` 2.45.4 → 2.119.0 ; `vite` 5.4.21 | `npm audit --omit=dev` : 0 ; build + parcours Chrome OK | 3 alertes résiduelles **outil de développement seulement** (vite/esbuild, correctif = vite 8, non appliqué) ; tester l'authentification réelle avec la nouvelle version sur akili-test |
| 20 | Keepalive Netlify | PARTIELLEMENT CORRIGÉ | `/api/keepalive` + cron Vercel quotidien, protégé par `CRON_SECRET` | `keepalive-test.mjs` 5/5 | Définir `CRON_SECRET`, vérifier une exécution réelle, puis arrêter Netlify (rien n'est supprimé du dépôt) |
| 22 | « BroadcastChannel » / source maps | CORRIGÉ (décision documentée) | C'est en réalité le canal **Realtime Supabase** : il ne sert que de déclencheur, les données sont relues via l'API protégée par RLS (aucune donnée lue dans le message). Source maps : désactivées et le build échoue s'il en existe | code + `garde-fous-test.mjs` | Vérifier que Realtime respecte la RLS sur akili-test |
| 23 | Mode démo en production | PARTIELLEMENT CORRIGÉ | Le build de production échoue sans variables Supabase | `garde-fous-test.mjs` | — |
| 24 | Code mort profils | CORRIGÉ | Supprimé | build + parcours | — |
| **25 (nouvelle)** | Données (compta, paie, chat) laissées dans `localStorage` après déconnexion | PARTIELLEMENT CORRIGÉ | Purge à la déconnexion (mode connecté) | `api-xss-test.mjs` | Les copies restent présentes **pendant** la session et si le navigateur est fermé sans déconnexion ; durcir (chiffrement / ne plus mettre en cache) avec les rôles |

## Non traités dans ce lot (dépendent de décisions ou de l'infrastructure)
- **13 Rôles et permissions** : matrice à valider (`MATRICE-PERMISSIONS-PROPOSEE.md`) avant implémentation.
- **16 Plafond IA par utilisateur** : étudié, non implémenté. Option recommandée : table `ai_usage_user(org_id, user_id, month, count)` + incrément atomique côté serveur + plafond = quota entreprise ÷ membres au minimum configurable ; dépend de la table des membres/rôles.
- **1, 2, 5, 7, 8, 9, 10, 11, 17, 21** : infrastructure réelle (Supabase, Vercel, GitHub) ; voir `ENVIRONNEMENT-TEST-ET-DEPLOIEMENT.md`.
