# Sauvegarde et restauration — AKILI ERP

**État constaté** : le dépôt ne contient aucune procédure ni tâche de sauvegarde. Le projet Supabase est en offre gratuite, qui ne propose pas de sauvegardes automatiques téléchargeables. Une suppression ou une corruption de données serait donc irréversible. À vérifier dans Supabase → Database → Backups.

## 1. Sauvegarder (à faire AVANT toute migration SQL, puis chaque semaine)

Supabase → Settings → Database → *Connection string* (mode « Session pooler »). Le mot de passe de la base ne doit jamais être écrit dans un fichier du dépôt.

```bash
# Depuis un ordinateur avec PostgreSQL installé (pg_dump)
export DB_URL="postgresql://…"            # à saisir dans le terminal, jamais commité
pg_dump "$DB_URL" --schema=public --no-owner --no-privileges -Fc -f akili_$(date +%F).dump
```

- Conserver au moins 4 sauvegardes, **hors** de Supabase (disque chiffré + un second emplacement).
- Les comptes (schéma `auth`) : Supabase → Authentication → Users permet un export ; sans eux, les profils restaurés n'ont plus de compte associé.

## 2. Restaurer

1. Créer un projet Supabase vierge (ne jamais restaurer directement sur la production la première fois).
2. Exécuter `supabase-schema.sql` puis `supabase-securite.sql`.
3. `pg_restore --data-only --no-owner -d "$DB_URL_NOUVEAU" akili_AAAA-MM-JJ.dump`
4. Vérifier : le nombre de lignes par table, puis la requête de vérification en bas de `supabase-securite.sql` (aucune table ne doit afficher « RLS ABSENTE »).
5. Pointer `VITE_SUPABASE_URL` et la clé publique vers le nouveau projet, redéployer.

## 3. Tester la restauration

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Faire un essai complet sur un projet vierge **avant** de passer aux clients payants (fin de la phase de test : 21 novembre 2026).

## 4. Retour arrière du code

- Tag Git `avant-corrections-2026-11-13` = état exact avant ces corrections.
- Vercel → Deployments → choisir le déploiement précédent → *Promote to Production* (instantané, sans toucher à la base).
- Retour arrière SQL : section ROLLBACK en bas de `supabase-securite.sql`.
