// Test des règles RLS sur un vrai moteur PostgreSQL (PGlite).
// Usage : node tests/rls-test.mjs <avant|apres> <dossier app>   (« avant » = supabase-schema.sql seul)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const [mode, appDir] = [process.argv[2], process.argv[3]];
const db = new PGlite();
const exec = (sql) => db.exec(sql);

// ── Environnement Supabase simulé ──
await exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- tables préexistantes dans le vrai projet (colonnes minimales)
  create table public.clients (id uuid primary key default gen_random_uuid(), org_id uuid not null, nom text, created_at timestamptz default now());
  create table public.ecritures (id uuid primary key default gen_random_uuid(), org_id uuid not null, journal text, compte text, created_at timestamptz default now());
  create table public.achats (id text primary key, org_id uuid not null);
  create table public.ai_quotas (org_id uuid not null, month text not null, count int not null default 0);
  create table public.employes (id uuid primary key default gen_random_uuid(), org_id uuid not null, nom text);
  create table public.documents (id text primary key, org_id uuid not null);
  create table public.efactures (id uuid primary key default gen_random_uuid(), org_id uuid not null);
  create table public.comptes_tresorerie (id uuid primary key default gen_random_uuid(), org_id uuid not null);
  create table public.crm_leads (id uuid primary key default gen_random_uuid(), org_id uuid not null);
`);

await exec(readFileSync(`${appDir}/supabase-schema.sql`, "utf8"));
if (mode === "apres") await exec(readFileSync(`${appDir}/supabase-securite.sql`, "utf8"));

// ── Deux entreprises, deux utilisateurs (créés via le déclencheur réel) ──
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
await exec(`insert into auth.users (id,email,raw_user_meta_data) values
  ('${A}','a@test.ci','{"entreprise":"Entreprise A"}'),
  ('${B}','b@test.ci','{"entreprise":"Entreprise B"}');`);
const orgA = (await db.query(`select org_id from profiles where id='${A}'`)).rows[0].org_id;
const orgB = (await db.query(`select org_id from profiles where id='${B}'`)).rows[0].org_id;
await exec(`insert into clients (org_id, nom) values ('${orgA}','Client secret A'),('${orgB}','Client secret B');
            insert into fiches_paie (org_id, mois, brut) values ('${orgB}','2026-10',500000);`);

// ── Exécute une requête comme un utilisateur du navigateur ──
async function comme(uid, role, sql) {
  await exec(`set role ${role}; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
  catch (e) { return { ok: false, err: e.message.split("\n")[0] }; }
  finally { await exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
}

const resultats = [];
const test = (nom, attendu, obtenu, detail = "") => {
  const ok = attendu === obtenu;
  resultats.push({ nom, attendu, obtenu, ok, detail });
};
const lignes = (r) => (r.ok ? r.n : "refusé");

// T1 isolation des lectures
let r = await comme(A, "authenticated", `select nom from clients`);
test("T1 A ne voit que ses clients", 1, r.rows?.length);
test("T1b A ne voit pas les clients de B", false, r.rows?.some(x => x.nom === "Client secret B"));
r = await comme(A, "authenticated", `select * from fiches_paie`);
test("T2 A ne voit pas la paie de B", 0, r.rows?.length);
r = await comme(null, "anon", `select * from clients`);
test("T3 anonyme : accès refusé", "refusé", r.ok ? r.rows.length : "refusé");

// T4 écriture dans l'entreprise d'un autre
r = await comme(A, "authenticated", `insert into clients (org_id, nom) values ('${orgB}','intrus')`);
test("T4 A ne peut pas écrire chez B", "refusé", r.ok ? "accepté" : "refusé");

// T5 FAILLE : changer son org_id pour entrer chez B
r = await comme(A, "authenticated", `update profiles set org_id='${orgB}' where id='${A}'`);
const apres5 = await comme(A, "authenticated", `select nom from clients`);
const aVuB = apres5.rows?.some(x => x.nom === "Client secret B");
test("T5 A ne peut pas se rattacher à l'entreprise de B (org_id)", false, aVuB, r.ok ? "UPDATE accepté" : r.err);
await exec(`update profiles set org_id='${orgA}' where id='${A}'`); // remise en état (superuser)

// T6 FAILLE : s'attribuer un rôle
r = await comme(A, "authenticated", `update profiles set role='superadmin' where id='${A}'`);
test("T6 A ne peut pas modifier son rôle", "refusé", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);

