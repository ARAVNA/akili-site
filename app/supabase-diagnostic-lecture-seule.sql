-- ═══════════════════════════════════════════════════════════════════
-- AKILI ERP — DIAGNOSTIC EN LECTURE SEULE (à lancer AVANT les deux scripts)
--
-- Ne contient que des SELECT : il ne modifie ni donnée, ni droit, ni réglage.
-- À coller dans SQL Editor → Run. Il renvoie UN tableau (controle, detail).
-- Envoyez-moi le résultat (il ne contient ni clé ni mot de passe ; il
-- contient des NOMBRES et des noms de tables, pas le contenu des lignes).
-- ═══════════════════════════════════════════════════════════════════
select controle, detail from (

  -- 1. Tables d'AKILI présentes / absentes
  select '01 tables présentes' as controle,
    coalesce(string_agg(t, ', ' order by t), '(aucune)') as detail
  from unnest(array['organizations','profiles','achats','ai_quotas','clients','comptes_tresorerie',
    'crm_leads','documents','ecritures','efactures','employes','fournisseurs','stocks',
    'mouvements_stock','fiches_paie','projets','signatures','taux_change','journal_audit']) t
  where to_regclass('public.'||t) is not null
  union all
  select '02 tables ABSENTES (seront créées)',
    coalesce(string_agg(t, ', ' order by t), '(aucune)')
  from unnest(array['organizations','profiles','achats','ai_quotas','clients','comptes_tresorerie',
    'crm_leads','documents','ecritures','efactures','employes','fournisseurs','stocks',
    'mouvements_stock','fiches_paie','projets','signatures','taux_change']) t
  where to_regclass('public.'||t) is null

  -- 2. Colonnes de organizations et profiles si elles existent déjà
  union all
  select '03 colonnes '||table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position)
  from information_schema.columns
  where table_schema='public' and table_name in ('organizations','profiles','ai_quotas')
  group by table_name

  -- 3. Nombre de lignes par table AKILI existante
  union all
  select '04 lignes '||c.relname,
    (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I', c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.relkind='r' and c.relname = any(array['organizations','profiles','achats','ai_quotas','clients',
    'comptes_tresorerie','crm_leads','documents','ecritures','efactures','employes','fournisseurs','stocks',
    'mouvements_stock','fiches_paie','projets','signatures','taux_change'])

  -- 4. RLS désactivée sur une table de « public »
  union all
  select '05 tables public SANS RLS', coalesce(string_agg(c.relname, ', ' order by c.relname), '(aucune)')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.relkind='r' and not c.relrowsecurity

  -- 5. Toutes les politiques existantes (les politiques s'ADDITIONNENT : une
  --    politique ancienne trop large reste active même après nos scripts)
  union all
  select '06 politique '||tablename||' / '||policyname,
    cmd||' pour '||array_to_string(roles, ',')||' · permissive='||permissive||
    ' · USING '||coalesce(qual,'(aucun)')||' · CHECK '||coalesce(with_check,'(aucun)')
  from pg_policies where schemaname='public'

  -- 6. Droits d'anon et authenticated sur les tables de « public »
  union all
  select '07 droits '||grantee||' sur '||table_name, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
  group by grantee, table_name

  -- 7. Déclencheurs sur auth.users (le script remplace on_auth_user_created)
  union all
  select '08 déclencheur auth.users', tgname||' → '||pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='auth' and c.relname='users' and not t.tgisinternal

  -- 8. Fonctions de « public » : sécurité DEFINER, search_path, qui peut les exécuter
  union all
  select '09 fonction '||p.proname,
    case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end||
    ' · config='||coalesce(array_to_string(p.proconfig, ';'),'(aucune)')||
    ' · anon='||has_function_privilege('anon', p.oid, 'execute')||
    ' · authenticated='||has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  where p.prokind='f'

  -- 9. Comptes sans profil (le script leur crée une entreprise)
  union all
  select '10 comptes auth.users', count(*)::text from auth.users
  union all
  select '11 comptes SANS profil',
    case when to_regclass('public.profiles') is null then 'table profiles absente → tous les comptes ('||(select count(*) from auth.users)||')'
         else (xpath('/row/n/text()', query_to_xml('select count(*) n from auth.users u where u.id not in (select id from public.profiles)', false, true, '')))[1]::text end

  -- 10. Lignes dont l'org_id ne correspond à aucune entreprise ni à aucun compte
  union all
  select '12 org_id distincts '||c.relname,
    (xpath('/row/n/text()', query_to_xml(format('select count(distinct org_id) n from public.%I', c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=c.oid and a.attname='org_id' and not a.attisdropped
  where c.relkind='r' and c.relname = any(array['achats','clients','comptes_tresorerie','crm_leads','documents',
    'ecritures','efactures','employes','fournisseurs','stocks','mouvements_stock','fiches_paie','projets','signatures'])
  union all
  select '13 lignes dont org_id = identifiant d''un compte (ancien rangement) '||c.relname,
    (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I where org_id in (select id from auth.users)', c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=c.oid and a.attname='org_id' and not a.attisdropped
  where c.relkind='r' and c.relname = any(array['achats','clients','comptes_tresorerie','crm_leads','documents',
    'ecritures','efactures','employes','fournisseurs','stocks','mouvements_stock','fiches_paie','projets','signatures'])

  -- 11. Doublons qui feraient échouer l'index unique ai_quotas(org_id, month)
  union all
  select '14 doublons ai_quotas (org_id, month)',
    case when to_regclass('public.ai_quotas') is null then '(table absente)'
         else (xpath('/row/n/text()', query_to_xml('select count(*) n from (select org_id, month from public.ai_quotas group by 1,2 having count(*)>1) d', false, true, '')))[1]::text end

  -- 12. Place disponible (plan gratuit : 500 Mo)
  union all
  select '15 taille base', pg_size_pretty(pg_database_size(current_database()))

) r order by controle, detail;
