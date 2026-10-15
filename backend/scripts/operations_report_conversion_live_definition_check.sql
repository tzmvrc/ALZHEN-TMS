-- ALZHEN TMS Operations Reports conversion: live definition check.
-- READ ONLY. Run manually in Supabase SQL Editor only after review.
-- Every executable statement is a SELECT or catalog inspection. This file
-- does not establish that either proposal migration was applied.
-- Catalog inspection cannot prove runtime trigger behavior, data cleanliness,
-- migration-runner identity, storage-object state, or concurrent lock behavior.

-- 1. Exact columns for every relation referenced by the October 15 function.
-- Missing relations and missing required columns are returned explicitly.
WITH expected_tables(table_name) AS (
  VALUES ('operations_report_conversions'), ('report_receipts'),
         ('loading_reports'), ('unloading_reports'), ('backloads'), ('offloads'),
         ('backload_items'), ('offload_items'), ('trip_stops')
), required_columns(table_name, column_name) AS (
  VALUES
    ('operations_report_conversions','id'), ('operations_report_conversions','source_type'),
    ('operations_report_conversions','source_id'), ('operations_report_conversions','target_type'),
    ('operations_report_conversions','target_id'), ('operations_report_conversions','trip_id'),
    ('operations_report_conversions','trip_stop_id'), ('operations_report_conversions','actor_profile_id'),
    ('operations_report_conversions','source_snapshot'), ('operations_report_conversions','source_items_snapshot'),
    ('operations_report_conversions','created_at'),
    ('report_receipts','id'), ('report_receipts','trip_id'), ('report_receipts','trip_stop_id'),
    ('report_receipts','loading_report_id'), ('report_receipts','unloading_report_id'),
    ('report_receipts','backload_id'), ('report_receipts','offload_id'),
    ('report_receipts','storage_path'), ('report_receipts','file_name'),
    ('report_receipts','mime_type'), ('report_receipts','file_size'),
    ('report_receipts','uploaded_by'), ('report_receipts','created_at'), ('report_receipts','received_at'),
    ('loading_reports','id'), ('loading_reports','trip_id'),
    ('loading_reports','warehouse_arrival_at'), ('loading_reports','loading_start_at'), ('loading_reports','loading_finished_at'),
    ('unloading_reports','id'), ('unloading_reports','trip_id'), ('unloading_reports','trip_stop_id'),
    ('backloads','id'), ('backloads','trip_id'), ('backloads','trip_stop_id'),
    ('backloads','reason'), ('backloads','number_of_boxes'), ('backloads','comments'),
    ('offloads','id'), ('offloads','trip_id'), ('offloads','trip_stop_id'),
    ('offloads','reason'), ('offloads','number_of_boxes'), ('offloads','comments'),
    ('backload_items','id'), ('backload_items','backload_id'),
    ('offload_items','id'), ('offload_items','offload_id'),
    ('trip_stops','id'), ('trip_stops','trip_id'), ('trip_stops','arrival_time'),
    ('trip_stops','start_unloading_time'), ('trip_stops','finish_unloading_time'), ('trip_stops','remarks')
), all_columns AS (
  SELECT n.nspname AS table_schema, c.relname AS table_name, a.attnum AS ordinal_position,
         a.attname AS column_name, format_type(a.atttypid,a.atttypmod) AS data_type,
         a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_expression,
         a.attidentity AS identity_code,
         CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE NULL END AS identity_generation,
         a.attgenerated AS generated_code,
         CASE a.attgenerated WHEN 's' THEN 'STORED' WHEN 'v' THEN 'VIRTUAL' ELSE NULL END AS generated_kind,
         CASE WHEN a.attgenerated <> '' THEN pg_get_expr(d.adbin,d.adrelid) END AS generation_expression
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    AND c.relname IN (SELECT table_name FROM expected_tables)
)
SELECT t.table_name, c.ordinal_position, c.column_name, c.data_type,
       c.not_null, c.default_expression, c.identity_code, c.identity_generation,
       c.generated_code, c.generated_kind, c.generation_expression,
       CASE WHEN c.column_name IS NULL THEN 'TABLE MISSING'
            WHEN c.column_name IN (SELECT rc.column_name FROM required_columns rc WHERE rc.table_name=t.table_name)
              THEN 'REQUIRED COLUMN'
            ELSE 'COLUMN' END AS finding
