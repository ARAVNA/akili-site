-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Paiements et abonnements (à exécuter APRÈS supabase-securite.sql)
--
-- Architecture neutre : aucun prestataire réel n'est branché. Principe :
--   1. Le serveur crée une COMMANDE (plan, montant, devise) pour l'entreprise
--      de l'appelant ; ces valeurs viennent de la base, jamais du navigateur.
--   2. Le prestataire notifie un paiement à une route serveur qui vérifie la
--      SIGNATURE ; seule la fonction appliquer_paiement() (service_role) peut
--      alors modifier organizations.plan.
--   3. Un identifiant d'événement unique empêche le rejeu et la double activation.
--
-- Ne supprime ni ne modifie aucune ligne existante. Transactionnel. Rejouable.
-- ═══════════════════════════════════════════════════════════════════
begin;

alter table public.organizations add column if not exists plan_expire_le timestamptz;
alter table public.organizations add column if not exists plan_maj_le timestamptz;

create table if not exists public.commandes_paiement (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  plan              text not null check (plan in ('business','enterprise')),
  montant           numeric not null check (montant > 0),
  devise            text not null default 'XOF',
  duree_jours       integer not null default 30 check (duree_jours between 1 and 400),
  prestataire       text not null,
  statut            text not null default 'en_attente'
                    check (statut in ('en_attente','payee','expiree','annulee')),
  cree_par          uuid,
  cree_le           timestamptz not null default now(),
  expire_le         timestamptz not null default (now() + interval '24 hours'),
  payee_le          timestamptz
);
create index if not exists commandes_paiement_org_idx on public.commandes_paiement (org_id, cree_le desc);

-- Journal des notifications reçues. L'unicité (prestataire, event_id) est le
-- verrou anti-rejeu. Aucune donnée de carte ni de compte Mobile Money n'est
-- conservée : seulement des identifiants techniques.
create table if not exists public.evenements_paiement (
  id            bigint generated always as identity primary key,
  prestataire   text not null,
  event_id      text not null,
  commande_id   uuid references public.commandes_paiement(id),
  resultat      text not null,        -- active | refuse
  motif         text,
  recu_le       timestamptz not null default now(),
  unique (prestataire, event_id)
);

-- Aucun accès depuis le navigateur : tout passe par le serveur (service_role).
alter table public.commandes_paiement enable row level security;
alter table public.evenements_paiement enable row level security;
revoke all on public.commandes_paiement, public.evenements_paiement from anon, authenticated;
revoke all on sequence public.evenements_paiement_id_seq from anon, authenticated;

create or replace function public.appliquer_paiement(
  p_prestataire text, p_event_id text, p_commande uuid, p_montant numeric, p_devise text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.commandes_paiement%rowtype;
  v_inseres integer;
  v_trouve boolean;
begin
  if coalesce(p_prestataire,'') = '' or coalesce(p_event_id,'') = '' then
    return 'refuse';
  end if;

  -- Verrou : deux notifications simultanées pour la même commande s'enchaînent.
  select * into c from public.commandes_paiement where id = p_commande for update;
  v_trouve := found;   -- à lire tout de suite : l'INSERT suivant modifie FOUND

  -- Rejeu : cet événement a déjà été traité → aucune action.
  insert into public.evenements_paiement (prestataire, event_id, commande_id, resultat)
  values (p_prestataire, p_event_id, c.id, 'en_cours')
  on conflict (prestataire, event_id) do nothing;
  get diagnostics v_inseres = row_count;
  if v_inseres = 0 then return 'deja_traite'; end if;

  if not v_trouve or c.prestataire <> p_prestataire then
    update public.evenements_paiement set resultat='refuse', motif='commande inconnue ou autre prestataire'
      where prestataire = p_prestataire and event_id = p_event_id;
    return 'refuse';
  end if;
  if c.statut <> 'en_attente' or c.expire_le < now() then
    update public.evenements_paiement set resultat='refuse', motif='commande non payable ('||c.statut||')'
      where prestataire = p_prestataire and event_id = p_event_id;
    return 'refuse';
  end if;
  if p_montant is null or p_montant < c.montant or p_devise is distinct from c.devise then
    update public.evenements_paiement set resultat='refuse', motif='montant ou devise différents de la commande'
      where prestataire = p_prestataire and event_id = p_event_id;
    return 'refuse';
  end if;

  update public.commandes_paiement set statut='payee', payee_le=now() where id = c.id;
  update public.organizations
     set plan = c.plan,
         plan_expire_le = greatest(coalesce(plan_expire_le, now()), now()) + make_interval(days => c.duree_jours),
         plan_maj_le = now()
   where id = c.org_id;
  update public.evenements_paiement set resultat='active'
    where prestataire = p_prestataire and event_id = p_event_id;
  return 'active';
end;
$$;
revoke all on function public.appliquer_paiement(text,text,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.appliquer_paiement(text,text,uuid,numeric,text) to service_role;

commit;

-- Rollback (urgence, sans perte d'historique) :
--   revoke execute on function public.appliquer_paiement(text,text,uuid,numeric,text) from service_role;
-- Les tables ne sont jamais supprimées.
