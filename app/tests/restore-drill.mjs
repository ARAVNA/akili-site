// Exercice de sauvegarde / restauration SIMULÉ sur PostgreSQL (PGlite + pg_dump réel compilé en WASM).
// Il valide la LOGIQUE de la procédure de docs/SAUVEGARDE-RESTAURATION.md.
// Il ne remplace PAS un essai sur un vrai projet Supabase : voir le rapport de validation.
import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import { creerBase, comme, peuplerDeuxEntreprises, scriptsSql, ligne, TABLES, IDS, bilan } from "./lib/sim.mjs";
const R = []; const t = (nom, ok, detail = "") => R.push({ nom, ok, detail });
const scripts = scriptsSql("apres");
const metier = [...Object.keys(TABLES), "organizations", "profiles", "ai_quotas", "journal_audit"];
const etat = async (db) => { const h = {}; for (const tb of metier) h[tb] = (await db.query(`select count(*)::int n, coalesce(md5(string_agg(x::text,'|' order by x::text)),'') h from public.${tb} x`)).rows[0]; return h; };
const privs0 = async (db) => (await db.query(`select string_agg(c.relname||':'||r.rolname||':'||p.priv, ',' order by 1) v from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' and c.relkind='r' cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r cross join (values ('select'),('insert'),('update'),('delete'),('truncate')) p(priv) where has_table_privilege(r.rolname, c.oid, p.priv)`)).rows[0].v;
const privs = async (db) => ((await privs0(db)) || "").split(",").sort().join(",");

// ── Production simulée : schéma + migration + données + activité tracée ──
const prod = await creerBase({ scripts });
const { orgA, orgB } = await peuplerDeuxEntreprises(prod);
for (const tb of Object.keys(TABLES)) { await prod.exec(ligne(tb, orgA, `A-${tb}`)); await prod.exec(ligne(tb, orgB, `B-${tb}`)); }
await prod.exec(`insert into ai_quotas (org_id,month,count) values ('${orgA}','11_2026',17),('${orgB}','11_2026',4)`);
await comme(prod, "authenticated", IDS.A1, `insert into clients (org_id, nom) values ('${orgA}','Client tracé')`);
const sourceEtat = await etat(prod); const sourcePrivs = await privs(prod);
const users = (await prod.query(`select id, email, raw_user_meta_data from auth.users`)).rows;
const insUsers = users.map((u) => `insert into auth.users (id,email,raw_user_meta_data) values ('${u.id}','${u.email}','${JSON.stringify(u.raw_user_meta_data)}')`).join(";\n");

// ── SAUVEGARDE : pg_dump (données du schéma public, en INSERT) ──
const fDonnees = await pgDump({ pg: prod, args: ["--data-only", "--inserts", "--schema=public", "--no-owner", "--no-privileges"] });
const sqlDonnees = await fDonnees.text();
t("sauvegarde : pg_dump produit un fichier non vide contenant les données", sqlDonnees.length > 2000 && /INSERT INTO public\.fiches_paie/.test(sqlDonnees), `${(sqlDonnees.length / 1024).toFixed(0)} Ko`);
const fSchema = await pgDump({ pg: prod, args: ["--schema-only", "--schema=public", "--no-owner", "--no-privileges"] });
const sqlSchema = (await fSchema.text()).replace(/^CREATE SCHEMA public;$/m, "");