FROM expected_tables t
LEFT JOIN all_columns c ON c.table_name=t.table_name
UNION ALL
SELECT rc.table_name, NULL::smallint, rc.column_name, NULL::text,
       NULL::boolean, NULL::text, NULL::"char", NULL::text,
       NULL::"char", NULL::text, NULL::text, 'REQUIRED COLUMN MISSING'::text
FROM required_columns rc
WHERE NOT EXISTS (
  SELECT 1 FROM all_columns ac
  WHERE ac.table_name=rc.table_name AND ac.column_name=rc.column_name
)
ORDER BY table_name,ordinal_position NULLS FIRST,column_name;

-- 2. Exact constraints, definitions, validation state, and indexes for these
-- tables. convalidated=false and invalid/not-ready indexes are surfaced.
SELECT n.nspname AS table_schema, r.relname AS table_name, 'CONSTRAINT' AS object_kind,
       con.conname AS object_name, con.contype AS constraint_type,
       pg_catalog.pg_get_constraintdef(con.oid,true) AS definition,
       con.convalidated AS validated, con.condeferrable AS deferrable,
       con.condeferred AS initially_deferred,
       NULL::boolean AS is_unique, NULL::boolean AS is_valid,
       NULL::boolean AS is_ready, NULL::text AS index_definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class r ON r.oid=con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname='public' AND r.relname IN
  ('operations_report_conversions','report_receipts','loading_reports','unloading_reports',
   'backloads','offloads','backload_items','offload_items','trip_stops')
UNION ALL
SELECT n.nspname, r.relname, 'INDEX', ci.relname, NULL,
       pg_catalog.pg_get_indexdef(i.indexrelid), NULL, NULL, NULL,
       i.indisunique, i.indisvalid, i.indisready, pg_catalog.pg_get_indexdef(i.indexrelid)
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
WHERE n.nspname='public' AND r.relname IN
  ('operations_report_conversions','report_receipts','loading_reports','unloading_reports',
   'backloads','offloads','backload_items','offload_items','trip_stops')
ORDER BY table_name,object_kind,object_name;

-- 2a. Explicit test for an equivalent valid, non-partial unique key on
-- unloading_reports(trip_stop_id), regardless of its object name.
SELECT to_regclass('public.unloading_reports') AS relation,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_index i
         WHERE i.indrelid=to_regclass('public.unloading_reports')
           AND i.indisunique AND i.indisvalid AND i.indisready
           AND i.indpred IS NULL AND i.indexprs IS NULL
           AND i.indnkeyatts=1
           AND ARRAY(SELECT a.attname::text
                     FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
                     JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
                     WHERE k.ord<=i.indnkeyatts ORDER BY k.ord)=ARRAY['trip_stop_id']::text[]
       ) AS valid_equivalent_unique_unloading_trip_stop;

