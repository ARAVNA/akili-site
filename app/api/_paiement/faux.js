// Faux prestataire : sert UNIQUEMENT aux tests. Désactivé en production.
// Signature : en-tête « x-faux-signature: t=<secondes>,v1=<hex> » avec
// v1 = HMAC-SHA256(secret, `${t}.${corpsBrut}`).
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_S = 300;

export const signer = (secret, brut, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${brut}`).digest("hex")}`;

export const faux = {
  id: "faux",
  // Jamais actif sur l'environnement de production de Vercel.
  actif: (env) => env.PAIEMENT_FAUX_ACTIF === "1" && env.VERCEL_ENV !== "production",
  verifier(brut, entetes, secret, maintenant = Date.now()) {
    const en = String(entetes["x-faux-signature"] || "");
    const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(en);
    if (!m || !secret) return false;
    const t = Number(m[1]);
    if (Math.abs(maintenant / 1000 - t) > TOLERANCE_S) return false;      // trop ancien ou futur → rejeu
    const attendu = createHmac("sha256", secret).update(`${m[1]}.${brut}`).digest();
    const recu = Buffer.from(m[2], "hex");
    return recu.length === attendu.length && timingSafeEqual(recu, attendu);
  },
  analyser(brut) {
    let d; try { d = JSON.parse(brut); } catch { return null; }
    if (!d || typeof d !== "object") return null;
    return {
      eventId: typeof d.event_id === "string" ? d.event_id.slice(0, 120) : "",
      commandeId: typeof d.commande_id === "string" ? d.commande_id : "",
      statut: d.statut,
      montant: Number(d.montant),
      devise: typeof d.devise === "string" ? d.devise : "",
    };
  },
};
