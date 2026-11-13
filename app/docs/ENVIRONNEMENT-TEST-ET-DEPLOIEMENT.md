# Environnement de test « akili-test » et ordre de déploiement

Aucune donnée réelle de client dans akili-test. Les clés sont saisies **par vous** dans Vercel : ne les écrivez jamais dans le chat, un fichier du dépôt ou un rapport.

## 1. Créer akili-test (vous, dans Supabase)
1. supabase.com → New project → nom **akili-test** (offre gratuite, région proche).
2. Project Settings → API : noter l'URL, la clé « anon public » et la clé « service_role » (à ne jamais exposer).
3. Authentication → Providers → Email : laisser la confirmation par e-mail activée ; Authentication → Rate limits : laisser les valeurs par défaut (voir TRAVAUX-RESTANTS pour le renforcement).

## 2. Variables Vercel — environnement **Preview** uniquement (noms seulement)
| Variable | Rôle | Exposée au navigateur ? |
|---|---|---|
| `VITE_SUPABASE_URL` | URL d'akili-test | oui (publique) |
| `VITE_SUPABASE_ANON_KEY` | clé anon d'akili-test | oui (publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé serveur d'akili-test | **non** — jamais préfixée VITE_ / NEXT_PUBLIC_ |
| `ANTHROPIC_API_KEY` | IA (peut être une clé à faible plafond) | **non** |
| `PAIEMENT_FAUX_ACTIF` = `1` | active le faux prestataire | non (ignoré en production) |
| `PAIEMENT_SECRET_FAUX` | secret de signature du faux prestataire (chaîne aléatoire de test) | **non** |
| `CRON_SECRET` | protège `/api/keepalive` | **non** |

En **Production** : ne PAS définir `PAIEMENT_FAUX_ACTIF`. Le build échoue si une variable `VITE_*`/`NEXT_PUBLIC_*` a un nom de secret ou si le bundle contient une clé serveur (`scripts/garde-fous.mjs`).
⚠ Attention : si une variable existante de la production s'appelle p. ex. `NEXT_PUBLIC_…TOKEN`, le build refusera de passer : renommez-la (le garde-fou protège, il ne fuit rien).

## 3. Préparer la base akili-test (SQL Editor, dans cet ordre)
Les tables métier de base (clients, ecritures, documents, employes, achats, ai_quotas, efactures, comptes_tresorerie, crm_leads) doivent d'abord exister avec la structure du relevé `SCHEMA-REEL.md` (à reproduire dans akili-test, par exemple en restaurant une sauvegarde **de la structure seule** de la production : `pg_dump --schema-only`). Puis :
1. `supabase-schema.sql` 2. `supabase-securite.sql` 3. `supabase-paiements.sql` 4. `supabase-integrite.sql`
5. (après déploiement de l'application et vérification) `supabase-integrite-phase2.sql`
6. `supabase-diagnostic-lecture-seule.sql` → doit montrer RLS partout, aucun droit `anon`, aucune politique inattendue.

## 4. Ordre de déploiement en PRODUCTION (après votre autorisation écrite, sauvegarde vérifiée)
1. Sauvegarde réelle + test de restauration (docs/SAUVEGARDE-RESTAURATION.md).
2. Diagnostic en lecture seule sur la production ; examen du résultat ensemble.
3. Scripts 1 à 4 ci-dessus (additifs, transactionnels). L'ancienne application continue de fonctionner.
4. Déployer l'application (merge → Vercel). Vérifier : inscription, facture, achat, chat IA.
5. Seulement ensuite : `supabase-integrite-phase2.sql`.
6. Vérifier `/api/keepalive` (journal Vercel, 200) puis seulement alors arrêter le projet Netlify hérité (aucun fichier supprimé du dépôt sans votre accord).
