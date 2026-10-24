"use client";

// ═══════════════════════════════════════════════════════════════════
// AKILI ERP — Mentions légales
//
// Trois composants, trois usages :
//   <MentionsLegales />      page complète  → app/mentions-legales/page.jsx
//   <PiedLegal />            pied de page discret, toutes pages
//   <RappelLegal />          bandeau dans le tableau de bord
// ═══════════════════════════════════════════════════════════════════

import { EDITEUR, mentionCourte } from "../lib/editeur";

const T = {
  bg: "#05080F", card: "#0C1219", card2: "#101820", border: "#202C3C",
  accent: "#D9A441", text: "#EDF3F9", muted: "#8095AB",
};

// ─── Pied de page discret ─────────────────────────────────────────
export function PiedLegal({ style = {} }) {
  return (
    <div style={{ textAlign: "center", padding: "16px 12px", fontSize: 13,
                  color: T.muted, lineHeight: 1.7, ...style }}>
      <div>{mentionCourte()}</div>
      <div style={{ marginTop: 3 }}>
        <a href="/mentions-legales" style={{ color: T.muted, textDecoration: "underline" }}>
          Mentions légales
        </a>
        {" · "}
        <a href="/confidentialite" style={{ color: T.muted, textDecoration: "underline" }}>
          Confidentialité
        </a>
        {" · "}
        <a href="/cgu" style={{ color: T.muted, textDecoration: "underline" }}>
          CGU
        </a>
      </div>
    </div>
  );
}

// ─── Bandeau du tableau de bord ───────────────────────────────────
export function RappelLegal() {
  return (
    <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9,
                  padding: 14, fontSize: 14, color: T.text, lineHeight: 1.6 }}>
      ⚠️ <b style={{ color: T.accent }}>Rappel légal</b> : les documents produits sont
      indicatifs — faites-les valider par des professionnels qualifiés.
      <div style={{ marginTop: 5, fontSize: 12, color: T.muted }}>
        Édité par {EDITEUR.nom} · RCCM {EDITEUR.rccm} · NCC {EDITEUR.ncc} · {EDITEUR.site}
      </div>
    </div>
  );
}

// ─── Page complète ────────────────────────────────────────────────
const Bloc = ({ titre, children }) => (
  <section style={{ marginBottom: 26 }}>
    <h2 style={{ fontSize: 19, fontWeight: 700, color: T.accent, marginBottom: 9 }}>{titre}</h2>
    <div style={{ fontSize: 15, color: T.text, lineHeight: 1.75 }}>{children}</div>
  </section>
);

const Ligne = ({ k, v }) => (
  <div style={{ display: "flex", gap: 10, padding: "5px 0", flexWrap: "wrap" }}>
    <span style={{ color: T.muted, minWidth: 150 }}>{k}</span>
    <span style={{ color: T.text, fontWeight: 600 }}>{v}</span>
  </div>
);

export default function MentionsLegales() {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "28px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>
          Mentions légales
        </h1>
        <div style={{ fontSize: 15, color: T.muted, marginBottom: 28 }}>
          {EDITEUR.produit} — dernière mise à jour : octobre 2026
        </div>

        <Bloc titre="Éditeur">
          <Ligne k="Raison sociale" v={EDITEUR.nom} />
          <Ligne k="Forme juridique" v="SARL" />
          <Ligne k="Capital social" v={EDITEUR.capital} />
          <Ligne k="RCCM" v={EDITEUR.rccm} />
          <Ligne k="NCC" v={EDITEUR.ncc} />
          <Ligne k="IDU" v={EDITEUR.idu} />
          <Ligne k="Siège social" v={EDITEUR.siege} />
          <Ligne k="Téléphone" v={EDITEUR.tel} />
          <Ligne k="WhatsApp" v={EDITEUR.whatsapp} />
          <Ligne k="Email" v={EDITEUR.email} />
          <Ligne k="Site" v={EDITEUR.site} />
        </Bloc>

        <Bloc titre="Hébergement">
          Site hébergé par {EDITEUR.hebergeur}. Les données applicatives sont
          hébergées par Google Cloud (Firestore), région europe-west1 (Belgique).
        </Bloc>

        <Bloc titre="Propriété intellectuelle">
          {EDITEUR.marques} Les contenus de ce service appartiennent à {EDITEUR.nom}
          {" "}ou à ses partenaires. Toute reproduction, même partielle, est soumise à
          autorisation écrite préalable.
        </Bloc>

        <Bloc titre="Nature du service">
          {EDITEUR.produit} est un outil d'aide à la gestion. Les documents, écritures
          comptables, bulletins de paie et conseils produits, notamment par
          intelligence artificielle, sont fournis <b>à titre indicatif</b>. Ils ne
          constituent pas un conseil juridique, comptable ou fiscal certifié.
          <div style={{ marginTop: 10 }}>
            Les écritures OHADA doivent être validées par un expert-comptable agréé
            ONECCA-CI, les contrats par un juriste, et les déclarations fiscales
            soumises via les canaux officiels de la DGI.
          </div>
        </Bloc>

        <Bloc titre="Responsabilité">
          {EDITEUR.nom} ne peut être tenu responsable des erreurs présentes dans les
          documents générés, des redressements fiscaux, des litiges contractuels, ni
          des pertes financières résultant d'une utilisation sans validation
          professionnelle préalable.
        </Bloc>

        <Bloc titre="Droit applicable">
          {EDITEUR.droit}
        </Bloc>

        <div style={{ marginTop: 32, padding: 14, background: T.card2,
                      border: `1px solid ${T.border}`, borderRadius: 9,
                      fontSize: 14, color: T.muted, lineHeight: 1.7 }}>
          Pour toute question relative à ces mentions ou à vos données :{" "}
          <a href={`mailto:${EDITEUR.email}`} style={{ color: T.accent }}>{EDITEUR.email}</a>
        </div>
      </div>
    </div>
  );
}
