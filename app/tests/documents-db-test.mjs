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

// Collision d'identifiant entre entreprises : la clé primaire est globale
r = await comme(db, "authenticated", B1, doc("FAC-2026-AAAA", orgB, "même numéro"));
t("CONSTAT : clé primaire globale — B1 ne peut pas enregistrer un document dont le numéro existe déjà chez A (échec visible = perte silencieuse côté application, et fuite d'existence)", !r.ok && /duplicate|unique|23505/i.test(r.err), r.ok ? "accepté" : r.err);

// Probabilité de collision : ancien schéma (4 chiffres) contre nouveau (40 bits)
const ancien = () => `FAC-2026-${(1.7e12 + Math.floor(Math.random() * 3e8)).toString().slice(-4)}`;
const nouveau = () => `FAC-2026-${randomBytes(5).toString("hex").toUpperCase()}`;
const essais = (gen, n, essaisN) => { let c = 0; for (let i = 0; i < essaisN; i++) { const s = new Set(); for (let j = 0; j < n; j++) s.add(gen()); if (s.size < n) c++; } return c / essaisN; };
const pAnc = essais(ancien, 100, 2000), pNouv = essais(nouveau, 100, 2000);
t(`ancien format : 100 documents d'une entreprise → collision dans ${(pAnc * 100).toFixed(0)} % des cas (mesuré)`, pAnc > 0.2, `${(pAnc * 100).toFixed(1)} %`);
t("nouveau format : 100 documents → 0 collision sur 2 000 séries", pNouv === 0, `${pNouv}`);
const grand = new Set(); for (let i = 0; i < 300000; i++) grand.add(nouveau());
t("nouveau format : 300 000 identifiants, 0 doublon", grand.size === 300000, `${grand.size}`);

// Intégrité du champ propriétaire (user_id) : non vérifiée par la base
await db.exec(`alter table documents add column if not exists user_id uuid`);
r = await comme(db, "authenticated", A2, `insert into documents (id, org_id, content, user_id) values ('FAC-2026-FORG','${orgA}','x','${A1}')`);
t("CONSTAT : un collaborateur peut se faire passer pour un autre dans user_id (même entreprise) — sans effet inter-entreprises, à traiter avec les rôles", r.ok, "");
process.exit(bilan("AUTORISATIONS DES DOCUMENTS GÉNÉRÉS", R) ? 1 : 0);
