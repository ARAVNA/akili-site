// Tâche planifiée : interroge chaque jour la base Supabase d'Akili ERP
// pour que le projet gratuit ne soit pas mis en pause pour inactivité (7 jours).
// Variables d'environnement Netlify : SUPABASE_URL, SUPABASE_ANON_KEY (clé publique).

export default async () => {
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error("SUPABASE_URL ou SUPABASE_ANON_KEY manquant");
    return new Response("config manquante", { status: 500 });
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // Trouve une table exposée par l'API, puis lit une ligne : cela génère une vraie requête en base.
  let table = null;
  try {
    const spec = await (await fetch(`${url}/rest/v1/`, { headers })).json();
    table = Object.keys(spec.paths || {})
      .map((p) => p.slice(1))
      .find((p) => p && !p.startsWith("rpc/"));
  } catch (e) {
    console.warn("Lecture du schéma impossible :", e.message);
  }

  const target = table ? `${url}/rest/v1/${table}?select=*&limit=1` : `${url}/rest/v1/`;
  const res = await fetch(target, { headers });
  const auth = await fetch(`${url}/auth/v1/health`, { headers });
  const msg = `Supabase réveillé : table=${table ?? "(aucune)"} rest=${res.status} auth=${auth.status}`;
  console.log(msg);
  return new Response(msg);
};

export const config = { schedule: "@daily" };
