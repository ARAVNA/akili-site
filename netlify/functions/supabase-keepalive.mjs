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

  // Lit une ligne d'une table connue : cela génère une vraie requête en base.
  // (La liste des tables n'est pas accessible avec la clé publique.)
  // Avec la sécurité RLS, la réponse peut être vide : la requête compte quand même.
  const tables = ["organizations", "profiles", "clients"];
  let table = null, status = 0;
  for (const t of tables) {
    const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers });
    status = res.status;
    if (res.ok) { table = t; break; }
  }
  const auth = await fetch(`${url}/auth/v1/health`, { headers });
  const msg = `Supabase réveillé : table=${table ?? "(aucune)"} rest=${status} auth=${auth.status}`;
  console.log(msg);
  return new Response(msg);
};

export const config = { schedule: "@daily" };
