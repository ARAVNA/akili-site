# AKILI ERP — Travaux restants

## Demandés
1. **Double authentification (2FA)** — activer le MFA TOTP de Supabase Auth ; l'imposer aux administrateurs d'abord. Tester la récupération de compte.
2. **Limitation des tentatives de connexion** — réglages Auth de Supabase (limites par IP) + délai croissant côté application + alerte sur échecs répétés ; ajouter un CAPTCHA (Turnstile/hCaptcha) à l'inscription et à la connexion.
3. **Rôles fins des collaborateurs** — utiliser la colonne `role` : administrateur / comptable / RH / lecture seule ; politiques RLS par rôle (ex. fiches de paie réservées RH et administrateur) ; imposer `user_id = auth.uid()` à l'insertion ; interface de gestion des rôles.

## Sécurité
4. Valider la production (RLS réelle, droits, variables Vercel, secrets GitHub) ; faire tourner les clés si doute.
5. Sauvegarde réelle + test de restauration (passer au plan Pro ou planifier un pg_dump hebdomadaire hors Supabase).
6. Protéger `main` (revue obligatoire), activer Dependabot et l'analyse des secrets GitHub.
7. Passer la CSP en mode bloquant après 1 à 2 semaines de rapports propres.
8. Mettre à jour `supabase-js` et traiter les alertes npm (test séparé).
9. Déplacer le prompt système côté serveur.
10. Clé primaire par entreprise (`org_id, id`) pour `documents`/`achats`.
11. Politique de mot de passe côté Supabase (longueur ≥ 8, protection contre mots de passe divulgués).
12. Décider du sort du projet Netlify hérité (keepalive) : le migrer vers une tâche planifiée Vercel puis le fermer.
