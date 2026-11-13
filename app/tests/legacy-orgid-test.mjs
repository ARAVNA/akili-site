// Données existantes rangées à l'ancienne (org_id = identifiant du compte) : restent-elles visibles et intactes ?
import { creerBase, comme, scriptsSql, ligne, TABLES, bilan } from "./lib/sim.mjs";
const R = []; const t = (n, ok, d = "") => R.push({ nom: n, ok, detail: d });
const U1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", U2 = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const db = await creerBase({ scripts: [] });                 // projet « avant » : aucune fondation, pas de déclencheur
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${U1}','u1@x.ci','{"entreprise":"U1 SARL"}'),('${U2}','u2@x.ci','{}')`);
const PRE = []; for (const tb of Object.keys(TABLES)) if ((await db.query(`select to_regclass('public.${tb}') r`)).rows[0].r) PRE.push(tb);
for (const tb of PRE) { await db.exec(ligne(tb, U1, `old1-${tb}`)); await db.exec(ligne(tb, U2, `old2-${tb}`)); }
const empreinte = async () => { const h = {}; for (const tb of PRE) h[tb] = (await db.query(`select count(*)::int n, md5(string_agg((to_jsonb(x)-array['src','tva','piece','doc_type','doc_client'])::text,'|' order by (to_jsonb(x)-array['src','tva','piece','doc_type','doc_client'])::text)) h from public.${tb} x`)).rows[0]; return JSON.stringify(h); };
const avant = await empreinte();
for (const s of scriptsSql("apres")) await db.exec(s);       // migration réelle
t("aucune ligne existante modifiée ni supprimée (empreinte MD5, hors colonnes ajoutées par la migration)", (await empreinte()) === avant);
let r = await comme(db, "authenticated", U1, `select org_id from public.clients`);
t("U1 voit toujours ses anciennes données", r.ok && r.rows.length === 1 && r.rows[0].org_id === U1, JSON.stringify(r.rows?.length));
r = await comme(db, "authenticated", U1, `select org_id from public.ecritures`);
t("U1 ne voit pas celles de U2 (écritures)", r.ok && r.rows.every((x) => x.org_id === U1) && r.rows.length === 1);
r = await comme(db, "authenticated", U2, `select org_id from public.documents`);
t("U2 ne voit que les siennes (documents)", r.ok && r.rows.length === 1 && r.rows[0].org_id === U2);
t("l'entreprise de U1 reprend le nom saisi à l'inscription", (await db.query(`select nom from public.organizations where id='${U1}'`)).rows[0]?.nom === "U1 SARL");
t("chaque compte a un profil rattaché à son entreprise", (await db.query(`select count(*)::int n from public.profiles p where p.org_id = p.id`)).rows[0].n === 2);
for (const s of scriptsSql("apres")) await db.exec(s);       // 2e exécution
t("seconde exécution : rien ne change, aucune entreprise en double", (await empreinte()) === avant && (await db.query(`select count(*)::int n from public.organizations`)).rows[0].n === 2);
process.exit(bilan("DONNÉES ANCIENNES (org_id = compte)", R) ? 1 : 0);
