// Autorisations des documents générés (table documents) + collisions d'identifiants.
// Usage : node tests/documents-db-test.mjs
import { creerBase, comme, peuplerDeuxEntreprises, scriptsSql, IDS, bilan } from "./lib/sim.mjs";
import { randomBytes } from "node:crypto";
const R = []; const t = (nom, ok, detail = "") => R.push({ nom, ok, detail });
const db = await creerBase({ scripts: scriptsSql("apres") });
const { orgA, orgB } = await peuplerDeuxEntreprises(db); const { A1, A2, B1, B2 } = IDS;
const doc = (id, org, txt = "contenu", uid = null) => `insert into documents (id, org_id, content) values ('${id}','${org}','${txt}')`;

// Création par A1 (comme l'application : org_id issu du profil)
let r = await comme(db, "authenticated", A1, doc("FAC-2026-AAAA", orgA, "Facture confidentielle A"));
t("A1 enregistre un document de son entreprise", r.ok, r.err);
r = await comme(db, "authenticated", A2, `select content from documents`);
t("A2 (même entreprise) lit les documents de A1 — comportement voulu aujourd'hui, pas de cloisonnement par rôle", r.ok && r.rows.length === 1, r.ok ? `${r.rows.length} doc` : r.err);
for (const [u, n] of [[B1, "B1"], [B2, "B2"]]) {
  r = await comme(db, "authenticated", u, `select content from documents`);
  t(`${n} ne voit aucun document de l'entreprise A`, r.ok && r.rows.length === 0, r.ok ? `${r.rows.length}` : r.err);
  r = await comme(db, "authenticated", u, `select content from documents where id='FAC-2026-AAAA'`);
  t(`${n} ne peut pas lire un document par son identifiant exact`, r.ok && r.rows.length === 0, "");
  await comme(db, "authenticated", u, `update documents set content='PIRATÉ' where id='FAC-2026-AAAA'`);
  await comme(db, "authenticated", u, `delete from documents where id='FAC-2026-AAAA'`);
  await comme(db, "authenticated", u, `insert into documents (id, org_id, content) values ('FAC-2026-AAAA','${orgB}','écrasement') on conflict (id) do update set content=excluded.content, org_id=excluded.org_id`);
  const c = (await db.query(`select content, org_id from documents where id='FAC-2026-AAAA'`)).rows[0];
  t(`${n} ne peut ni modifier, ni supprimer, ni écraser (upsert) le document de A`, c && c.content === "Facture confidentielle A" && c.org_id === orgA, c ? c.content : "SUPPRIMÉ");
}
r = await comme(db, "authenticated", B1, doc("FAC-2026-BBBB", orgA, "injecté dans A"));
t("B1 ne peut pas déposer un document dans l'entreprise A", !r.ok, r.ok ? "ACCEPTÉ" : r.err);

// Collision d'identifiant entre entreprises : clé primaire (org_id, id) après supabase-integrite(-phase2).sql
r = await comme(db, "authenticated", B1, doc("FAC-2026-AAAA", orgB, "même numéro, autre entreprise"));
t("clé (org_id, id) : B1 peut enregistrer un document de même numéro que celui de A (plus de refus, donc plus de fuite d'existence ni de perte silencieuse)", r.ok, r.ok ? "" : r.err);
r = await db.query(`select org_id, content from documents where id='FAC-2026-AAAA' order by content`);
t("…et le document de A est intact (ni écrasé ni modifié)", r.rows.length === 2 && r.rows.some((x) => x.org_id === orgA && x.content === "Facture confidentielle A"), JSON.stringify(r.rows.map((x) => x.content)));
r = await comme(db, "authenticated", B1, `insert into documents (id, org_id, content) values ('FAC-2026-AAAA','${orgB}','mise à jour par B') on conflict (org_id, id) do update set content = excluded.content`);
t("upsert de B sur le même numéro : met à jour SA ligne uniquement", r.ok && (await db.query(`select content from documents where id='FAC-2026-AAAA' and org_id='${orgA}'`)).rows[0].content === "Facture confidentielle A");
r = await comme(db, "authenticated", B1, `select count(*)::int n from documents where id='FAC-2026-AAAA'`);
t("B1 ne voit qu'une ligne portant ce numéro (la sienne)", r.ok && r.rows[0].n === 1);
t("la clé primaire est bien (org_id, id) sur documents et achats", (await db.query(`select count(*)::int n from pg_constraint c where contype='p' and conrelid in ('public.documents'::regclass,'public.achats'::regclass) and array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k order by 1) = array['id','org_id']`)).rows[0].n === 2);

