-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Complément de schéma
-- AFRICAViT SARL · RCCM CI-ABJ-03-2026-B12-06782 · NCC 2606664 R
--
-- Projet : phwefeudkkbzknxdjktb (akili.erp)
--
-- CE SCRIPT NE DÉTRUIT RIEN. Il ne fait qu'ajouter ce qui manque :
-- tout est en CREATE IF NOT EXISTS ou ADD COLUMN IF NOT EXISTS.
-- Vous pouvez le relancer sans risque.
--
-- Où l'exécuter : SQL Editor → coller → Run (ou Ctrl+Entrée)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. LES FONDATIONS QUI MANQUENT ───────────────────────────────
-- Toutes vos tables portent org_id, mais rien ne dit à quelle
-- entreprise appartient une personne connectée. Ces deux tables
-- comblent ce trou : sans elles, aucune règle de sécurité ne peut
-- fonctionner, et l'application ne sait pas quoi afficher.

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  rccm        text,
  ncc         text,
  idu         text,
  adresse     text,
  tel         text,
  email       text,
  plan        text not null default 'starter',
  created_at  timestamptz not null default now()
);
comment on table public.organizations is
  'Entreprise cliente. Son id est l''org_id porté par toutes les autres tables.';

-- Le profil fait le pont entre un compte Supabase Auth et son entreprise.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid references public.organizations(id) on delete set null,
  nom         text,
  email       text,
  role        text not null default 'admin',
  cgu_acceptees_le timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.profiles is
  'Pont entre un compte Supabase Auth et son entreprise. id = auth.uid().';

create index if not exists profiles_org_idx on public.profiles (org_id);

-- Fonction de référence : l'entreprise de la personne connectée.
-- Toutes les règles de sécurité s'appuient dessus. En security definer
-- pour qu'elle puisse lire profiles sans être bloquée par sa propre RLS.
create or replace function public.mon_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid() limit 1
$$;

-- À l'inscription, créer l'entreprise et le profil automatiquement.
-- Sans ce déclencheur, chaque nouveau compte arriverait sans entreprise
-- et ne verrait rien.
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nouvelle_org uuid;
begin
  insert into public.organizations (nom)
  values (coalesce(new.raw_user_meta_data->>'entreprise',
                   split_part(new.email, '@', 1)))
  returning id into nouvelle_org;

  insert into public.profiles (id, org_id, nom, email)
  values (new.id, nouvelle_org,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil();


-- ─── 2. LES TABLES MÉTIER QUI MANQUENT ────────────────────────────
-- Mêmes conventions que vos tables existantes : id uuid, org_id uuid,
-- created_at timestamptz, colonnes en français.

-- achats.fournisseur_id pointe ici, mais la table n'existait pas.
create table if not exists public.fournisseurs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  nom         text not null,
  contact     text,
  tel         text,
  email       text,
  compte      text default '401',
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.stocks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  nom           text not null,
  categorie     text,
  quantite      numeric not null default 0,
  unite         text default 'unité',
  prix_achat    numeric default 0,
  prix_vente    numeric default 0,
  seuil_alerte  numeric default 0,
  fournisseur   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.mouvements_stock (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  produit_id    uuid references public.stocks(id) on delete cascade,
  produit_nom   text,
  type          text not null,          -- 'entree' | 'sortie'
  quantite      numeric not null,
  motif         text,
  date          text,
  ancien_stock  numeric,
  nouveau_stock numeric,
  created_at    timestamptz not null default now()
);

create table if not exists public.fiches_paie (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  employe_id      uuid references public.employes(id) on delete set null,
  employe_nom     text,
  poste           text,
  mois            text not null,
  brut            numeric not null default 0,
  cnps_salarie    numeric not null default 0,
  cnps_patronal   numeric not null default 0,
  its             numeric not null default 0,
  net             numeric not null default 0,
  cout_total      numeric not null default 0,
  date            text,
  created_at      timestamptz not null default now()
);
comment on table public.fiches_paie is
  'Bulletins de paie. Barèmes CNPS et ITS de Côte d''Ivoire 2026.';

create table if not exists public.projets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  nom         text not null,
  client      text,
  budget      numeric default 0,
  echeance    text,
  avancement  integer not null default 0,
  colonne     text not null default 'afaire',   -- afaire | encours | termine
  notes       text,
  created_at  timestamptz not null default now()
);

-- Signature électronique simple : tracé, identité déclarée, horodatage
-- et empreinte du contenu signé. Distincte de DocuSign, dont le suivi
-- vit déjà dans documents.docusign_envelope_id.
create table if not exists public.signatures (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  document_id   text,
  signataire    text not null,
  qualite       text,
  horodatage    timestamptz not null default now(),
  empreinte     text not null,
  image         text,
  created_at    timestamptz not null default now()
);
comment on table public.signatures is
  'Signature électronique SIMPLE (tracé + empreinte SHA-256). Pas une signature qualifiée.';