-- 3. Full definitions, owners, SECURITY DEFINER state, and ACL entries for
-- the two October 13 trigger functions, plus any live trigger functions found
-- on the report/receipt relations. Missing October 13 functions appear below.
WITH expected_functions(function_name, proposal) AS (
  VALUES ('proposed_loading_unloading_validate_receipt_scope_v1','October 13'),
         ('proposed_loading_unloading_guard_parent_scope_v1','October 13'),
         ('convert_operations_report_v1','October 15'),
         ('guard_converted_operations_report_source_v1','October 15'),
         ('guard_converted_report_receipt_parent_v1','October 15'),
         ('guard_converted_operations_report_item_v1','October 15'),
         ('guard_converted_unloading_stop_v1','October 15')
), trigger_functions AS (
  SELECT DISTINCT p.oid
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND n.nspname='public'
    AND r.relname IN ('loading_reports','unloading_reports','backloads','offloads',
                      'backload_items','offload_items','report_receipts','trip_stops')
), selected_functions AS (
  SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig,p.proacl,p.proargtypes
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND (p.proname IN (SELECT function_name FROM expected_functions) OR p.oid IN (SELECT oid FROM trigger_functions))
)
SELECT e.function_name, e.proposal, p.oid::regprocedure AS function_identity,
       owner_role.rolname AS owner, owner_role.rolsuper AS owner_is_superuser,
       owner_role.rolbypassrls AS owner_bypasses_rls,
       p.prosecdef AS security_definer, p.proconfig AS function_settings,
       pg_catalog.pg_get_functiondef(p.oid) AS full_definition,
       CASE WHEN p.oid IS NULL THEN e.proposal||' FUNCTION MISSING' ELSE 'PRESENT' END AS status,
       COALESCE(grantor_role.rolname,acl.grantor::text) AS acl_grantor,
       CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE COALESCE(grantee_role.rolname,acl.grantee::text) END AS acl_grantee,
       acl.privilege_type, acl.is_grantable
FROM expected_functions e
LEFT JOIN selected_functions p ON p.proname=e.function_name
LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=p.proowner
LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl ON true
LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid=acl.grantor
LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid=acl.grantee
UNION ALL
SELECT p.proname, 'LIVE TRIGGER'::text, p.oid::regprocedure, owner_role.rolname, owner_role.rolsuper,
       owner_role.rolbypassrls, p.prosecdef, p.proconfig,
       pg_catalog.pg_get_functiondef(p.oid), 'LIVE TRIGGER FUNCTION',
       COALESCE(grantor_role.rolname,acl.grantor::text),
       CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE COALESCE(grantee_role.rolname,acl.grantee::text) END,
       acl.privilege_type, acl.is_grantable
FROM selected_functions p
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=p.proowner
LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl ON true
LEFT JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid=acl.grantor
LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid=acl.grantee
WHERE p.proname NOT IN (SELECT function_name FROM expected_functions)
ORDER BY 1,3,11;

-- 4. Trigger names, timing, events, enabled state, arguments, and function
-- definition for all requested parent, item, receipt, and stop relations.
WITH expected_tables(table_name) AS (
  VALUES ('loading_reports'),('unloading_reports'),('backloads'),('offloads'),
         ('backload_items'),('offload_items'),('report_receipts'),('trip_stops')
)
SELECT e.table_name AS expected_table, n.nspname AS table_schema,
       r.relname AS table_name, t.tgname AS trigger_name,
       CASE WHEN t.oid IS NULL THEN 'NO TRIGGER FOUND' ELSE 'TRIGGER' END AS finding,
       CASE WHEN t.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid,true) END AS trigger_definition,
       t.tgenabled AS enabled_code,
       CASE t.tgenabled WHEN 'O' THEN 'origin/local' WHEN 'D' THEN 'disabled'
                        WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' END AS enabled_state,
       CASE WHEN t.oid IS NULL THEN NULL WHEN (t.tgtype & 2)<>0 THEN 'BEFORE'
            WHEN (t.tgtype & 64)<>0 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
       (t.tgtype & 4)<>0 AS fires_on_insert,
       (t.tgtype & 8)<>0 AS fires_on_delete,
       (t.tgtype & 16)<>0 AS fires_on_update,
       (t.tgtype & 32)<>0 AS fires_on_truncate,
       CASE WHEN (t.tgtype & 1)<>0 THEN 'ROW' ELSE 'STATEMENT' END AS granularity,
       p.oid::regprocedure AS function_identity,
       pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM expected_tables e
