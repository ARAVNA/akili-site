-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Durcissement de la sécurité (à exécuter APRÈS supabase-schema.sql)
--
-- Ce script ne supprime aucune donnée et aucune table. Il peut être relancé
-- sans risque. Il corrige quatre failles trouvées à la lecture des règles RLS
-- de supabase-schema.sql :
--
--   1. profiles : un utilisateur pouvait modifier SA PROPRE ligne en entier,
--      donc changer son org_id (entrer dans l'entreprise d'un autre) ou son
--      rôle. → il ne peut plus modifier que son nom et l'acceptation des CGU.
--   2. organizations : tout membre pouvait modifier la colonne « plan » et se
--      donner l'offre enterprise gratuitement. → colonnes figées.
--   3. ai_quotas : tout membre pouvait réécrire son compteur de quota IA.
--      → lecture seule pour les utilisateurs, écriture réservée au serveur.
--   4. Aucune traçabilité : ajout de journal_audit (lecture seule, alimenté
--      par des déclencheurs sur les tables sensibles).
--
-- Retour arrière : voir la fin du fichier (section ROLLBACK, en commentaire).
-- Avant de l'exécuter : faites une sauvegarde (docs/SAUVEGARDE-RESTAURATION.md).
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ─── 1. profiles : plus de modification de org_id / role ──────────
drop policy if exists "akili_profil" on public.profiles;
drop policy if exists "akili_profil_lecture" on public.profiles;
drop policy if exists "akili_profil_maj" on public.profiles;

create policy "akili_profil_lecture" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "akili_profil_maj" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Les droits de colonne sont le vrai verrou : RLS décide QUELLES lignes,
-- les GRANT décident QUELLES colonnes.
revoke all on public.profiles from anon;
revoke truncate, references, trigger, insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (nom, cgu_acceptees_le) on public.profiles to authenticated;
-- Le profil est créé par le déclencheur creer_profil (security definer) :
-- aucun besoin que le navigateur puisse insérer.

-- ─── 2. organizations : le plan ne se modifie pas depuis le navigateur ─
revoke all on public.organizations from anon;
revoke truncate, references, trigger, insert, update, delete on public.organizations from authenticated;
grant select on public.organizations to authenticated;
grant update (nom, rccm, ncc, idu, adresse, tel, email)
  on public.organizations to authenticated;
-- Changer de plan = opération serveur (paiement validé), avec la clé
-- service_role, jamais depuis l'application.

-- ─── 3. ai_quotas : lecture seule côté navigateur ─────────────────
do $$
begin
  if to_regclass('public.ai_quotas') is not null then
    drop policy if exists "akili_org" on public.ai_quotas;
    drop policy if exists "akili_quota_lecture" on public.ai_quotas;
    create policy "akili_quota_lecture" on public.ai_quotas
      for select to authenticated using (org_id = public.mon_org());
    revoke all on public.ai_quotas from anon;
    revoke truncate, references, trigger, insert, update, delete on public.ai_quotas from authenticated;
    grant select on public.ai_quotas to authenticated;
  end if;
end $$;

-- Incrément atomique du quota, appelé uniquement par /api/ia (service_role).
create or replace function public.incrementer_quota_ia(p_org uuid, p_month text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_quotas (org_id, month, count)
  values (p_org, p_month, 1)
  on conflict (org_id, month)
  do update set count = public.ai_quotas.count + 1
  returning count
$$;
revoke all on function public.incrementer_quota_ia(uuid, text) from public, anon, authenticated;
grant execute on function public.incrementer_quota_ia(uuid, text) to service_role;

-- ─── 4. Fonctions : seulement à qui en a besoin ───────────────────
revoke all on function public.creer_profil() from public, anon, authenticated;
revoke all on function public.mon_org() from public, anon;
grant execute on function public.mon_org() to authenticated;

-- ─── 4 bis. Droits par défaut de Supabase : retirer l'inutile ────────
-- Supabase accorde TOUS les droits (dont TRUNCATE, qui contourne RLS) à anon
-- et authenticated sur chaque nouvelle table. Seules les tables d'AKILI sont
-- traitées ici, nommément : aucune autre table du projet n'est touchée.
-- (Conséquence : la clé publique « anon » ne peut plus rien lire dans ces
-- tables ; le keepalive reçoit « permission denied », ce qui réveille quand
-- même la base.)
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','achats','ai_quotas','clients','comptes_tresorerie',
    'crm_leads','documents','ecritures','efactures','employes','fournisseurs',
    'stocks','mouvements_stock','fiches_paie','projets','signatures','taux_change'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;

-- ─── 5. Journal d'audit ───────────────────────────────────────────
create table if not exists public.journal_audit (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  org_id     uuid,
  user_id    uuid,
  table_name text not null,
  op         text not null,          -- INSERT | UPDATE | DELETE
  row_id     text,
  avant      jsonb,
  apres      jsonb
);
create index if not exists journal_audit_org_idx on public.journal_audit (org_id, at desc);
create index if not exists journal_audit_table_idx on public.journal_audit (table_name, at desc);

alter table public.journal_audit enable row level security;
drop policy if exists "akili_audit_lecture" on public.journal_audit;
create policy "akili_audit_lecture" on public.journal_audit
  for select to authenticated using (org_id = public.mon_org());
revoke all on public.journal_audit from authenticated, anon;
revoke all on sequence public.journal_audit_id_seq from authenticated, anon;
grant select on public.journal_audit to authenticated;

create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'image' end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'image' end;
  v_ref jsonb := coalesce(v_new, v_old);
  v_org uuid;
begin
  -- organizations porte son identifiant dans « id », les autres dans « org_id ».
  v_org := coalesce((v_ref->>'org_id')::uuid,
                    case when tg_table_name = 'organizations' then (v_ref->>'id')::uuid end);
  insert into public.journal_audit (org_id, user_id, table_name, op, row_id, avant, apres)
  values (v_org, auth.uid(), tg_table_name, tg_op, v_ref->>'id', v_old, v_new);
  return null;   -- déclencheur AFTER : la valeur de retour est ignorée
end;
$$;
revoke all on function public.journaliser() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'ecritures','fiches_paie','documents','efactures','employes','achats',
    'signatures','clients','fournisseurs','organizations','profiles'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop trigger if exists akili_audit on public.%I', t);
    execute format(
      'create trigger akili_audit after insert or update or delete on public.%I
         for each row execute function public.journaliser()', t);
  end loop;
end $$;

commit;

-- ─── Vérification (lecture seule) ─────────────────────────────────
select tablename,
       case when c.relrowsecurity then 'RLS active' else '⚠️ RLS ABSENTE' end as securite
from pg_tables t join pg_class c on c.relname = t.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
where t.schemaname = 'public'
order by c.relrowsecurity, tablename;

-- ─── ROLLBACK (à n'utiliser qu'en cas de besoin, en le décommentant) ──
-- drop trigger if exists akili_audit on public.<table>;   -- pour chaque table
-- drop function if exists public.journaliser();
-- drop function if exists public.incrementer_quota_ia(uuid, text);
-- grant insert, update, delete on public.profiles, public.organizations, public.ai_quotas to authenticated;
-- (puis rejouer supabase-schema.sql pour retrouver les anciennes règles)
