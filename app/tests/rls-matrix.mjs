// Matrice d'accès croisés : 2 entreprises × 2 utilisateurs, toutes les tables, toutes les opérations.
// Usage : node tests/rls-matrix.mjs <avant|apres>
//   avant = fichiers SQL du tag « avant-corrections-2026-11-13 » ; apres = fichiers du dépôt.
import { execSync } from "node:child_process"; import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
import { creerBase, comme, peuplerDeuxEntreprises, IDS, TABLES, ligne } from "./lib/sim.mjs";

const mode = process.argv[2] || "apres";
const racine = fileURLToPath(new URL("..", import.meta.url));
const lire = (f) => mode === "avant"
  ? execSync(`git show avant-corrections-2026-11-13:app/${f}`, { cwd: racine, stdio: ["ignore", "pipe", "ignore"] }).toString()
  : readFileSync(racine + f, "utf8");
const scripts = [lire("supabase-schema.sql")];
if (mode === "apres") scripts.push(lire("supabase-securite.sql"));

const db = await creerBase({ scripts });
const { orgA, orgB } = await peuplerDeuxEntreprises(db);
const { A1, A2, B1, B2 } = IDS;
const resultats = []; const verif = (famille, nom, ok, detail = "") => resultats.push({ famille, nom, ok, detail });
const refus = (r) => !r.ok;                         // erreur SQL (RLS ou privilège)
const nul = (r) => r.ok && r.n === 0;               // aucune ligne touchée

// ── Données de départ (insérées par le superutilisateur) ──
for (const t of Object.keys(TABLES)) {
  await db.exec(ligne(t, orgA, `A-${t}`)); await db.exec(ligne(t, orgB, `B-${t}`));
}
const pkVal = async (t, tag) => (await db.query(`select ${TABLES[t].pk} as k from public.${t} where org_id='${tag}'`)).rows[0].k;

for (const t of Object.keys(TABLES)) {
  const pk = TABLES[t].pk;
  for (const [u, nom, monOrg, autre] of [[A1, "A1", orgA, orgB], [A2, "A2", orgA, orgB], [B1, "B1", orgB, orgA], [B2, "B2", orgB, orgA]]) {
    const f = `${t}`;
    // Lecture
    let r = await comme(db, "authenticated", u, `select org_id from public.${t}`);
    verif(f, `${nom} lit uniquement son entreprise`, r.ok && r.rows.length === 1 && r.rows.every((x) => x.org_id === monOrg), r.ok ? `${r.rows.length} ligne(s)` : r.err);
    // Écriture chez l'autre
    r = await comme(db, "authenticated", u, ligne(t, autre, `intrus-${nom}`));
    verif(f, `${nom} ne peut pas insérer chez l'autre entreprise`, refus(r), r.ok ? "ACCEPTÉ" : r.err);
    // Modification / suppression de la ligne de l'autre
    const kAutre = await pkVal(t, autre);
    r = await comme(db, "authenticated", u, `update public.${t} set org_id='${monOrg}' where ${pk}='${kAutre}'`);
    verif(f, `${nom} ne peut pas s'approprier une ligne de l'autre`, nul(r) || refus(r), r.ok ? `${r.n} ligne(s) modifiée(s)` : r.err);
    r = await comme(db, "authenticated", u, `delete from public.${t} where ${pk}='${kAutre}'`);
    verif(f, `${nom} ne peut pas supprimer une ligne de l'autre`, nul(r) || refus(r), r.ok ? `${r.n} supprimée(s)` : r.err);
    // Déplacer sa propre ligne chez l'autre (fuite de données)
    const kMoi = await pkVal(t, monOrg);
    r = await comme(db, "authenticated", u, `update public.${t} set org_id='${autre}' where ${pk}='${kMoi}'`);
    verif(f, `${nom} ne peut pas envoyer sa ligne chez l'autre`, refus(r), r.ok ? "ACCEPTÉ" : r.err);
    // Upsert (INSERT … ON CONFLICT DO UPDATE) visant la ligne de l'autre — ce que fait supabase-js
    if (!TABLES[t].texte && pk === "id") {
      r = await comme(db, "authenticated", u, `insert into public.${t} (id, org_id) values ('${kAutre}','${monOrg}') on conflict (id) do update set org_id=excluded.org_id`);
      const encore = (await db.query(`select org_id from public.${t} where ${pk}='${kAutre}'`)).rows[0].org_id;
      verif(f, `${nom} : l'upsert ne détourne pas la ligne de l'autre`, encore === autre, r.ok ? "upsert sans erreur" : r.err);
    }
  }
  // Anonyme (clé publique seule)
  let r = await comme(db, "anon", null, `select * from public.${t}`);
  verif(t, "anonyme : lecture impossible", refus(r) || (r.ok && r.rows.length === 0), r.ok ? `${r.rows.length} ligne(s)` : r.err);
  r = await comme(db, "anon", null, ligne(t, orgA, "anon"));
  verif(t, "anonyme : écriture impossible", refus(r), r.ok ? "ACCEPTÉ" : r.err);
  r = await comme(db, "authenticated", A1, `truncate public.${t}`);
  verif(t, "utilisateur : TRUNCATE impossible (contourne RLS)", refus(r), r.ok ? "ACCEPTÉ" : r.err);
  r = await comme(db, "anon", null, `truncate public.${t}`);
  verif(t, "anonyme : TRUNCATE impossible", refus(r), r.ok ? "ACCEPTÉ" : r.err);
}

