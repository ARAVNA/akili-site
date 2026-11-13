# Tests de sécurité

Aucune dépendance ajoutée au projet : on installe à la demande, sans modifier package.json.

```bash
cd app
npm i --no-save @electric-sql/pglite

# Règles RLS sur un vrai PostgreSQL (PGlite) : isolation entre entreprises,
# verrouillage de profiles/organizations/ai_quotas, journal d'audit.
node tests/rls-test.mjs apres .        # attendu : 21/21 conformes

# XSS du chat + route /api/ia (services simulés, aucune clé réelle).
node tests/api-xss-test.mjs            # attendu : 12/12 conformes
```

## Tests ajoutés (validation avant fusion)

Installation (sans modifier package.json) :
`npm i --no-save @electric-sql/pglite @electric-sql/pglite-tools playwright-core`

- `node tests/rls-matrix.mjs apres` — matrice 2 entreprises × 4 utilisateurs + anonyme (`avant` = ancien schéma)
- `node tests/privileges.mjs apres` — fonctions SECURITY DEFINER, droits, RLS
- `node tests/replay.mjs` — rejouabilité des SQL, aucune perte de données
- `node tests/documents-db-test.mjs` — isolation des documents, collisions d'id
- `node tests/api-xss-test.mjs` — XSS (Chrome), API IA, CSV
- `node tests/restore-drill.mjs` — sauvegarde/restauration simulée (pg_dump)

Ces tests simulent Supabase ; ils ne remplacent pas une vérification sur le vrai projet.