LEFT JOIN pg_catalog.pg_class r ON r.relname=e.table_name AND r.relnamespace=to_regnamespace('public')
LEFT JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid AND NOT t.tgisinternal
LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
WHERE n.oid IS NULL OR t.oid IS NOT NULL
ORDER BY e.table_name,t.tgname;

-- 5. Current execution identity and role attributes. This reports database
-- roles only; it does not reveal credentials or connection strings.
SELECT current_database() AS database_name, current_user AS current_user_name,
       session_user AS session_user_name, current_role AS current_role_name,
       r.rolsuper AS current_is_superuser, r.rolbypassrls AS current_bypasses_rls,
       r.rolcreaterole AS current_can_create_roles, r.rolcreatedb AS current_can_create_database,
       pg_catalog.has_schema_privilege(current_user,'public','USAGE') AS current_public_usage,
       CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles sr WHERE sr.rolname='service_role')
            THEN pg_catalog.has_schema_privilege('service_role','public','USAGE') ELSE false END AS service_role_public_usage,
       (SELECT rls.rolbypassrls FROM pg_catalog.pg_roles rls WHERE rls.rolname='service_role') AS service_role_bypasses_rls,
       (SELECT jsonb_agg(jsonb_build_object('role',m.rolname,'superuser',m.rolsuper,'bypassrls',m.rolbypassrls)
                         ORDER BY m.rolname)
        FROM pg_catalog.pg_roles m
        WHERE pg_catalog.pg_has_role(current_user,m.oid,'MEMBER')) AS current_role_memberships;

-- 5a. Table privileges checked by the October 15 migration for its effective
-- function owner. Before creation, current_user is only a proxy: CREATE OR
-- REPLACE ownership and SECURITY DEFINER execution must be checked after
-- migration using the actual function owner. The migration explicitly fails
-- unless this owner has these privileges and superuser/BYPASSRLS.
WITH required(role_name, relation_name, privilege_name) AS (
  VALUES
    ('current_user','public.operations_report_conversions','SELECT'),
    ('current_user','public.operations_report_conversions','INSERT'),
    ('current_user','public.report_receipts','SELECT'),('current_user','public.report_receipts','UPDATE'),
    ('current_user','public.profiles','SELECT'),('current_user','public.trip_stops','SELECT'),
    ('current_user','public.trip_stops','UPDATE'),('current_user','public.backload_items','SELECT'),
    ('current_user','public.offload_items','SELECT'),
    ('current_user','public.loading_reports','SELECT'),('current_user','public.loading_reports','INSERT'),('current_user','public.loading_reports','UPDATE'),
    ('current_user','public.unloading_reports','SELECT'),('current_user','public.unloading_reports','INSERT'),('current_user','public.unloading_reports','UPDATE'),
    ('current_user','public.backloads','SELECT'),('current_user','public.backloads','INSERT'),('current_user','public.backloads','UPDATE'),
    ('current_user','public.offloads','SELECT'),('current_user','public.offloads','INSERT'),('current_user','public.offloads','UPDATE'),
    ('current_user','public.backloads','UPDATE'),('current_user','public.offloads','UPDATE'),
    ('current_user','public.unloading_reports','SELECT'),
    ('service_role','public.operations_report_conversions','SELECT'),
    ('service_role','public.operations_report_conversions','INSERT')
)
SELECT q.role_name, q.relation_name, q.privilege_name,
       to_regclass(q.relation_name) IS NOT NULL AS relation_exists,
       CASE WHEN to_regclass(q.relation_name) IS NULL THEN NULL
            WHEN q.role_name='current_user' THEN has_table_privilege(current_user,q.relation_name,q.privilege_name)
            ELSE has_table_privilege(q.role_name,q.relation_name,q.privilege_name) END AS privilege_available
FROM required q ORDER BY q.role_name,q.relation_name,q.privilege_name;

