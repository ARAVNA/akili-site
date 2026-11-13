// Rejouabilité des scripts SQL : aucune réintroduction des failles, aucune donnée perdue.
// Scénarios : (1) migration depuis l'ANCIEN état (tag Git) ; (2) rejeux répétés dans tous les ordres utiles ;
// (3) analyse statique des instructions destructrices.
import { creerBase, comme, peuplerDeuxEntreprises, lireSql, scriptsSql, ligne, TABLES, IDS, bilan } from "./lib/sim.mjs";
const R = []; const t = (nom, ok, detail = "") => R.push({ nom, ok, detail });
const SCHEMA = lireSql("supabase-schema.sql"), SEC = lireSql("supabase-securite.sql");

// Empreinte de sécurité : tout ce qui décide qui peut faire quoi.
async function empreinte(db) {
  const q = async (s) => (await db.query(s)).rows; const o = {};
  o.rls = await q(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`);
  o.policies = await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' order by 1,2`);
  const tbs = o.rls.map((r) => r.relname); o.privs = [];
  for (const tb of tbs) for (const role of ["anon", "authenticated"]) {
    for (const p of ["select", "insert", "update", "delete", "truncate", "references", "trigger"])
      if ((await q(`select has_table_privilege('${role}','public.${tb}','${p}') v`))[0].v) o.privs.push(`${tb}:${role}:${p}`);
    for (const c of await q(`select column_name from information_schema.columns where table_schema='public' and table_name='${tb}'`))
      if ((await q(`select has_column_privilege('${role}','public.${tb}','${c.column_name}','update') v`))[0].v) o.privs.push(`${tb}.${c.column_name}:${role}:col-update`);
  }
  o.fns = await q(`select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig,','),'') cfg, has_function_privilege('public',p.oid,'execute') pub, has_function_privilege('anon',p.oid,'execute') an, has_function_privilege('authenticated',p.oid,'execute') au from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`);
  o.triggers = await q(`select event_object_table t, trigger_name from information_schema.triggers where trigger_schema in ('public','auth') group by 1,2 order by 1,2`);
  return JSON.stringify(o);
}
async function donnees(db, tables) {
  const h = {}; for (const tb of tables) h[tb] = (await db.query(`select count(*)::int n, coalesce(md5(string_agg(x::text,'|' order by x::text)),'') h from public.${tb} x`)).rows[0];
  return h;
}
const tablesMetier = [...Object.keys(TABLES), "organizations", "profiles"];
async function semer(db) {
  const { orgA, orgB } = await peuplerDeuxEntreprises(db);
  for (const tb of Object.keys(TABLES)) { await db.exec(ligne(tb, orgA, `A-${tb}`)); await db.exec(ligne(tb, orgB, `B-${tb}`)); }
  await db.exec(`insert into ai_quotas (org_id,month,count) values ('${orgA}','10_2026',12),('${orgB}','10_2026',3)`);
  return { orgA, orgB };
}

// Référence : état attendu d'un projet neuf (schéma + sécurité)
const ref = await creerBase({ scripts: [SCHEMA, SEC] }); const EMP_REF = await empreinte(ref);

// (1) MIGRATION DEPUIS L'ANCIEN ÉTAT — le cas réel de la production
const prod = await creerBase({ scripts: [lireSql("supabase-schema.sql", "avant")] });
const empAvant = await empreinte(prod);
t("l'ancien état diffère bien de l'état sûr (le test détecte les failles)", empAvant !== EMP_REF, "");
await semer(prod);
const dAvant = await donnees(prod, tablesMetier);
await prod.exec(SCHEMA); await prod.exec(SEC);
t("migration depuis l'ancien état : empreinte de sécurité identique à un projet neuf", (await empreinte(prod)) === EMP_REF, "");
const dApres = await donnees(prod, tablesMetier);
t("migration depuis l'ancien état : AUCUNE donnée perdue ni modifiée", JSON.stringify(dAvant) === JSON.stringify(dApres), tablesMetier.map((x) => `${x}:${dApres[x].n}`).join(" "));
const nbAudit = (await prod.query(`select count(*)::int n from journal_audit`)).rows[0].n;
t("migration : le journal d'audit démarre vide (la migration ne se trace pas elle-même)", nbAudit === 0, `${nbAudit} ligne(s)`);

// (2) REJEUX RÉPÉTÉS (schéma après sécurité, sécurité deux fois, etc.)
const seq = [["sécurité ×3", [SEC, SEC, SEC]], ["schéma après sécurité", [SCHEMA]], ["schéma ×2 puis sécurité", [SCHEMA, SCHEMA, SEC]], ["tout rejoué dans l'ordre inverse (sécurité, schéma, sécurité)", [SEC, SCHEMA, SEC]]];
for (const [nom, scripts] of seq) {
  const d0 = await donnees(prod, tablesMetier);
  for (const s of scripts) await prod.exec(s);
  t(`rejeu « ${nom} » : empreinte de sécurité inchangée`, (await empreinte(prod)) === EMP_REF, "");
  t(`rejeu « ${nom} » : données intactes`, JSON.stringify(await donnees(prod, tablesMetier)) === JSON.stringify(d0), "");
}
// Les attaques de référence échouent toujours après tous ces rejeux
const A1 = IDS.A1; const orgB = (await prod.query(`select org_id from profiles where id='${IDS.B1}'`)).rows[0].org_id;
await comme(prod, "authenticated", A1, `update profiles set org_id='${orgB}' where id='${A1}'`);
await comme(prod, "authenticated", A1, `update organizations set plan='enterprise' where id=(select org_id from profiles where id='${A1}')`);
await comme(prod, "authenticated", A1, `update ai_quotas set count=0`);
await comme(prod, "authenticated", A1, `update profiles set role='superadmin' where id='${A1}'`);
const fin = (await prod.query(`select (select org_id from profiles where id='${A1}') <> '${orgB}' as org, (select role from profiles where id='${A1}') <> 'superadmin' as role, (select plan from organizations where id=(select org_id from profiles where id='${A1}')) = 'starter' as plan, (select count from ai_quotas where month='10_2026' and org_id=(select org_id from profiles where id='${A1}')) = 12 as quota`)).rows[0];
t("après tous les rejeux : org_id, rôle, plan et quota restent infalsifiables", fin.org && fin.role && fin.plan && fin.quota, JSON.stringify(fin));

// (3) ANALYSE STATIQUE : instructions destructrices
const destructeurs = [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdelete\s+from\b/i, /\bdrop\s+column\b/i, /\bdrop\s+schema\b/i, /\bdrop\s+database\b/i, /\balter\s+table\b[^;]*\bdrop\b/i, /\balter\s+column\b[^;]*\btype\b/i];
for (const [nom, sql] of [["supabase-schema.sql", SCHEMA], ["supabase-securite.sql", SEC]]) {
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\brevoke\b[^;]*;/gi, "");
  // les revoke/drop policy/trigger/function ne touchent pas aux données : on ne cherche que les instructions qui détruisent des lignes ou des colonnes
  const trouves = destructeurs.filter((r) => r.test(code)).map(String);
  t(`${nom} : aucune instruction qui supprime des tables, colonnes ou lignes`, trouves.length === 0, trouves.join(" ") || "aucune");
}
process.exit(bilan("REJOUABILITÉ ET MIGRATION DEPUIS L'ANCIEN ÉTAT", R) ? 1 : 0);
