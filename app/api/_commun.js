// Fonctions communes aux routes serveur récentes (le dossier commence par « _ » : non exposé).
const url = () => process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = () => process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const configure = () => !!(url() && svc());

export const rep = (res, code, corps) => { res.setHeader("Cache-Control", "no-store"); return res.status(code).json(corps); };

export const sbSvc = (chemin, opts = {}) =>
  fetch(`${url()}/rest/v1/${chemin}`, {
    ...opts,
    headers: { apikey: svc(), Authorization: `Bearer ${svc()}`, "content-type": "application/json", ...(opts.headers || {}) },
  });

// Qui appelle ? Vérifie le jeton auprès de Supabase puis lit l'entreprise côté serveur.
export async function identifier(req) {
  const jeton = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return { code: 401, error: "Connectez-vous." };
  let u;
  try {
    const r = await fetch(`${url()}/auth/v1/user`, { headers: { Authorization: `Bearer ${jeton}`, apikey: anon() || svc() } });
    if (!r.ok) return { code: 401, error: "Session expirée." };
    u = await r.json();
  } catch { return { code: 503, error: "Vérification impossible." }; }
  if (!u?.id || !/^[0-9a-f-]{36}$/i.test(u.id)) return { code: 401, error: "Session invalide." };
  const r = await sbSvc(`profiles?id=eq.${u.id}&select=org_id`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const orgId = Array.isArray(r) ? r[0]?.org_id : null;
  if (!orgId) return { code: 403, error: "Aucune entreprise rattachée à ce compte." };
  return { uid: u.id, orgId };
}