-- If the October 15 RPC already exists, report whether service_role can invoke
-- it. Before creation, the migration's GRANT statement is the intended ACL.
SELECT to_regprocedure('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)') AS rpc,
       CASE WHEN to_regprocedure('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)') IS NULL
            OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN NULL
            ELSE has_function_privilege('service_role',
              'public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)','EXECUTE') END
         AS service_role_rpc_execute_if_present;

-- 5b. RLS status and service_role table privileges for referenced relations.
SELECT n.nspname AS table_schema, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       CASE WHEN pg_catalog.pg_roles.oid IS NULL THEN false
            ELSE has_table_privilege('service_role',c.oid,'SELECT') END AS service_select,
       CASE WHEN pg_catalog.pg_roles.oid IS NULL THEN false
            ELSE has_table_privilege('service_role',c.oid,'INSERT') END AS service_insert,
       CASE WHEN pg_catalog.pg_roles.oid IS NULL THEN false
            ELSE has_table_privilege('service_role',c.oid,'UPDATE') END AS service_update
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_catalog.pg_roles ON pg_catalog.pg_roles.rolname='service_role'
WHERE n.nspname='public' AND c.relname IN
  ('operations_report_conversions','report_receipts','loading_reports','unloading_reports',
   'backloads','offloads','backload_items','offload_items','trip_stops','profiles')
ORDER BY c.relname;

-- 6. October 15 object and assumption checklist. PASS means catalog evidence
-- supports the named structural assumption; it does not test function runtime.
-- 6a. Required storage types/nullability/ID-generation assumptions checked by
-- the function or needed by its inserts. Actual values are also listed above.
WITH expected(table_name,column_name,expected_type,expected_not_null,requires_generated_id) AS (
  VALUES
    ('loading_reports','id','uuid',NULL::boolean,true),
    ('loading_reports','trip_id','uuid',true,false),
    ('unloading_reports','id','uuid',NULL::boolean,true),
    ('unloading_reports','trip_id','uuid',true,false),
    ('unloading_reports','trip_stop_id','uuid',true,false),
    ('backloads','id','uuid',NULL::boolean,true),
    ('backloads','trip_id','uuid',true,false),
    ('backloads','trip_stop_id','uuid',false,false),
    ('offloads','id','uuid',NULL::boolean,true),
    ('offloads','trip_id','uuid',true,false),
    ('offloads','trip_stop_id','uuid',false,false),
    ('report_receipts','trip_id','uuid',true,false),
    ('report_receipts','trip_stop_id','uuid',false,false),
    ('report_receipts','loading_report_id','uuid',false,false),
    ('report_receipts','unloading_report_id','uuid',false,false),
    ('report_receipts','backload_id','uuid',false,false),
    ('report_receipts','offload_id','uuid',false,false),
    ('operations_report_conversions','source_id','uuid',true,false),
    ('operations_report_conversions','target_id','uuid',true,false),
    ('operations_report_conversions','trip_id','uuid',true,false),
    ('operations_report_conversions','trip_stop_id','uuid',false,false),
    ('operations_report_conversions','actor_profile_id','uuid',true,false),
    ('operations_report_conversions','source_snapshot','jsonb',true,false),
    ('operations_report_conversions','source_items_snapshot','jsonb',true,false)
)
SELECT e.table_name,e.column_name,e.expected_type,e.expected_not_null,
       CASE WHEN c.oid IS NULL THEN NULL ELSE format_type(a.atttypid,a.atttypmod) END AS actual_type,
       CASE WHEN a.attnum IS NULL THEN NULL ELSE a.attnotnull END AS actual_not_null,
       CASE WHEN e.requires_generated_id AND a.attnum IS NOT NULL
            THEN (a.attidentity<>'' OR d.adbin IS NOT NULL) ELSE NULL END AS id_is_generated,
       CASE WHEN c.oid IS NULL OR a.attnum IS NULL THEN false
            ELSE format_type(a.atttypid,a.atttypmod)=e.expected_type
              AND (e.expected_not_null IS NULL OR a.attnotnull=e.expected_not_null)
              AND (NOT e.requires_generated_id OR a.attidentity<>'' OR d.adbin IS NOT NULL)
       END AS assumption_satisfied
