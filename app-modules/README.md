# AKILI ERP — Modules à intégrer

Modules prêts à coller dans l'application Next.js (`akilierp.africavit.com`).
Ils apportent trois choses qui manquent aujourd'hui : l'acceptation des
conditions, les mentions légales AFRICAViT, et une couche de synchronisation
Supabase qui ne perd pas de données.

Édité par **AFRICAViT SARL** · RCCM CI-ABJ-03-2026-B12-06782 · NCC 2606664 R

---

## Pourquoi ces fichiers

| Besoin | Fichier | Urgence |
|---|---|---|
| Aucun disclaimer avant l'accès à l'app | `components/Disclaimer.jsx` | **Haute** — exposition juridique |
| Pas de mentions légales dans l'app | `components/MentionsLegales.jsx` | Moyenne |
| Saisie perdue si l'app se ferme vite | `lib/store.js` | **Haute** — perte de données |
| Pas de synchronisation entre appareils | `lib/store.js` + `supabase/schema.sql` | Moyenne |

---

## Installation

```bash
npm install @supabase/supabase-js
```

Copier les dossiers `lib/` et `components/` à la racine du projet, puis
`.env.local.example` en `.env.local` et le remplir.

Exécuter `supabase/schema.sql` dans l'éditeur SQL de Supabase
(app.supabase.com → ton projet → SQL Editor → coller → Run).

> **Un point à vérifier dans ce script.** La politique de sécurité suppose
> que ta table `profiles` a une colonne `id` égale à `auth.uid()` et une
> colonne `organization_id`. Si tes colonnes s'appellent autrement, corrige
> la fonction `akili_mon_org()` — c'est le seul endroit à adapter.
> Pour voir tes colonnes : `select * from public.profiles limit 1;`

---

## Les trois branchements

### 1. Le disclaimer

Entre la connexion et le tableau de bord, dans ta mise en page protégée :

```jsx
import { DisclaimerGate } from "@/components/Disclaimer";

<DisclaimerGate uid={user.id} onAccepted={enregistrerAcceptation}>
  <Dashboard />
</DisclaimerGate>
```

L'acceptation est gardée dans le navigateur. Pour qu'elle soit **opposable**,
écris-la aussi côté serveur — c'est la trace serveur qui compte devant un
juge, pas celle du téléphone :

```js
async function enregistrerAcceptation() {
  await sb().from("profiles")
    .update({ cgu_acceptees_le: new Date().toISOString() })
    .eq("id", user.id);
}
```

### 2. La synchronisation

Une seule ligne, dès que l'utilisateur connecté est connu :

```js
import Store from "@/lib/store";

useEffect(() => {
  if (!user) return;
  Store.bind({ uid: user.id, orgId: profil?.organization_id || user.id });
  return () => { Store.clear(); };
}, [user?.id, profil?.organization_id]);
```

Ensuite, tes écrans lisent et écrivent comme avec `localStorage` :

```js
const clients = Store.get(`akili_clients_${orgId}`, []);
Store.set(`akili_clients_${orgId}`, [...clients, nouveau]);
```

Pour qu'une modification venue d'un autre appareil s'affiche, remonte
l'écran concerné :

```jsx
import { useSyncDistante } from "@/lib/useSync";

const sv = useSyncDistante();
<StocksEcran key={sv} />
```

Ce compteur n'augmente pas sur tes propres saisies — sinon un formulaire en
cours de frappe se réinitialiserait à chaque lettre.

### 3. Les mentions légales

```jsx
// app/mentions-legales/page.jsx
export { default } from "@/components/MentionsLegales";
```

```jsx
// pied de page, et bandeau du tableau de bord
import { PiedLegal, RappelLegal } from "@/components/MentionsLegales";
```

---

## Le bug que cette couche corrige

Il a été trouvé en testant, pas en relisant le code. Il se reproduit ainsi :
saisir un client, puis quitter l'application dans la seconde qui suit.

Les écritures partent vers le serveur groupées toutes les 600 ms, pour éviter
une requête par frappe clavier. Si l'application se ferme pendant ce délai,
l'écriture n'est jamais partie. Au redémarrage, le serveur renvoie sa version
plus ancienne — qui **écrase la copie locale**. Le client est perdu des deux
côtés.

Sur un téléphone Android, où l'on bascule d'application sans y penser, ce
scénario arrive tous les jours.

La correction tient en trois mécanismes :

1. chaque écriture est marquée « en attente » jusqu'à l'accusé de réception,
   et ce registre survit à la fermeture ;
2. le serveur ne peut jamais écraser une clé encore en attente ;
3. la file est vidée immédiatement quand l'application passe en arrière-plan,
   et ce qui restait est renvoyé au démarrage suivant.

Le même défaut existe dans toute conception « cache local puis
synchronisation ». Si ton application en a déjà une, elle mérite le même
examen.

---

## Ce qui reste hors de ces fichiers

- **La clé API Claude côté navigateur.** Si elle porte encore le préfixe
  `NEXT_PUBLIC_`, n'importe quel visiteur peut la lire et consommer ton
  crédit Anthropic. Elle doit vivre dans une route serveur.
- **Les CGU et CGV.** La politique de confidentialité publiée sur
  africavit.com couvre le site vitrine : elle parle du formulaire de contact,
  pas de l'hébergement de la comptabilité et des bulletins de paie d'autres
  entreprises. Il faut des conditions propres au produit.
- **La validation ONECCA-CI** des écritures OHADA par un expert-comptable
  agréé. C'est l'argument commercial que tes concurrents n'ont pas.

---

## Fichiers

```
lib/editeur.js            Identité AFRICAViT — référence unique
lib/supabase.js           Client Supabase, sûr en rendu serveur
lib/store.js              Synchronisation, hors ligne, anti-perte
lib/useSync.js            Hooks React
components/Disclaimer.jsx 3 cases à cocher + enveloppe prête à l'emploi
components/MentionsLegales.jsx  Page complète, pied de page, bandeau
supabase/schema.sql       Table, politiques RLS, temps réel
.env.local.example        Variables à remplir
```
