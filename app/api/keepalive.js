// ═══════════════════════════════════════════════════════════════════
// Maintien en éveil de la base Supabase (offre gratuite : mise en pause après
// 7 jours d'inactivité). Remplace la tâche planifiée du projet Netlify hérité.
//
// Appelée chaque jour par Vercel Cron (vercel.json → "crons"). Vercel envoie
// « Authorization: Bearer <CRON_SECRET> » ; sans CRON_SECRET configuré, la route
// refuse de répondre (échec fermé) pour ne pas être un point d'entrée public.
// Utilise la clé serveur : l'ancien appel avec la clé publique est désormais
// refusé par les droits (volontairement).
// ═══════════════════════════════════════════════════════════════════
import { timingSafeEqual } from "node:crypto";
import { rep, configure, sbSvc } from "./_commun.js";

const egal = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !configure()) return rep(res, 503, { error: "Non configuré." });
  const recu = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!recu || !egal(recu, secret)) return rep(res, 401, { error: "Non autorisé." });
  try {
    const r = await sbSvc("organizations?select=id&limit=1");
    if (!r.ok) return rep(res, 502, { ok: false, base: r.status });
    return rep(res, 200, { ok: true, base: r.status });
  } catch { return rep(res, 502, { ok: false }); }
}
