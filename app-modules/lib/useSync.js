"use client";

// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Hooks de synchronisation
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import Store from "./store";

// Renvoie un compteur qui n'augmente QUE sur une mise à jour venue d'un
// autre appareil ou d'un autre onglet.
//
// Pourquoi ce compteur : chaque écran garde son propre état local
// (useState), qu'un simple re-rendu du parent ne rafraîchit pas. Sers-t'en
// comme clé de remontage :
//
//     const sv = useSyncDistante();
//     <ClientsEcran key={sv} />
//
// Il n'augmente pas sur tes propres saisies — sinon le formulaire en cours
// de frappe se réinitialiserait à chaque lettre.
export function useSyncDistante() {
  const [v, bump] = useState(0);
  useEffect(() => Store.subscribeRemote(() => bump(n => n + 1)), []);
  return v;
}

// Re-rendu à CHAQUE changement, local compris. À utiliser pour un compteur
// de quota, un indicateur de sauvegarde, une barre d'état.
export function useStoreVersion() {
  const [v, bump] = useState(0);
  useEffect(() => Store.subscribe(() => bump(n => n + 1)), []);
  return v;
}

// Lecture live d'une clé. Évite de dupliquer l'état dans l'écran.
export function useStoreValue(cle, defaut) {
  const v = useStoreVersion();
  return Store.get(cle, defaut);
}

// État d'enregistrement, pour un petit indicateur discret dans l'en-tête.
export function useSyncEtat() {
  useStoreVersion();
  return {
    enregistrement: Store.syncing(),
    enAttente: Store.enAttente(),
  };
}