// Probabilité de collision : ancien schéma (4 chiffres) contre nouveau (40 bits)
const ancien = () => `FAC-2026-${(1.7e12 + Math.floor(Math.random() * 3e8)).toString().slice(-4)}`;
const nouveau = () => `FAC-2026-${randomBytes(5).toString("hex").toUpperCase()}`;
const essais = (gen, n, essaisN) => { let c = 0; for (let i = 0; i < essaisN; i++) { const s = new Set(); for (let j = 0; j < n; j++) s.add(gen()); if (s.size < n) c++; } return c / essaisN; };
const pAnc = essais(ancien, 100, 2000), pNouv = essais(nouveau, 100, 2000);
t(`ancien format : 100 documents d'une entreprise → collision dans ${(pAnc * 100).toFixed(0)} % des cas (mesuré)`, pAnc > 0.2, `${(pAnc * 100).toFixed(1)} %`);
t("nouveau format : 100 documents → 0 collision sur 2 000 séries", pNouv === 0, `${pNouv}`);
const grand = new Set(); for (let i = 0; i < 300000; i++) grand.add(nouveau());
t("nouveau format : 300 000 identifiants, 0 doublon", grand.size === 300000, `${grand.size}`);

// Intégrité du champ propriétaire (user_id) : forcé par la base (supabase-integrite.sql)
r = await comme(db, "authenticated", A2, `insert into documents (id, org_id, content, user_id) values ('FAC-2026-FORG','${orgA}','x','${A1}')`);
t("user_id falsifié à l'insertion (A2 se fait passer pour A1) : la base enregistre A2", r.ok && (await db.query(`select user_id from documents where id='FAC-2026-FORG'`)).rows[0].user_id === A2);
r = await comme(db, "authenticated", A1, `update documents set user_id='${A1}' where id='FAC-2026-FORG'`);
t("modification de user_id par un collègue : l'auteur d'origine est conservé", (await db.query(`select user_id from documents where id='FAC-2026-FORG'`)).rows[0].user_id === A2);
r = await comme(db, "authenticated", A1, `insert into documents (id, org_id, content) values ('FAC-2026-SANS','${orgA}','x')`);
t("sans user_id fourni : la base renseigne l'utilisateur connecté", r.ok && (await db.query(`select user_id from documents where id='FAC-2026-SANS'`)).rows[0].user_id === A1);
await db.exec("set role service_role"); await db.exec(`insert into documents (id, org_id, content, user_id) values ('FAC-2026-SRV','${orgA}','x','${B1}')`); await db.exec("reset role");
t("opération serveur (service_role) : user_id laissé tel que fourni", (await db.query(`select user_id from documents where id='FAC-2026-SRV'`)).rows[0].user_id === B1);
await db.exec(`insert into documents (id,org_id,content) values ('X-1','${orgA}','x')`);
let dd = await db.query(`select count(*)::int n from pg_policies where tablename='documents'`);
t("CONSTAT (rôles, à venir) : tout collaborateur d'une entreprise lit encore tous ses documents", (await comme(db, "authenticated", A2, `select 1 from documents where id='X-1'`)).rows?.length === 1);
process.exit(bilan("AUTORISATIONS DES DOCUMENTS GÉNÉRÉS", R) ? 1 : 0);