// ── Tables spéciales : profiles, organizations, ai_quotas, journal_audit ──
await db.exec(`insert into ai_quotas (org_id,month,count) values ('${orgA}','10_2026',5),('${orgB}','10_2026',7)`);
const prof = async (u) => (await db.query(`select id, org_id, role, email, nom from profiles where id='${u}'`)).rows[0];
const orgl = async (o) => (await db.query(`select id, plan, nom, tel from organizations where id='${o}'`)).rows[0];
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const attaques = async (u, sqls) => { for (const q of sqls) await comme(db, "authenticated", u, q); };
for (const [u, nom, org, autre] of [[A1, "A1", orgA, orgB], [A2, "A2", orgA, orgB], [B1, "B1", orgB, orgA], [B2, "B2", orgB, orgA]]) {
  // Chaque attaque est tentée par requête directe ; on juge l'ÉTAT FINAL de la base (RLS refuse souvent en silence).
  let r = await comme(db, "authenticated", u, `select org_id from profiles`);
  verif("profiles", `${nom} ne voit que son propre profil`, r.ok && r.rows.length === 1, r.ok ? `${r.rows.length}` : r.err);

  let avant = await prof(u);
  await attaques(u, [`update profiles set org_id='${autre}' where id='${u}'`]);
  verif("profiles", `${nom} ne peut pas changer son org_id`, memes(await prof(u), avant), `org_id=${(await prof(u)).org_id === org ? "inchangé" : "MODIFIÉ"}`);
  await attaques(u, [`update profiles set role='superadmin' where id='${u}'`]);
  verif("profiles", `${nom} ne peut pas changer son rôle`, (await prof(u)).role === avant.role, `role=${(await prof(u)).role}`);
  await attaques(u, [`update profiles set email='x@x.x' where id='${u}'`, `update profiles set id=gen_random_uuid() where id='${u}'`]);
  verif("profiles", `${nom} ne peut pas changer id/email du profil`, memes(await prof(u), avant), "");
  await attaques(u, [`insert into profiles (id, org_id, role) values (gen_random_uuid(),'${autre}','admin')`]);
  const fab = (await db.query(`select count(*)::int n from profiles where org_id='${autre}' and role='admin' and email is null`)).rows[0].n;
  verif("profiles", `${nom} ne peut pas fabriquer un profil rattaché à l'autre`, fab === 0, `${fab} profil(s) fabriqué(s)`);
  await attaques(u, [`delete from profiles where id='${u}'`]);
  verif("profiles", `${nom} ne peut pas supprimer son profil`, !!(await prof(u)), (await prof(u)) ? "présent" : "SUPPRIMÉ");
  r = await comme(db, "authenticated", u, `update profiles set nom='Nom de ${nom}' where id='${u}'`);
  verif("profiles", `${nom} PEUT modifier son nom (fonction conservée)`, (await prof(u))?.nom === `Nom de ${nom}`, r.ok ? "" : r.err);

  r = await comme(db, "authenticated", u, `select id from organizations`);
  verif("organizations", `${nom} ne voit que son entreprise`, r.ok && r.rows.length === 1 && r.rows[0].id === org, r.ok ? `${r.rows.length}` : r.err);
  let oa = await orgl(org), ob = await orgl(autre);
  await attaques(u, [`update organizations set plan='enterprise' where id='${org}'`]);
  verif("organizations", `${nom} ne peut pas se donner le plan enterprise`, (await orgl(org)).plan === oa.plan, `plan=${(await orgl(org)).plan}`);
  await attaques(u, [`update organizations set id=gen_random_uuid() where id='${org}'`]);
  verif("organizations", `${nom} ne peut pas changer l'identifiant de l'entreprise`, !!(await orgl(org)), "");
  await attaques(u, [`update organizations set nom='PIRATÉ', plan='enterprise' where id='${autre}'`]);
  verif("organizations", `${nom} ne peut pas modifier l'entreprise de l'autre`, memes(await orgl(autre), ob), "");
  await attaques(u, [`insert into organizations (nom, plan) values ('Fausse ${nom}','enterprise')`]);
  const fausse = (await db.query(`select count(*)::int n from organizations where nom='Fausse ${nom}'`)).rows[0].n;
  verif("organizations", `${nom} ne peut pas créer d'entreprise`, fausse === 0, `${fausse} créée(s)`);
  await attaques(u, [`delete from organizations where id='${org}'`]);
  verif("organizations", `${nom} ne peut pas supprimer son entreprise`, !!(await orgl(org)), (await orgl(org)) ? "présente" : "SUPPRIMÉE");
  r = await comme(db, "authenticated", u, `update organizations set nom='Raison sociale ${nom}', tel='0102030405', rccm='CI-ABJ-1' where id='${org}'`);
  verif("organizations", `${nom} PEUT modifier les coordonnées de son entreprise`, (await orgl(org))?.tel === "0102030405", r.ok ? "" : r.err);

  r = await comme(db, "authenticated", u, `select org_id from ai_quotas`);
  verif("ai_quotas", `${nom} ne lit que le quota de son entreprise`, r.ok && r.rows.length === 1 && r.rows[0].org_id === org, r.ok ? `${r.rows.length}` : r.err);
  const qv = async (o) => (await db.query(`select count from ai_quotas where org_id='${o}'`)).rows[0]?.count;
  const q0 = await qv(org), qb = await qv(autre);
  await attaques(u, [`update ai_quotas set count=0 where org_id='${org}'`,
    `insert into ai_quotas (org_id,month,count) values ('${org}','10_2026',0) on conflict (org_id,month) do update set count=0`,
    `delete from ai_quotas where org_id='${org}'`, `update ai_quotas set count=0 where org_id='${autre}'`]);
  verif("ai_quotas", `${nom} ne peut réécrire son quota IA (UPDATE / UPSERT / DELETE)`, (await qv(org)) === q0, `avant=${q0} après=${await qv(org)}`);
  verif("ai_quotas", `${nom} ne peut pas toucher le quota de l'autre`, (await qv(autre)) === qb, "");
  await db.exec(`insert into ai_quotas (org_id,month,count) values ('${org}','10_2026',${q0}) on conflict (org_id,month) do update set count=${q0}`);
}

