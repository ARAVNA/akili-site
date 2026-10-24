-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Table de synchronisation + politiques de sécurité
-- AFRICAViT SARL · RCCM CI-ABJ-03-2026-B12-06782
--
-- Où l'exécuter : app.supabase.com → ton projet → SQL Editor
--                 → coller → Run
--
-- ADDITIF : ce script ne touche à aucune table existante
-- (organizations, profiles, clients). Il crée une table à part.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. La table ───────────────────────────────────────────────────
-- Une ligne par module et par portée.
--   scope = 'org:<uuid>'  → données de l'entreprise, partagées
--   scope = 'user:<uuid>' → données personnelles (chat IA, quotas)
create table if not exists public.akili_stores (
  scope      text        not null,
  key        text        not null,
  data       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

comment on table public.akili_stores is
  'AKILI ERP — état des modules (documents, stocks, RH, OHADA, chat, quotas). Une ligne par module et par portée.';

create index if not exists akili_stores_scope_idx on public.akili_stores (scope);

-- ─── 2. Sécurité au niveau des lignes ──────────────────────────────
-- Sans ceci, n'importe quel visiteur muni de la clé publique lirait
-- la comptabilité de tous tes clients. Ce n'est pas optionnel.
alter table public.akili_stores enable row level security;

-- Portée personnelle : 'user:<mon uuid>'
create policy "akili_stores — portée personnelle"
  on public.akili_stores
  for all
  to authenticated
  using      (scope = 'user:' || auth.uid()::text)
  with check (scope = 'user:' || auth.uid()::text);

-- Portée entreprise : 'org:<uuid de mon organisation>'
--
-- ⚠️ HYPOTHÈSE À VÉRIFIER : ce bloc suppose que ta table `profiles`
-- possède une colonne `id` égale à auth.uid() et une colonne
-- `organization_id`. Si tes colonnes portent d'autres noms, corrige-les
-- ici — c'est le seul endroit à adapter.
--
-- Pour vérifier :  select * from public.profiles limit 1;
create or replace function public.akili_mon_org()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'org:' || p.organization_id::text
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create policy "akili_stores — portée entreprise"
  on public.akili_stores
  for all
  to authenticated
  using      (scope = public.akili_mon_org())
  with check (scope = public.akili_mon_org());

-- ─── 3. Temps réel ─────────────────────────────────────────────────
-- Sans cette ligne, une saisie faite sur le téléphone n'apparaîtra pas
-- sur l'ordinateur sans rechargement.
alter publication supabase_realtime add table public.akili_stores;

-- ─── 4. Horodatage automatique ─────────────────────────────────────
create or replace function public.akili_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists akili_stores_touch on public.akili_stores;
create trigger akili_stores_touch
  before update on public.akili_stores
  for each row execute function public.akili_touch();


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — à exécuter après coup, connecté dans l'application
-- ═══════════════════════════════════════════════════════════════════
-- select public.akili_mon_org();        -- doit renvoyer 'org:<uuid>', pas null
-- select scope, key, jsonb_array_length(data) as lignes, updated_at
--   from public.akili_stores order by updated_at desc;


-- ═══════════════════════════════════════════════════════════════════
-- LIMITE À CONNAÎTRE
-- ═══════════════════════════════════════════════════════════════════
-- Chaque module tient dans UNE ligne jsonb. C'est ce qui rend la
-- lecture très économique : afficher 200 clients coûte une requête.
--
-- En contrepartie, un module devient lourd à partir de quelques
-- milliers d'enregistrements : toute la liste est réécrite à chaque
-- modification. Une TPE qui émet dix factures par semaine met des
-- années à s'en approcher, donc ça ne gênera personne au départ.
--
-- Le jour où un module dépasse ce volume — les factures en premier —
-- il lui faut sa propre table, avec une ligne par enregistrement :
--
--   create table public.akili_factures (
--     id uuid primary key default gen_random_uuid(),
--     org_id uuid not null,
--     numero text, client text, montant numeric, devise text,
--     emise_le date, data jsonb,
--     created_at timestamptz default now()
--   );
--
-- Les autres modules peuvent rester dans akili_stores.
-- ═══════════════════════════════════════════════════════════════════