// T7 FAILLE : gratuitement passer au plan enterprise
r = await comme(A, "authenticated", `update organizations set plan='enterprise' where id='${orgA}'`);
test("T7 A ne peut pas se donner le plan enterprise", "refusé", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);

// T8 FAILLE : réécrire son quota IA
await exec(`insert into ai_quotas (org_id, month, count) values ('${orgA}','10_2026',29)`);
r = await comme(A, "authenticated", `update ai_quotas set count=0 where org_id='${orgA}'`);
const q = (await db.query(`select count from ai_quotas where org_id='${orgA}'`)).rows[0].count;
test("T8 A ne peut pas remettre son quota à zéro", 29, q, r.ok ? "UPDATE sans erreur" : r.err);

// T9 fonctionnalités légitimes conservées
r = await comme(A, "authenticated", `insert into clients (org_id, nom) values ('${orgA}','Nouveau client A')`);
test("T9 A peut créer un client chez lui", "accepté", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);
r = await comme(A, "authenticated", `update organizations set nom='Entreprise A SARL', tel='0102030405' where id='${orgA}'`);
test("T10 A peut modifier le nom/téléphone de son entreprise", "accepté", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);
r = await comme(A, "authenticated", `update profiles set nom='Nouveau Nom' where id='${A}'`);
test("T11 A peut modifier son nom de profil", "accepté", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);
r = await comme(A, "authenticated", `select count from ai_quotas where org_id='${orgA}'`);
test("T12 A peut lire son quota", 1, r.rows?.length);
r = await comme(A, "authenticated", `update organizations set nom='Piratage' where id='${orgB}'`);
const nomB = (await db.query(`select nom from organizations where id='${orgB}'`)).rows[0].nom;
test("T13 A ne peut pas modifier l'entreprise de B", "Entreprise B", nomB);

if (mode === "apres") {
  // T14 incrément atomique réservé au serveur
  r = await comme(A, "authenticated", `select incrementer_quota_ia('${orgA}','10_2026')`);
  test("T14 un utilisateur ne peut pas appeler incrementer_quota_ia", "refusé", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);
  r = await comme(null, "service_role", `select incrementer_quota_ia('${orgA}','10_2026') as c`);
  test("T15 le serveur (service_role) incrémente le quota", 30, r.rows?.[0]?.c);
  // T16 audit
  await comme(A, "authenticated", `insert into clients (org_id, nom) values ('${orgA}','Tracé')`);
  await exec(`select set_config('request.jwt.claim.sub','${A}',false)`);
  await exec(`update clients set nom='Tracé 2' where nom='Tracé'`);
  await exec(`select set_config('request.jwt.claim.sub','',false)`);
  const aud = (await db.query(`select op from journal_audit where table_name='clients' and org_id='${orgA}' order by id`)).rows.map(x => x.op);
  test("T16 les opérations sont tracées (INSERT puis UPDATE)", "INSERT,UPDATE", aud.slice(-2).join(","));
  r = await comme(A, "authenticated", `select count(*)::int as n from journal_audit`);
  test("T17 A lit son journal d'audit", true, (r.rows?.[0]?.n ?? 0) > 0);
  r = await comme(A, "authenticated", `delete from journal_audit`);
  test("T18 A ne peut pas effacer le journal d'audit", "refusé", r.ok ? "accepté" : "refusé", r.ok ? "" : r.err);
  r = await comme(B, "authenticated", `select count(*)::int as n from journal_audit where org_id='${orgA}'`);
  test("T19 B ne voit pas le journal de A", 0, r.rows?.[0]?.n);
  // la création de compte reste fonctionnelle (déclencheur)
  await exec(`insert into auth.users (id,email) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','c@test.ci')`);
  const pc = (await db.query(`select count(*)::int n from profiles where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'`)).rows[0].n;
  test("T20 l'inscription crée toujours entreprise + profil", 1, pc);
}

console.log(`\n=== RLS — ${mode.toUpperCase()} correctifs ===`);
for (const t of resultats) console.log(`${t.ok ? "✅" : "❌"} ${t.nom} — attendu: ${t.attendu} | obtenu: ${t.obtenu}${t.detail ? "  ("+t.detail+")" : ""}`);
const ko = resultats.filter(t => !t.ok).length;
console.log(`\nRésultat: ${resultats.length - ko}/${resultats.length} conformes, ${ko} en échec`);
