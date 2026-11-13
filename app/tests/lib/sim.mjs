// Simulation d'un projet Supabase sur PostgreSQL réel (PGlite).
// Émule ce qui compte pour la sécurité : rôles anon / authenticated / service_role,
// schéma auth, auth.uid(), ET les privilèges par défaut que Supabase accorde à
// chaque nouvelle table du schéma public (c'est ce qui rend RLS indispensable).
// Limites : ni PostgREST, ni GoTrue, ni Realtime ; ce sont les mêmes règles SQL.
import { PGlite } from "@electric-sql/pglite";

export const IDS = {
  A1: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", A2: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
  B1: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1", B2: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
};

// Tables préexistantes dans le vrai projet (colonnes minimales utiles aux tests).
const PREEXISTANTES = `
  create table public.clients (id uuid primary key default gen_random_uuid(), org_id uuid not null, nom text, created_at timestamptz default now());
  create table public.ecritures (id uuid primary key default gen_random_uuid(), org_id uuid not null, journal text, compte text, created_at timestamptz default now());
  create table public.achats (id text primary key, org_id uuid not null);
  create table public.ai_quotas (org_id uuid not null, month text not null, count int not null default 0);
  create table public.employes (id uuid primary key default gen_random_uuid(), org_id uuid not null, nom text);
  create table public.documents (id text primary key, org_id uuid not null, content text);
  create table public.efactures (id uuid primary key default gen_random_uuid(), org_id uuid not null);
  create table public.comptes_tresorerie (id uuid primary key default gen_random_uuid(), org_id uuid not null);
  create table public.crm_leads (id uuid primary key default gen_random_uuid(), org_id uuid not null);`;

export async function creerBase({ scripts = [] } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- Privilèges par défaut de Supabase pour tout objet créé dans « public »
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  await db.exec(PREEXISTANTES);
  for (const s of scripts) await db.exec(s);
  return db;
}

// Exécute du SQL « comme le navigateur » : rôle + identité.
export async function comme(db, role, uid, sql, params) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { ok: false, err: e.message.split("\n")[0] };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  }
}

// Deux entreprises, deux utilisateurs chacune (créés via le vrai déclencheur d'inscription).
export async function peuplerDeuxEntreprises(db) {
  const { A1, A2, B1, B2 } = IDS;
  await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values
    ('${A1}','a1@a.ci','{"entreprise":"Entreprise A"}'),('${A2}','a2@a.ci','{}'),
    ('${B1}','b1@b.ci','{"entreprise":"Entreprise B"}'),('${B2}','b2@b.ci','{}');`);
  const orgA = (await db.query(`select org_id from profiles where id='${A1}'`)).rows[0].org_id;
  const orgB = (await db.query(`select org_id from profiles where id='${B1}'`)).rows[0].org_id;
  // A2 et B2 rejoignent l'entreprise de leur collègue (invitation simulée côté serveur).
  for (const [u, org] of [[A2, orgA], [B2, orgB]]) {
    const auto = (await db.query(`select org_id from profiles where id='${u}'`)).rows[0].org_id;
    await db.exec(`update profiles set org_id='${org}' where id='${u}'; delete from organizations where id='${auto}';`);
  }
  return { orgA, orgB };
}

// Colonnes minimales pour insérer une ligne dans chaque table métier.
export const TABLES = {
  achats:             { pk: "id",     texte: true, cols: ["id"] },
  clients:            { pk: "id",     cols: ["nom"] },
  comptes_tresorerie: { pk: "id",     cols: [] },
  crm_leads:          { pk: "id",     cols: [] },
  documents:          { pk: "id",     texte: true, cols: ["id", "content"] },
  ecritures:          { pk: "id",     cols: ["journal", "compte"] },
  efactures:          { pk: "id",     cols: [] },
  employes:           { pk: "id",     cols: ["nom"] },
  fournisseurs:       { pk: "id",     cols: ["nom"] },
  stocks:             { pk: "id",     cols: ["nom"] },
  mouvements_stock:   { pk: "id",     cols: ["type", "quantite"] },
  fiches_paie:        { pk: "id",     cols: ["mois"] },
  projets:            { pk: "id",     cols: ["nom"] },
  signatures:         { pk: "id",     cols: ["signataire", "empreinte"] },
  taux_change:        { pk: "org_id", cols: [] },
};
export function ligne(table, org, tag) {
  const t = TABLES[table];
  const vals = { id: `'${tag}'`, content: `'${tag}'`, nom: `'${tag}'`, journal: `'OD'`, compte: `'${tag}'`,
    type: `'entree'`, quantite: "1", mois: `'${tag}'`, signataire: `'${tag}'`, empreinte: `'${tag}'` };
  const cols = ["org_id", ...t.cols], v = [`'${org}'`, ...t.cols.map((c) => vals[c])];
  return `insert into public.${table} (${cols.join(",")}) values (${v.join(",")})`;
}

// ── Chargement des scripts SQL : « avant » = tag Git, « apres » = dépôt ──
import { execSync } from "node:child_process"; import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
export const RACINE = fileURLToPath(new URL("../..", import.meta.url));
export const lireSql = (f, mode = "apres") => mode === "avant"
  ? execSync(`git show avant-corrections-2026-11-13:app/${f}`, { cwd: RACINE, stdio: ["ignore", "pipe", "ignore"] }).toString()
  : readFileSync(RACINE + f, "utf8");
export const scriptsSql = (mode) => mode === "avant" ? [lireSql("supabase-schema.sql", "avant")]
  : [lireSql("supabase-schema.sql"), lireSql("supabase-securite.sql")];
export const bilan = (titre, resultats) => {
  console.log(`\n=== ${titre} ===`);
  for (const r of resultats) console.log(`${r.ok ? "✅" : "❌"} ${r.nom}${r.detail ? " — " + r.detail : ""}`);
  const ko = resultats.filter((r) => !r.ok).length;
  console.log(`\nTOTAL : ${resultats.length - ko}/${resultats.length} conformes, ${ko} en échec`); return ko;
};
