# AKILI ERP — Code source des maquettes

Trois versions du prototype AKILI ERP, en React, chacune en **un seul
fichier**. Déposées ici pour qu'elles soient récupérables depuis GitHub
plutôt que depuis une conversation.

Édité par **AFRICAViT SARL** · RCCM CI-ABJ-03-2026-B12-06782

---

## ⚠️ À lire avant de s'en servir

**Ces fichiers ne sont pas le code de `akilierp.africavit.com`.**

L'application en ligne est un projet **Next.js** déployé sur Vercel le
9 juin, avec de vraies pages serveur (`/auth/register` répond en HTML) et
une base **Supabase**. Ces trois fichiers sont des applications d'une
seule page, sans serveur, écrites en React.

Les textes sont identiques — même slogan, mêmes boutons, mêmes champs —
donc l'application en ligne a vraisemblablement été construite **à partir**
de ces maquettes, mais elle n'en est pas le code.

Conséquence pratique : reconstruire le projet à partir de ces fichiers ne
redonnera pas le site qui tourne aujourd'hui. Ce sont deux applications
distinctes.

---

## Les trois versions

| Fichier | Lignes | Ce qu'elle apporte |
|---|---|---|
| `akili-erp-v8.jsx` | 1 081 | Version de base. 7 modules, stockage dans le navigateur. |
| `akili-erp-v9.jsx` | 1 085 | Écritures agrandies (minimum 12 px au lieu de 8), palette réduite à trois couleurs. |
| `akili-erp-v10.jsx` | 1 436 | v9 + Firestore, mentions légales AFRICAViT, correction d'une perte de données. |

### Les 7 modules

Tableau de bord (KPI avancés : taux de conversion, point mort, prévision
de trésorerie) · Documents générés par IA (devis, factures, contrats,
propositions) · Clients · Stocks et mouvements · RH et paie (CNPS et ITS
Côte d'Ivoire 2026) · Comptabilité OHADA (journal, grand livre, bilan) ·
Chat IA avec quotas par abonnement.

---

## ⚠️ v10 utilise Firestore, l'application en ligne utilise Supabase

La version 10 a été écrite avant que l'on découvre que l'application
déployée tourne sur Supabase. Sa couche de données vise donc la mauvaise
base.

**Ce qui a été porté vers Supabase se trouve dans `app-modules/`** (branche
`akili-app-modules`) : couche de synchronisation, disclaimer, mentions
légales, script SQL et politiques RLS.

Ce qui reste utile dans v10 : les 7 modules métier, les calculs OHADA et
de paie ivoirienne, et le design.

---

## Le bug corrigé en v10

Trouvé en test, pas en relecture. Scénario : saisir un client, puis quitter
l'application dans la seconde qui suit.

Les écritures partent vers le serveur groupées toutes les 600 ms, pour
éviter une requête par frappe clavier. Si l'application se ferme pendant ce
délai, l'écriture n'est jamais partie — et au redémarrage, la version plus
ancienne du serveur **écrase la copie locale**. La donnée disparaît des deux
côtés.

Sur un téléphone Android, où l'on bascule d'application sans y penser, le
cas se présente tous les jours.

Le même défaut guette toute conception « cache local puis synchronisation ».
Si l'application en ligne en a une, elle mérite le même examen.

---

## Deux chantiers ouverts

- **La clé API Claude.** Dans ces maquettes, l'appel à
  `api.anthropic.com` part directement du navigateur. Aucune clé n'est
  écrite dans les fichiers — l'appel ne pouvait donc pas aboutir en l'état —
  mais la bonne architecture reste une route serveur qui détient la clé.
- **Les CGU et CGV.** La politique de confidentialité d'africavit.com
  couvre le site vitrine, pas l'hébergement de la comptabilité et des
  bulletins de paie d'entreprises tierces.
