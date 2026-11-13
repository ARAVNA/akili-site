# Sauvegarde et restauration — AKILI ERP

**État constaté** : aucune sauvegarde n'existe dans le dépôt ; le projet Supabase est en offre gratuite (pas de sauvegarde téléchargeable automatique, à confirmer dans Supabase → Database → Backups). **Aucune restauration réelle n'a été faite.** Seule la logique a été simulée (`tests/restore-drill.mjs`, 17/17, vrai `pg_dump` sur PostgreSQL simulé).

## 1. Sauvegarder la vraie base (à faire AVANT tout SQL, puis chaque semaine)

Prérequis : un ordinateur (pas le téléphone) avec les outils PostgreSQL 17 (`pg_dump`, `pg_restore`, `psql`). Vérifiez la version du serveur : `psql "$DB_URL" -c "select version()"` ; `pg_dump` doit être de version **égale ou supérieure**.

1. Supabase → Connect → *Session pooler* → copier la chaîne de connexion. Dans le terminal : `read -s DB_URL` puis coller (le mot de passe ne s'affiche pas et n'est écrit dans aucun fichier).
2. **Photographier l'état** (nombres de lignes) :
   ```bash
   psql "$DB_URL" -At -c "select 'public.'||relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by 1" > etat_avant.txt
   psql "$DB_URL" -At -c "select count(*) from auth.users" >> etat_avant.txt
   ```
   (Pour un comptage exact, `select count(*)` table par table ; `n_live_tup` est une estimation.)
3. **Sauvegarde du schéma public (structure + données)** :
   ```bash
   pg_dump "$DB_URL" --schema=public --no-owner --no-privileges -Fc -f akili_public_$(date +%F).dump
   ```
4. **Sauvegarde des comptes** (sans eux, les profils n'ont plus de compte) :
   ```bash
   pg_dump "$DB_URL" --data-only --inserts --table=auth.users --table=auth.identities -f akili_auth_$(date +%F).sql
   ```
   Ce fichier contient des e-mails et des empreintes de mots de passe : **le chiffrer** (ex. `gpg -c`) et ne jamais le mettre sur GitHub.
5. **Empreinte** : `sha256sum akili_*.dump akili_*.sql > empreintes.txt`.
6. **Copier hors de Supabase** : disque chiffré + second emplacement. Garder 4 sauvegardes.
7. Complément rapide depuis le téléphone : Supabase → Table Editor → *Export to CSV* des tables clés (ecritures, documents, fiches_paie, clients). C'est un dépannage, pas une sauvegarde complète.

## 2. Vérifier que la sauvegarde est exploitable

Une sauvegarde jamais restaurée n'est pas une sauvegarde.
1. `pg_restore -l akili_public_*.dump | grep -c "TABLE DATA"` doit afficher au moins 15 ; `sha256sum -c empreintes.txt` doit répondre OK.
2. **Restaurer sur une base jetable** (Postgres 17 local via Docker, ou un second projet Supabase gratuit — jamais la production) :
   ```bash
   docker run -d --name test-restore -e POSTGRES_PASSWORD=essai -p 5433:5432 postgres:17
   ```
   puis suivre la section 3 sur cette base.
3. Comparer `etat_avant.txt` avec les mêmes requêtes sur la base jetable : mêmes nombres de lignes.
4. Lancer `supabase-diagnostic-lecture-seule.sql` sur la base restaurée : aucune table « SANS RLS », droits conformes.
5. Se connecter à l'application branchée sur la base jetable avec deux comptes de deux entreprises : chacun ne voit que ses données.

Consigner la date et le résultat. **Tant que ces 5 points n'ont pas été faits sur le vrai Supabase, la restauration est « non validée ».**

## 3. Restaurer (sur un projet vierge ; jamais d'abord sur la production)

Ordre validé en simulation (c'est l'ordre qui compte : le dump charge les données **avant** de créer les déclencheurs, sinon le déclencheur d'inscription fabrique des entreprises vides et le journal d'audit se duplique) :
1. Projet vierge. Exécuter `akili_auth_AAAA-MM-JJ.sql` (comptes).
2. `pg_restore --no-owner --schema=public -d "$DB_URL_NOUVEAU" akili_public_AAAA-MM-JJ.dump` (si `public` existe déjà et fait échouer l'import : ajouter `--clean --if-exists` **uniquement sur ce projet vierge**).
3. **Rejouer `supabase-schema.sql` puis `supabase-securite.sql`** : ils recréent le déclencheur d'inscription et **referment les droits**. Obligatoire, car un dump `--no-privileges` ne conserve pas les REVOKE (constaté : TRUNCATE et accès anonyme réapparaissent).
4. Vérifier (section 2, points 3 à 5). Seulement ensuite : pointer `VITE_SUPABASE_URL` et la clé publique vers le nouveau projet et redéployer.

## 4. Retour arrière

- Code : tag Git `avant-corrections-2026-11-13` ; Vercel → Deployments → déploiement précédent → *Promote to Production* (sans toucher à la base).
- SQL : les deux scripts sont **transactionnels** (tout ou rien). Après coup, la section ROLLBACK de `supabase-securite.sql` ne sert qu'en urgence : elle **réintroduit les failles**. Le vrai filet de sécurité est la sauvegarde du §1.
