# AKILI ERP — Application

Le logiciel qui tourne sur **akilierp.africavit.com**. React + Vite,
authentification et données **Supabase**.

Édité par **AFRICAViT SARL** · RCCM CI-ABJ-03-2026-B12-06782 · NCC 2606664 R

---

## Mise en ligne

### 1. La base de données

Dans `app.supabase.com` → ton projet → **SQL Editor**, coller le contenu de
`supabase-schema.sql` et exécuter.

> **À vérifier avant.** La politique de sécurité suppose que ta table
> `profiles` a une colonne `id` égale à `auth.uid()` et une colonne
> `organization_id`. Si tes colonnes s'appellent autrement, corrige la
> fonction `akili_mon_org()` — c'est le seul endroit à adapter.
> Pour voir tes colonnes : `select * from public.profiles limit 1;`

Vérifier aussi que **Email/Password** est activé dans *Authentication →
Providers*.

### 2. Les variables

Deux valeurs, prises dans *Settings → API* de Supabase :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Sur Vercel : *Settings → Environment Variables*. En local : copier
`.env.example` en `.env`.

La clé « anon » est visible dans le navigateur — c'est normal, elle n'ouvre
aucun droit. Ce sont les politiques RLS qui protègent les données.

### 3. Le déploiement

Le projet Vercel existant (`akilierp.intelligenciamedia.com`, qui sert
akilierp.africavit.com) n'a aucun dépôt connecté. Pour le relier :

1. *Settings → Git* → **Connect Git Repository** → `ARAVNA/akili-site`
2. *Settings → General* → **Root Directory** → `app`
3. Framework : **Vite** · Build : `npm run build` · Output : `dist`

Le domaine reste le même, les déploiements deviennent automatiques à chaque
modification.

---

## Sans configuration : le mode démo

Tant que les deux variables sont vides, l'application tourne en mode démo —
une pastille grise le signale sur l'écran de connexion. Les données restent
sur l'appareil. Rien ne plante, rien n'est perdu : c'est utile pour montrer
le produit à un prospect sans toucher à la base.

---

## Ce que fait l'application

Sept modules : tableau de bord (taux de conversion, point mort, prévision de
trésorerie) · documents générés par IA (devis, factures, contrats,
propositions) · clients · stocks et mouvements · RH et paie avec les barèmes
CNPS et ITS ivoiriens 2026 · comptabilité OHADA (journal, grand livre,
bilan) · chat IA avec quotas par abonnement.

Avant le premier accès, trois cases à cocher obligatoires établissent que
les documents produits sont indicatifs et doivent être validés par des
professionnels. Les références AFRICAViT figurent au pied de cet écran, dans
le bandeau du tableau de bord et sur chaque document généré.

---

## La synchronisation

Les écrans lisent et écrivent par `Store.get` / `Store.set`, comme avec le
stockage du navigateur. Dessous, la couche de données gère Supabase :

- lecture depuis un cache mémoire alimenté par une copie locale et par
  Supabase Realtime ;
- écriture en local immédiate, puis envoi au serveur groupé toutes les
  600 ms pour ne pas faire une requête par frappe clavier ;
- une saisie faite sans réseau reste visible et part dès le retour de la
  connexion.

### Le bug que cette couche corrige

Trouvé en test, pas en relecture. Saisir un client, puis quitter
l'application dans la seconde qui suit.

L'écriture n'était pas encore partie, et au redémarrage la version plus
ancienne du serveur **écrasait la copie locale**. La donnée disparaissait des
deux côtés. Sur un téléphone Android, où l'on bascule d'application sans y
penser, le cas se présente tous les jours.

Trois mécanismes le corrigent : un registre d'écritures en attente qui
survit à la fermeture, un verrou empêchant le serveur d'écraser une clé
encore en attente, et un envoi immédiat au passage en arrière-plan.

---

## Limite à connaître

Chaque module tient dans une ligne `jsonb`. C'est ce qui rend la lecture très
économique : afficher 200 clients coûte une requête. En contrepartie, un
module devient lourd au-delà de quelques milliers d'enregistrements, car
toute la liste est réécrite à chaque modification.

Une TPE qui émet dix factures par semaine met des années à s'en approcher.
Le jour où un module dépasse ce volume — les factures en premier — il lui
faut sa propre table. Le script SQL se termine sur un exemple.

---

## Ce qui reste avant de vendre

- **La clé API Claude.** Le chat IA appelle `api.anthropic.com` depuis le
  navigateur. Aucune clé n'est écrite dans le code, donc l'appel n'aboutit
  pas en l'état : il faut une fonction serveur qui détienne la clé.
- **Les sauvegardes Supabase.** Le palier gratuit n'en fait aucune. Avant le
  premier client payant, il faut le palier Pro (sauvegardes quotidiennes,
  7 jours) ou un export programmé.
- **Les CGU et CGV.** La politique de confidentialité d'africavit.com couvre
  le site vitrine, pas l'hébergement de la comptabilité et des bulletins de
  paie d'entreprises tierces.
- **La validation ONECCA-CI** des écritures OHADA par un expert-comptable
  agréé.

---

## Développement

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
```
