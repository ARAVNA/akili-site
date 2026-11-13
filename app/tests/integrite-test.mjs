// Intégrité : clé (org_id, id) en deux phases, user_id, journal d'audit minimal et non bloquant.
import assert from "node:assert/strict";
import { creerBase, comme, peuplerDeuxEntreprises, scriptsSql, lireSql, ligne, IDS, bilan } from "./lib/sim.mjs";
const R = []; const t = async (n, f) => { try { await f(); R.push({ nom: n, ok: true }); } catch (e) { R.push({ nom: n, ok: false, detail: e.message.split("\n")[0] }); } };
const [S, SEC, PAI, I1, I2] = scriptsSql("apres");
const pk = async (db, tb) => (await db.query(`select array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k order by 1) c from pg_constraint c where contype='p' and conrelid='public.${tb}'::regclass`)).rows[0].c.join(",");
const md5 = async (db) => (await db.query(`select md5(string_agg(x::text,'|' order by x::text)) h from public.documents x`)).rows[0].h + (await db.query(`select md5(string_agg(x::text,'|' order by x::text)) h from public.achats x`)).rows[0].h;

// ── Phase 1 seule : compatible avec l'ANCIENNE et la NOUVELLE application ──
const p1 = await creerBase({ scripts: [S, SEC, PAI, I1] }); const { orgA, orgB } = await peuplerDeuxEntreprises(p1);
await t("phase 1 : la clé primaire reste (id) ; l'index unique (org_id, id) existe", async () => {
  assert.equal(await pk(p1, "documents"), "id"); assert.equal(await pk(p1, "achats"), "id");
  assert.equal((await p1.query(`select count(*)::int n from pg_indexes where indexname in ('documents_org_id_id_uq','achats_org_id_id_uq')`)).rows[0].n, 2);
});
await t("phase 1 : l'ANCIENNE application (on conflict (id)) enregistre et met à jour", async () => {
  let r = await comme(p1, "authenticated", IDS.A1, `insert into documents (id, org_id, content) values ('D-1','${orgA}','v1') on conflict (id) do update set content = excluded.content`); assert.ok(r.ok, r.err);
  r = await comme(p1, "authenticated", IDS.A1, `insert into documents (id, org_id, content) values ('D-1','${orgA}','v2') on conflict (id) do update set content = excluded.content`); assert.ok(r.ok, r.err);
  assert.equal((await p1.query(`select content from documents where id='D-1'`)).rows[0].content, "v2");
});
await t("phase 1 : la NOUVELLE application (on conflict (org_id, id)) enregistre et met à jour", async () => {
  let r = await comme(p1, "authenticated", IDS.A1, `insert into achats (id, org_id) values ('A-1','${orgA}') on conflict (org_id, id) do nothing`); assert.ok(r.ok, r.err);
  r = await comme(p1, "authenticated", IDS.A1, `insert into documents (id, org_id, content) values ('D-1','${orgA}','v3') on conflict (org_id, id) do update set content = excluded.content`); assert.ok(r.ok, r.err);
  assert.equal((await p1.query(`select content from documents where id='D-1'`)).rows[0].content, "v3");
});
await t("phase 2 : aucune ligne modifiée ; clé primaire passée à (id,org_id) ; rejouable", async () => {
  const avant = await md5(p1); await p1.exec(I2);
  assert.equal(await pk(p1, "documents"), "id,org_id"); assert.equal(await pk(p1, "achats"), "id,org_id");
  assert.equal(await md5(p1), avant); await p1.exec(I2); await p1.exec(I1); assert.equal(await md5(p1), avant);
});
await t("après phase 2 : l'ANCIENNE application (on conflict (id)) échoue (d'où l'ordre : application d'abord)", async () => {
  const r = await comme(p1, "authenticated", IDS.A1, `insert into documents (id, org_id, content) values ('D-1','${orgA}','v4') on conflict (id) do update set content = excluded.content`);
  assert.equal(r.ok, false);
});

// ── Garde-fous de la phase 2 ──
await t("phase 2 ignorée (clé inchangée, données intactes) s'il existe une ligne sans org_id", async () => {
  const d = await creerBase({ scripts: [S, SEC, PAI, I1] });
  await d.exec(`alter table documents alter column org_id drop not null; insert into documents (id, org_id, content) values ('ORPHELIN', null, 'x')`);
  const avant = await md5(d); await d.exec(I2);
  assert.equal(await pk(d, "documents"), "id"); assert.equal(await md5(d), avant);
  assert.equal(await pk(d, "achats"), "id,org_id", "l'autre table, saine, est migrée");
});
await t("phase 2 ignorée s'il existe une clé étrangère vers achats(id)", async () => {
  const d = await creerBase({ scripts: [S, SEC, PAI, I1] });
  await d.exec(`create table public.liens (a text references public.achats(id))`); await d.exec(I2);
  assert.equal(await pk(d, "achats"), "id");
});

// ── Journal d'audit : minimal et non bloquant ──
const a = await creerBase({ scripts: scriptsSql("apres") }); const O = await peuplerDeuxEntreprises(a);
await t("audit : une fiche de paie ne laisse que les NOMS des colonnes modifiées, jamais les montants", async () => {
  await a.exec(ligne("fiches_paie", O.orgA, "P1")); await a.exec(`update fiches_paie set net = 987654 where org_id='${O.orgA}'`);
  const l = (await a.query(`select avant, apres, op from journal_audit where table_name='fiches_paie' order by id desc limit 1`)).rows[0];
  assert.equal(l.op, "UPDATE"); assert.equal(l.avant, null); assert.deepEqual(l.apres.colonnes, ["net"]); assert.ok(!JSON.stringify(l).includes("987654"));
});
await t("audit : employés et profils ne laissent aucune valeur (ex. e-mail)", async () => {
  await a.exec(ligne("employes", O.orgA, "E1"));
  const l = (await a.query(`select * from journal_audit where table_name in ('employes','profiles')`)).rows;
  assert.ok(l.length > 0 && l.every((x) => x.avant == null && Object.keys(x.apres).join() === "colonnes"));
  assert.ok(!JSON.stringify(l).includes("@"));
});
await t("audit : le contenu et l'image des documents ne sont pas copiés", async () => {
  await a.exec(`insert into documents (id,org_id,content) values ('CONF-1','${O.orgA}','CONTENU TRES CONFIDENTIEL')`);
  const l = (await a.query(`select * from journal_audit where table_name='documents'`)).rows; assert.ok(l.length && !JSON.stringify(l).includes("CONFIDENTIEL"));
});
await t("audit : une panne du journal ne bloque PAS l'opération métier", async () => {
  await a.exec(`alter table journal_audit add constraint casse check (false) not valid`);
  const avant = (await a.query(`select count(*)::int n from journal_audit`)).rows[0].n;
  const r = await comme(a, "authenticated", IDS.A1, `insert into clients (org_id, nom) values ('${O.orgA}','Client malgré la panne')`);
  assert.ok(r.ok, r.err); assert.equal((await a.query(`select count(*)::int n from clients where nom='Client malgré la panne'`)).rows[0].n, 1);
  assert.equal((await a.query(`select count(*)::int n from journal_audit`)).rows[0].n, avant);
  await a.exec(`alter table journal_audit drop constraint casse`);
});
await t("audit : la fonction de purge n'existe pas (rétention = décision explicite, non automatique)", async () => {
  assert.equal((await a.query(`select count(*)::int n from pg_proc where proname='purger_journal_audit'`)).rows[0].n, 0);
});
process.exit(bilan("INTÉGRITÉ ET JOURNAL D'AUDIT", R) ? 1 : 0);
