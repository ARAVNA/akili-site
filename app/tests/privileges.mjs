// Inventaire des droits : fonctions SECURITY DEFINER, privilèges de tables et de colonnes, RLS, politiques.
// Usage : node tests/privileges.mjs <avant|apres>
import { creerBase, scriptsSql, bilan } from "./lib/sim.mjs";
const mode = process.argv[2] || "apres";
const db = await creerBase({ scripts: scriptsSql(mode) });
const q = async (sql) => (await db.query(sql)).rows; const R = [];
const t = (nom, ok, detail = "") => R.push({ nom, ok, detail });
const ROLES = ["anon", "authenticated", "service_role"];

// 1. Fonctions SECURITY DEFINER : propriétaire, search_path figé, qui peut les exécuter
const fns = await q(`select p.proname, pg_get_userbyid(p.proowner) as proprio, p.prosecdef, coalesce(array_to_string(p.proconfig,','),'') as cfg,
  has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as auth,
  has_function_privilege('service_role',p.oid,'execute') as svc, has_function_privilege('public',p.oid,'execute') as pub
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`);
console.log("\nFonctions du schéma public :\n" + fns.map((f) => `  ${f.proname.padEnd(22)} definer=${f.prosecdef ? "oui" : "non"} search_path=${f.cfg || "(aucun)"} | exécutable par : ${[f.pub && "PUBLIC", f.anon && "anon", f.auth && "authenticated", f.svc && "service_role"].filter(Boolean).join(", ") || "personne"}`).join("\n"));
const attendu = { mon_org: ["authenticated", "service_role"], creer_profil: ["service_role"], journaliser: ["service_role"], incrementer_quota_ia: ["service_role"] };
for (const f of fns) {
  if (f.prosecdef) t(`${f.proname} : SECURITY DEFINER avec search_path figé (anti-détournement)`, /search_path=public/.test(f.cfg), f.cfg || "aucun");
  const qui = [f.pub && "PUBLIC", f.anon && "anon", f.auth && "authenticated"].filter(Boolean);
  if (attendu[f.proname]) {
    const ok = attendu[f.proname].includes("authenticated") ? !f.pub && !f.anon && f.auth : qui.length === 0;
    t(`${f.proname} : exécutable uniquement par ${attendu[f.proname].filter((x) => x !== "service_role").join("/") || "le serveur (service_role)"}`, ok, "accès: " + (qui.join(",") || "aucun"));
  }
}

// 2. Privilèges de tables par rôle
const tables = (await q(`select tablename from pg_tables where schemaname='public' order by 1`)).map((x) => x.tablename);
const PRIV = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];
const ligne = async (tb, role) => { const o = {}; for (const p of PRIV) o[p] = (await q(`select has_table_privilege('${role}','public.${tb}','${p}') as v`))[0].v; return o; };
const ATTENDU = { // authenticated, par table (le reste = aucun droit)
  profiles: ["select"], organizations: ["select"], ai_quotas: ["select"], journal_audit: ["select"],
};
console.log("\nPrivilèges (authenticated) :");
for (const tb of tables) {
  const a = await ligne(tb, "authenticated"), n = await ligne(tb, "anon");
  const aut = PRIV.filter((p) => a[p]); const anon = PRIV.filter((p) => n[p]);
  console.log(`  ${tb.padEnd(20)} authenticated: ${aut.join(",") || "-"}  | anon: ${anon.join(",") || "-"}`);
  const att = ATTENDU[tb] ?? ["select", "insert", "update", "delete"];
  const ecart = aut.filter((p) => !att.includes(p));
  const colUpd = tb === "profiles" || tb === "organizations";
  t(`${tb} : authenticated n'a que ${att.join("/")}${colUpd ? " (+ UPDATE par colonnes)" : ""}`, ecart.length === 0 || (colUpd && ecart.join() === "update"), "excès: " + (ecart.join(",") || "aucun"));
  t(`${tb} : anon n'a aucun droit`, anon.length === 0, anon.join(","));
}

// 3. Droits par colonne (UPDATE) sur profiles / organizations
for (const [tb, permises] of [["profiles", ["nom", "cgu_acceptees_le"]], ["organizations", ["nom", "rccm", "ncc", "idu", "adresse", "tel", "email"]]]) {
  const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name='${tb}'`)).map((c) => c.column_name);
  const maj = [];
  for (const c of cols) if ((await q(`select has_column_privilege('authenticated','public.${tb}','${c}','update') as v`))[0].v) maj.push(c);
  t(`${tb} : colonnes modifiables = {${permises.join(", ")}}`, JSON.stringify(maj.sort()) === JSON.stringify([...permises].sort()), "réel: " + maj.join(","));
  const interdit = ["org_id", "role", "plan", "id"].filter((c) => maj.includes(c));
  t(`${tb} : org_id / role / plan / id non modifiables`, interdit.length === 0, interdit.join(","));
}

// 4. RLS actif partout + politiques
const rls = await q(`select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`);
t(`RLS activé sur les ${rls.length} tables du schéma public`, rls.every((r) => r.rls), rls.filter((r) => !r.rls).map((r) => r.relname).join(",") || "toutes");
const pol = await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' order by 1,2`);
console.log("\nPolitiques RLS :\n" + pol.map((p) => `  ${p.tablename.padEnd(20)} ${p.policyname.padEnd(22)} ${p.cmd.padEnd(7)} ${p.roles}  USING(${p.qual ?? ""}) CHECK(${p.with_check ?? ""})`).join("\n"));
// Tables VOLONTAIREMENT verrouillées pour le navigateur (accès service_role uniquement) : paiements.
const SERVEUR_SEUL = ["commandes_paiement", "evenements_paiement"];
const sansPolitique = rls.filter((r) => r.rls && !pol.some((p) => p.tablename === r.relname) && !SERVEUR_SEUL.includes(r.relname)).map((r) => r.relname);
if (mode !== "avant") for (const tb of SERVEUR_SEUL) {
  const a = (await db.query(`select has_table_privilege('authenticated','public.${tb}','select') s, has_table_privilege('anon','public.${tb}','select') a, has_table_privilege('service_role','public.${tb}','select') v`)).rows[0];
  t(`${tb} : verrouillée au navigateur (anon/authenticated sans droit), accessible au serveur`, !a.s && !a.a && a.v);
}
t("aucune table avec RLS activé mais sans politique (= verrouillée pour tous)", mode === "avant" || sansPolitique.length === 0, sansPolitique.join(","));
t("aucune politique ouverte à `public`/anon ni `USING (true)`", !pol.some((p) => /anon|public/.test(p.roles.replace("{authenticated}", "")) || p.qual === "true" || p.with_check === "true"), "");
t("toutes les politiques d'entreprise reposent sur mon_org()", pol.filter((p) => !["profiles"].includes(p.tablename)).every((p) => /mon_org/.test((p.qual || "") + (p.with_check || ""))), "");
// 5. Déclencheurs d'audit
const trg = await q(`select event_object_table t from information_schema.triggers where trigger_name='akili_audit' group by 1 order by 1`);
console.log("\nDéclencheurs d'audit : " + (trg.map((x) => x.t).join(", ") || "aucun"));
if (mode === "apres") t("journal d'audit actif sur les tables sensibles (11)", trg.length === 11, `${trg.length} tables`);
process.exit(bilan(`INVENTAIRE DES DROITS — état ${mode.toUpperCase()}`, R) && mode === "apres" ? 1 : 0);
