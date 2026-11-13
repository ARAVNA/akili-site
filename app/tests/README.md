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
