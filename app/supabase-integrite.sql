-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — Intégrité des données, PHASE 1 (à exécuter APRÈS supabase-paiements.sql)
--
-- 1. documents.user_id ne peut plus être falsifié depuis le navigateur :
--    à l'insertion il vaut toujours l'utilisateur connecté, et il ne change plus.
-- 2. Prépare le passage de la clé primaire de documents/achats à (org_id, id) en
--    ajoutant l'index unique (org_id, id) : purement additif, l'ancienne
--    application continue de fonctionner. Le remplacement de la clé primaire est
--    dans supabase-integrite-phase2.sql (À ne lancer QU'APRÈS le déploiement de
--    l'application qui utilise onConflict "org_id,id").
--
-- Ne supprime ni ne modifie aucune ligne. Transactionnel. Rejouable.
-- ═══════════════════════════════════════════════════════════════════
begin;

create or replace function public.forcer_auteur()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then            -- appel venant d'un utilisateur connecté
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
    elsif new.user_id is distinct from old.user_id then
      new.user_id := old.user_id;           -- l'auteur d'origine ne change jamais
    end if;
  end if;
  return new;                               -- service_role (auth.uid() nul) : inchangé
end;
$$;
revoke all on function public.forcer_auteur() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['documents','achats'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    -- Seules les tables qui portent réellement la colonne user_id reçoivent le déclencheur.
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='user_id') then
      execute format('drop trigger if exists akili_auteur on public.%I', t);
      execute format('create trigger akili_auteur before insert or update on public.%I
                      for each row execute function public.forcer_auteur()', t);
    end if;
    execute format('create unique index if not exists %I on public.%I (org_id, id)', t||'_org_id_id_uq', t);
  end loop;
end $$;

commit;
