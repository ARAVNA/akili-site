"use client";

// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Acceptation des conditions
//
// Barrière obligatoire avant le premier accès à l'application.
// Rôle juridique : établir que l'utilisateur a été informé du caractère
// indicatif des documents produits, et qu'il s'engage à les faire valider.
// Sans cette trace, AFRICAViT SARL répond des erreurs de l'IA.
//
// L'acceptation est enregistrée dans le navigateur. Pour qu'elle soit
// réellement opposable, enregistre-la aussi côté Firestore sur le profil
// de l'utilisateur (voir `onAccept` plus bas).
// ═══════════════════════════════════════════════════════════════════

import { useState } from "react";
import { EDITEUR } from "../lib/editeur";

const T = {
  bg: "#05080F", card: "#0C1219", card2: "#101820", border: "#202C3C",
  accent: "#D9A441", accentD: "#8A6520",
  green: "#6E9E7C", red: "#C4635E", orange: "#D9A441",
  text: "#EDF3F9", muted: "#8095AB", light: "#141F2C",
};

const BLOCS = [
  [T.red, "⚠️ Avertissement",
   "Les documents, conseils et états financiers générés par AKILI ERP sont fournis à titre indicatif uniquement. Ils ne constituent pas un conseil juridique, comptable ou fiscal certifié. Les contrats doivent être validés par un juriste, les écritures OHADA par un expert-comptable agréé ONECCA-CI, et les déclarations fiscales par un professionnel DGI."],
  [T.orange, "📋 Responsabilité",
   `${EDITEUR.nom} ne peut être tenu responsable des erreurs dans les documents générés par l'IA, des redressements fiscaux, des litiges contractuels, ni des pertes financières résultant d'une utilisation sans validation professionnelle.`],
  [T.green, "✅ Engagement",
   "En acceptant, vous vous engagez à faire valider les documents importants par des professionnels qualifiés, à conserver vos pièces justificatives 10 ans (OHADA), et à soumettre vos déclarations fiscales via les canaux officiels DGI agréés."],
];

const CASES = [
  "Les documents générés sont indicatifs et doivent être validés par des professionnels qualifiés.",
  `${EDITEUR.nom} n'est pas responsable des erreurs dans les documents générés par l'IA.`,
  "J'accepte les conditions et m'engage à utiliser AKILI ERP de manière responsable.",
];

export default function Disclaimer({ onAccept }) {
  const [coches, setCoches] = useState([false, false, false]);
  const toutCoche = coches.every(Boolean);
  const basculer = (i) => setCoches(c => c.map((v, j) => (j === i ? !v : v)));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 560, background: T.card,
                    border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>⚖️</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 6 }}>
            Conditions d'utilisation
          </div>
          <div style={{ fontSize: 15, color: T.muted, marginTop: 4 }}>
            À lire avant d'utiliser AKILI ERP
          </div>
        </div>

        {BLOCS.map(([col, titre, texte]) => (
          <div key={titre} style={{ background: col + "12", border: `1px solid ${col}33`,
                                    borderRadius: 9, padding: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: col, marginBottom: 6 }}>{titre}</div>
            <div style={{ fontSize: 15, color: T.text, lineHeight: 1.65 }}>{texte}</div>
          </div>
        ))}

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 10 }}>
            Confirmez votre accord :
          </div>
          {CASES.map((txt, i) => (
            <div key={i} onClick={() => basculer(i)} role="checkbox" aria-checked={coches[i]} tabIndex={0}
                 onKeyDown={e => (e.key === "Enter" || e.key === " ") && basculer(i)}
                 style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
                          background: coches[i] ? T.green + "12" : T.light, borderRadius: 8, marginBottom: 7,
                          border: `1px solid ${coches[i] ? T.green : T.border}`, cursor: "pointer",
                          transition: "all .2s" }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, marginTop: 1,
                            background: coches[i] ? T.green : T.bg,
                            border: `2px solid ${coches[i] ? T.green : T.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 15, color: "#fff" }}>
                {coches[i] ? "✓" : ""}
              </div>
              <span style={{ fontSize: 15, color: T.text, lineHeight: 1.6 }}>{txt}</span>
            </div>
          ))}
        </div>

        <button onClick={() => toutCoche && onAccept?.()} disabled={!toutCoche}
                style={{ width: "100%", padding: 17, borderRadius: 8, border: "none",
                         fontFamily: "inherit", fontSize: 17, fontWeight: 700,
                         cursor: toutCoche ? "pointer" : "not-allowed",
                         background: toutCoche ? `linear-gradient(135deg,${T.accent},${T.accentD})` : T.light,
                         color: toutCoche ? "#000" : T.muted,
                         opacity: toutCoche ? 1 : .6 }}>
          {toutCoche ? "✅ J'accepte — Accéder à AKILI ERP" : "Cochez les 3 cases pour continuer"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{EDITEUR.nom}</div>
          <div>Capital {EDITEUR.capital} · RCCM {EDITEUR.rccm}</div>
          <div>NCC {EDITEUR.ncc} · IDU {EDITEUR.idu}</div>
          <div>{EDITEUR.siege}</div>
          <div>{EDITEUR.tel} · {EDITEUR.email} · {EDITEUR.site}</div>
          <div style={{ marginTop: 7, fontSize: 12 }}>{EDITEUR.droit}</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Enveloppe prête à l'emploi : affiche le disclaimer tant qu'il n'a pas
// été accepté, puis laisse passer l'application.
//
//     <DisclaimerGate uid={user.uid} onAccepted={enregistrerDansFirestore}>
//       <Dashboard />
//     </DisclaimerGate>
//
// `onAccepted` est l'endroit où écrire l'acceptation dans Firestore :
//     setDoc(doc(db,"users",uid), { cguAcceptees: serverTimestamp() }, { merge:true })
// C'est cette trace serveur qui est opposable, pas celle du navigateur.
// ═══════════════════════════════════════════════════════════════════
export function DisclaimerGate({ uid, onAccepted, children }) {
  const cle = uid ? `akili_cgu_${uid}` : "akili_cgu";
  const [accepte, setAccepte] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !!localStorage.getItem(cle); } catch { return false; }
  });

  if (accepte) return children;

  return (
    <Disclaimer onAccept={() => {
      try { localStorage.setItem(cle, new Date().toISOString()); } catch {}
      setAccepte(true);
      onAccepted?.();
    }} />
  );
}