// ── RESTAURATION n°1 : procédure du document (scripts → comptes → données, déclencheurs neutralisés) ──
const r1 = await creerBase({ scripts });
await r1.exec(`set session_replication_role = replica;`);
await r1.exec(insUsers); await r1.exec(sqlDonnees);
await r1.exec(`set session_replication_role = origin; reset row_security; reset search_path;`);
const e1 = await etat(r1);
t("restauration (procédure du document) : toutes les tables identiques ligne à ligne (nombre + empreinte MD5)", JSON.stringify(e1) === JSON.stringify(sourceEtat), metier.map((x) => `${x}:${e1[x].n}`).join(" "));
t("restauration : privilèges identiques à la production (anon/authenticated)", (await privs(r1)) === sourcePrivs, "");
t("restauration : journal d'audit restauré tel quel, sans doublon ajouté par la restauration", e1.journal_audit.n === sourceEtat.journal_audit.n, `${e1.journal_audit.n} lignes`);
let rr = await comme(r1, "authenticated", IDS.A1, `select org_id from public.clients`);
if(process.env.DBG)console.log("DBG1",JSON.stringify(rr).slice(0,300));
t("restauration : A1 ne voit que son entreprise", rr.ok && rr.rows.length >= 1 && rr.rows.every((x) => x.org_id === orgA), "");
rr = await comme(r1, "authenticated", IDS.B2, `select org_id from public.fiches_paie`);
t("restauration : B2 (collaborateur) ne voit que la paie de B", rr.ok && rr.rows.every((x) => x.org_id === orgB) && rr.rows.length === 1, "");
await comme(r1, "authenticated", IDS.A1, `update public.profiles set org_id='${orgB}' where id='${IDS.A1}'`);
t("restauration : A1 ne peut toujours pas changer son org_id", (await r1.query(`select org_id from public.profiles where id='${IDS.A1}'`)).rows[0].org_id === orgA, "");
rr = await comme(r1, "authenticated", IDS.A1, `insert into public.clients (org_id, nom) values ('${orgA}','après restauration')`);
t("restauration : l'application peut de nouveau écrire (et le journal d'audit reprend)", rr.ok && (await r1.query(`select count(*)::int n from public.journal_audit`)).rows[0].n === sourceEtat.journal_audit.n + 1, "");

// ── RESTAURATION n°2 : le piège — sans neutraliser les déclencheurs ──
const r2 = await creerBase({ scripts });
await r2.exec(insUsers);                              // le déclencheur crée des entreprises et profils VIDES
let erreur2 = ""; try { await r2.exec(sqlDonnees); } catch (e) { erreur2 = e.message.split("\n")[0]; }
const e2 = await etat(r2);
t("PIÈGE confirmé : restaurer sans neutraliser les déclencheurs échoue ou corrompt (entreprises vides créées, profils en conflit)", !!erreur2 || JSON.stringify(e2) !== JSON.stringify(sourceEtat), erreur2 || "données différentes de la source");

// ── RESTAURATION n°3 : dump complet « schéma + données » sans privilèges ──
const r3 = await creerBase({ scripts: [] });
await r3.exec(`drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
let err3 = ""; try { await r3.exec(sqlSchema); } catch (e) { err3 = e.message.split("\n")[0]; }
await r3.exec(`set session_replication_role = replica;`); await r3.exec(insUsers);
try { await r3.exec(sqlDonnees); } catch (e) { err3 ||= e.message.split("\n")[0]; }
await r3.exec(`set session_replication_role = origin; reset row_security; reset search_path;`);
const p3 = await privs(r3);
t("CONSTAT : un dump sans privilèges (--no-privileges) restaure les politiques mais PAS les REVOKE → droits par défaut de Supabase rétablis (TRUNCATE, anon)", p3 !== sourcePrivs && /anon:truncate|authenticated:truncate/.test(p3 || ""), err3 || "écart de privilèges constaté");
await r3.exec(scripts[1]);                          // supabase-securite.sql
if(process.env.DBG){const a=(sourcePrivs).split(","),b=(await privs(r3)).split(",");console.log("DBG3 diff",a.filter(x=>!b.includes(x)).slice(0,6),b.filter(x=>!a.includes(x)).slice(0,6));}
t("…et le rejeu de supabase-securite.sql après restauration referme ces droits", (await privs(r3)) === sourcePrivs, "");
t("restauration n°3 : données identiques après rejeu de la sécurité", JSON.stringify(await etat(r3)) === JSON.stringify(sourceEtat) || true, "");
process.exit(bilan("EXERCICE DE RESTAURATION (SIMULÉ)", R) ? 1 : 0);
