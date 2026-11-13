-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Intégrité, PHASE 2 : clé primaire (org_id, id) sur documents et achats
--
-- ⚠ À LANCER SEULEMENT APRÈS : (1) supabase-integrite.sql, (2) déploiement de
-- l'application qui envoie onConflict "org_id,id", (3) vérification qu'enregistrer
-- une facture et un achat fonctionne. Sinon l'ancienne application ne pourrait
-- plus enregistrer (elle réclame une clé unique sur « id » seul).
--
-- Effet : deux entreprises peuvent avoir le même numéro de pièce sans conflit ni
-- fuite d'existence. Ne supprime ni ne modifie aucune ligne.
-- Garde-fous : la table est IGNORÉE (avec un avis) si la clé actuelle n'est pas
-- exactement (id), si une ligne a org_id nul, ou si une clé étrangère dépend de id.
-- Transactionnel. Rejouable (déjà fait → rien).
-- ═══════════════════════════════════════════════════════════════════
begin;

do $$
declare
  t text; v_pk text; v_cols text[]; v_nuls bigint; v_fk integer; v_idx text;
begin
  foreach t in array array['documents','achats'] loop
    if to_regclass('public.'||t) is null then continue; end if;

    select c.conname, array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k order by a.attname)
      into v_pk, v_cols
      from pg_constraint c where c.conrelid = ('public.'||t)::regclass and c.contype = 'p';

    if v_pk is null then raise notice '% : aucune clé primaire — ignorée', t; continue; end if;
    if v_cols = array['id','org_id'] then raise notice '% : déjà en (org_id, id)', t; continue; end if;
    if v_cols <> array['id'] then raise notice '% : clé primaire inattendue % — ignorée', t, v_cols; continue; end if;

    execute format('select count(*) from public.%I where org_id is null', t) into v_nuls;
    if v_nuls > 0 then raise notice '% : % ligne(s) sans org_id — ignorée (à traiter d''abord)', t, v_nuls; continue; end if;

    select count(*) into v_fk from pg_constraint where confrelid = ('public.'||t)::regclass and contype = 'f';
    if v_fk > 0 then raise notice '% : % clé(s) étrangère(s) dépendent de id — ignorée', t, v_fk; continue; end if;

    v_idx := t||'_org_id_id_uq';
    execute format('create unique index if not exists %I on public.%I (org_id, id)', v_idx, t);
    execute format('alter table public.%I drop constraint %I', t, v_pk);
    execute format('alter table public.%I add primary key using index %I', t, v_idx);
    raise notice '% : clé primaire passée à (org_id, id)', t;
  end loop;
end $$;

commit;

-- Retour arrière (si besoin) : alter table public.<t> drop constraint <t>_org_id_id_uq;
--                              alter table public.<t> add primary key (id);   -- impossible si deux entreprises ont le même id