// ── Isolation, pour les deux entreprises, du journal d'audit (mode après seulement) ──
if (mode === "apres") {
  await comme(db, "authenticated", A1, `insert into clients (org_id, nom) values ('${orgA}','tracé A')`);
  await db.exec(`insert into clients (org_id, nom) values ('${orgB}','tracé B')`);
  for (const [u, nom, org, autre] of [[A1, "A1", orgA, orgB], [A2, "A2", orgA, orgB], [B1, "B1", orgB, orgA], [B2, "B2", orgB, orgA]]) {
    let r = await comme(db, "authenticated", u, `select distinct org_id from journal_audit`);
    verif("journal_audit", `${nom} ne lit que le journal de son entreprise`, r.ok && r.rows.every((x) => x.org_id === org), r.ok ? `${r.rows.length} entreprise(s)` : r.err);
    const nj = async () => (await db.query(`select count(*)::int n, count(*) filter (where op='X')::int x from journal_audit`)).rows[0];
    const j0 = await nj();
    for (const op of [`delete from journal_audit`, `update journal_audit set op='X'`, `insert into journal_audit (table_name,op) values ('x','x')`, `truncate journal_audit`]) await comme(db, "authenticated", u, op);
    const j1 = await nj();
    verif("journal_audit", `${nom} ne peut ni effacer, ni modifier, ni falsifier le journal`, j1.n === j0.n && j1.x === 0, `lignes ${j0.n}→${j1.n}`);
  }
  const r = await comme(db, "anon", null, `select * from journal_audit`);
  verif("journal_audit", "anonyme : lecture impossible", refus(r), r.ok ? "ACCEPTÉ" : r.err);
}

// ── Affichage ──
const fam = {};
for (const x of resultats) (fam[x.famille] ??= { ok: 0, ko: 0 })[x.ok ? "ok" : "ko"]++;
console.log(`\n=== MATRICE D'ACCÈS CROISÉS — état ${mode.toUpperCase()} ===`);
for (const [f, c] of Object.entries(fam)) console.log(`${c.ko ? "❌" : "✅"} ${f.padEnd(20)} ${c.ok}/${c.ok + c.ko}`);
const ko = resultats.filter((x) => !x.ok);
const uniques = [...new Map(ko.map((x) => [x.nom.replace(/^(A1|A2|B1|B2) /, "").replace(/^(A1|A2|B1|B2) : /, ""), x])).values()];
if (ko.length) { console.log("\nÉchecs (dédoublonnés par type d'attaque) :"); for (const x of uniques) console.log(`  ✗ [${x.famille}] ${x.nom} — ${x.detail}`); }
console.log(`\nTOTAL : ${resultats.length - ko.length}/${resultats.length} contrôles conformes, ${ko.length} en échec`);
process.exit(mode === "apres" && ko.length ? 1 : 0);