FROM expected e
LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass(format('public.%I',e.table_name))
LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name
  AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
ORDER BY e.table_name,e.column_name;

-- 6b. Relation/function/unique-index presence checklist.
WITH required_relations(relation_name) AS (
  VALUES ('operations_report_conversions'),('report_receipts'),('profiles'),('trip_stops'),
         ('loading_reports'),('unloading_reports'),('backloads'),('offloads'),
         ('backload_items'),('offload_items')
), expected_functions(function_name, identity_args) AS (
  VALUES ('convert_operations_report_v1','text, uuid, text, uuid, jsonb'),
         ('guard_converted_operations_report_source_v1',''),
         ('guard_converted_report_receipt_parent_v1',''),
         ('guard_converted_operations_report_item_v1',''),
         ('guard_converted_unloading_stop_v1','')
), function_check AS (
  SELECT f.function_name,
         to_regprocedure(format('public.%I(%s)',f.function_name,f.identity_args)) IS NOT NULL AS present
  FROM expected_functions f
), target_uniques AS (
  SELECT key.table_name,key.column_name,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_index i
           JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
           JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
           WHERE n.nspname='public' AND r.relname=key.table_name
             AND i.indisunique AND i.indisvalid AND i.indisready
             AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1
             AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
                       JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
                       WHERE k.ord<=i.indnkeyatts ORDER BY k.ord)=ARRAY[key.column_name]::text[]
         ) AS satisfied
  FROM (VALUES ('loading_reports','trip_id'),('unloading_reports','trip_stop_id')) key(table_name,column_name)
)
SELECT 'REQUIRED RELATION' AS check_group, r.relation_name AS check_name,
       to_regclass(format('public.%I',r.relation_name)) IS NOT NULL AS satisfied,
       CASE WHEN to_regclass(format('public.%I',r.relation_name)) IS NULL THEN 'MISSING'
            ELSE 'PRESENT; inspect columns and constraints above' END AS detail
FROM required_relations r
UNION ALL
SELECT 'OCTOBER 15 FUNCTION',f.function_name,f.present,
       CASE WHEN f.present THEN 'PRESENT; inspect owner, SECURITY DEFINER and ACL above'
            ELSE 'ABSENT; migration would create it' END
FROM function_check f
UNION ALL
SELECT 'TARGET UNIQUENESS',u.table_name||' unique ('||u.column_name||')',u.satisfied,
       CASE WHEN u.satisfied THEN 'Equivalent valid, non-partial unique index found'
            ELSE 'MISSING OR UNCERTAIN; migration requires this uniqueness' END
FROM target_uniques u
UNION ALL
SELECT 'OCTOBER 13 TRIGGER FUNCTION',f.function_name,
       to_regprocedure(format('public.%I()',f.function_name)) IS NOT NULL,
       CASE WHEN to_regprocedure(format('public.%I()',f.function_name)) IS NULL
            THEN 'ABSENT; live trigger-function definitions cannot be compared'
            ELSE 'PRESENT; compare full definition and owner/ACL above' END
FROM (VALUES ('proposed_loading_unloading_validate_receipt_scope_v1'),
             ('proposed_loading_unloading_guard_parent_scope_v1')) f(function_name)
ORDER BY check_group,check_name;

-- Catalog-only limitations / manual interpretation:
-- * Catalogs cannot establish which migration file was executed if no migration
--   ledger is available; compare live object definitions with checked-in files.
-- * Privileges shown for current_user are only a pre-application proxy for the
--   future SECURITY DEFINER owner. Confirm the actual function owner afterward.
-- * Index/constraint presence does not validate data-level assumptions such as
--   clean trip/stop/receipt relationships or absence of duplicate target rows.
-- * Trigger definitions do not establish behavior under concurrency, lock
--   ordering outcomes, or the effects of RLS policies during real writes.