-- Taux de change saisis. L''euro est en parité fixe légale avec le
-- franc CFA (655,957) et n''a pas besoin d''être stocké ; le dollar
-- flotte et doit être tenu à jour.
create table if not exists public.taux_change (
  org_id      uuid primary key,
  usd         numeric,
  maj         timestamptz not null default now()
);


-- ─── 3. COMPLÉMENTS SUR LES TABLES EXISTANTES ─────────────────────

-- Relier une écriture à la pièce qui l'a engendrée. Sans cela,
-- modifier une facture crée un doublon d'écritures au lieu de
-- remplacer les anciennes.
alter table public.ecritures add column if not exists src text;
create index if not exists ecritures_src_idx on public.ecritures (org_id, src);
create index if not exists ecritures_compte_idx on public.ecritures (org_id, compte);

-- L'OHADA impose de séparer les journaux. La colonne existe déjà ;
-- on lui donne une valeur par défaut pour les écritures à venir.
alter table public.ecritures alter column journal set default 'OD';

-- Quotas IA : une ligne par organisation et par mois.
create unique index if not exists ai_quotas_org_mois
  on public.ai_quotas (org_id, month);


-- Colonnes nécessaires à l'application et absentes de la table achats :
-- sans elles, le taux de TVA et le numéro de pièce justificative seraient
-- perdus à l'enregistrement. L'OHADA exige la pièce justificative.
alter table public.achats add column if not exists tva numeric default 18;
alter table public.achats add column if not exists piece text;

-- De quel document une signature relève, pour l'afficher sans jointure.
alter table public.signatures add column if not exists doc_type text;
alter table public.signatures add column if not exists doc_client text;

-- ─── 4. SÉCURITÉ AU NIVEAU DES LIGNES ─────────────────────────────
-- Sans ceci, n'importe quel visiteur muni de la clé publique lirait la
-- comptabilité de tous vos clients. Ce n'est pas optionnel.
--
-- La règle est partout la même : on ne voit que les lignes de son
-- entreprise. Elle est posée en boucle pour n'oublier aucune table.

do $$
declare
  t text;
  tables text[] := array[
    'achats','ai_quotas','clients','comptes_tresorerie','crm_leads',
    'documents','ecritures','efactures','employes',
    'fournisseurs','stocks','mouvements_stock','fiches_paie','projets',
    'signatures','taux_change'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "akili_org" on public.%I', t);
    execute format(
      'create policy "akili_org" on public.%I for all to authenticated
         using (org_id = public.mon_org())
         with check (org_id = public.mon_org())', t);
  end loop;
end $$;

-- Droits d'accès. Supabase les accorde en principe automatiquement aux
-- nouvelles tables, mais on ne laisse pas la sécurité d'une comptabilité
-- dépendre d'un « en principe ». Les règles RLS ci-dessus restent le
-- véritable verrou : ces droits ouvrent la porte, RLS décide qui passe.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','achats','ai_quotas','clients',
    'comptes_tresorerie','crm_leads','documents','ecritures','efactures',
    'employes','fournisseurs','stocks','mouvements_stock','fiches_paie',
    'projets','signatures','taux_change'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant execute on function public.mon_org() to authenticated;

-- Le profil et l'entreprise suivent une règle différente : on lit son
-- propre profil, et l'entreprise à laquelle on appartient.
alter table public.profiles enable row level security;
drop policy if exists "akili_profil" on public.profiles;
create policy "akili_profil" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.organizations enable row level security;
drop policy if exists "akili_org_lecture" on public.organizations;
create policy "akili_org_lecture" on public.organizations
  for select to authenticated
  using (id = public.mon_org());
drop policy if exists "akili_org_maj" on public.organizations;
create policy "akili_org_maj" on public.organizations
  for update to authenticated
  using (id = public.mon_org()) with check (id = public.mon_org());


-- ─── 5. RATTRAPAGE DES COMPTES DÉJÀ CRÉÉS ─────────────────────────
-- Les comptes inscrits avant ce script n'ont ni entreprise ni profil.
-- On leur en crée un, sinon ils ne verraient plus rien.

do $$
declare
  u record;
  nouvelle_org uuid;
begin
  for u in
    select id, email, raw_user_meta_data from auth.users
    where id not in (select id from public.profiles)
  loop
    insert into public.organizations (nom)
    values (coalesce(u.raw_user_meta_data->>'entreprise',
                     split_part(u.email,'@',1)))
    returning id into nouvelle_org;

    insert into public.profiles (id, org_id, nom, email)
    values (u.id, nouvelle_org,
            coalesce(u.raw_user_meta_data->>'name', split_part(u.email,'@',1)),
            u.email);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — relancez ceci après coup, connecté dans l'application
-- ═══════════════════════════════════════════════════════════════════
select
  t.tablename as table_name,
  case when c.relrowsecurity then 'protégée' else '⚠️ OUVERTE À TOUS' end as securite,
  (select count(*) from pg_policies p
    where p.schemaname='public' and p.tablename=t.tablename) as regles
from pg_tables t
join pg_class c on c.relname = t.tablename
where t.schemaname = 'public'
order by c.relrowsecurity, t.tablename;
