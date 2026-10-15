-- ALZHEN TMS Loading / Unloading / Backload / Offload migration preflight.
-- READ ONLY: catalog inspection and fixed SELECT count queries only.
-- Run manually in Supabase SQL Editor before reviewing the proposed migration.
-- No business row values, receipt paths, or personal data are returned.

-- 1. Expected relations and presence (missing relations remain visible).
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs'), ('trip_events'), ('documents'), ('pod_records')
)
SELECT relation_name,
       to_regclass(format('public.%I', relation_name)) AS relation,
       to_regclass(format('public.%I', relation_name)) IS NOT NULL AS exists
FROM expected
ORDER BY relation_name;

-- 2. Columns, types, defaults, nullability, and identity/generated properties.
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs'), ('trip_events'), ('documents'), ('pod_records')
), candidate_relations AS (
  SELECT relation_name FROM expected
  WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
  UNION
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (c.relname ILIKE '%loading%report%'
      OR c.relname ILIKE '%unloading%report%'
      OR c.relname ILIKE '%receipt%'
      OR c.relname ILIKE '%report%audit%')
)
SELECT col.table_schema AS schema_name, col.table_name AS relation_name,
       col.ordinal_position, col.column_name, col.data_type, col.udt_schema,
       col.udt_name, col.is_nullable, col.column_default, col.is_identity,
       col.identity_generation, col.is_generated, col.generation_expression
FROM information_schema.columns col
JOIN candidate_relations candidate ON candidate.relation_name = col.table_name
WHERE col.table_schema = 'public'
ORDER BY col.table_name, col.ordinal_position;

-- 3a. Constraints on relevant existing relations.
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs'), ('trip_events'), ('documents'), ('pod_records')
), candidate_relations AS (
  SELECT to_regclass(format('public.%I', relation_name)) AS relation_oid
  FROM expected WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
  UNION
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND (c.relname ILIKE '%loading%report%'
      OR c.relname ILIKE '%unloading%report%'
      OR c.relname ILIKE '%receipt%'
      OR c.relname ILIKE '%report%audit%')
)
SELECT n.nspname AS schema_name, tbl.relname AS table_name,
       con.conname AS object_name,
       CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUSION'
         ELSE con.contype::text END AS object_type,
       con.convalidated AS is_validated, con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred,
       pg_get_constraintdef(con.oid, true) AS definition
FROM candidate_relations candidate
JOIN pg_class tbl ON tbl.oid = candidate.relation_oid
JOIN pg_namespace n ON n.oid = tbl.relnamespace
JOIN pg_constraint con ON con.conrelid = tbl.oid
ORDER BY n.nspname, tbl.relname, object_type, con.conname;

-- 3b. Indexes, including validity, uniqueness, predicates, and definitions.
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs'), ('trip_events'), ('documents'), ('pod_records')
), candidate_relations AS (
  SELECT to_regclass(format('public.%I', relation_name)) AS relation_oid
  FROM expected WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
  UNION
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND (c.relname ILIKE '%loading%report%'
      OR c.relname ILIKE '%unloading%report%'
      OR c.relname ILIKE '%receipt%'
      OR c.relname ILIKE '%report%audit%')
)
SELECT n.nspname AS schema_name, tbl.relname AS table_name, idx.relname AS index_name,
       ix.indisprimary AS is_primary, ix.indisunique AS is_unique,
       ix.indisvalid AS is_valid, ix.indisready AS is_ready, ix.indislive AS is_live,
       pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
       pg_get_indexdef(ix.indexrelid) AS definition
FROM candidate_relations candidate
JOIN pg_class tbl ON tbl.oid = candidate.relation_oid
JOIN pg_namespace n ON n.oid = tbl.relnamespace
JOIN pg_index ix ON ix.indrelid = tbl.oid
JOIN pg_class idx ON idx.oid = ix.indexrelid
ORDER BY n.nspname, tbl.relname, idx.relname;

-- 4a. RLS enabled/forced flags, including missing relations.
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs')
)
SELECT e.relation_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM expected e
LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', e.relation_name))
ORDER BY e.relation_name;

-- 4b. Policies on the relevant tables.
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('backloads', 'offloads', 'trip_stops', 'trips',
    'loading_reports', 'unloading_reports', 'report_receipts', 'report_audit_logs')
ORDER BY tablename, policyname;

-- 5a. Role attributes and memberships.
SELECT rolname AS role_name, rolcanlogin AS can_login, rolinherit AS inherits_privileges,
       rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
FROM pg_roles
WHERE rolname IN ('service_role', 'authenticated', 'anon')
ORDER BY rolname;

SELECT parent_role.rolname AS granted_role, member_role.rolname AS member_role,
       am.admin_option
FROM pg_auth_members am
JOIN pg_roles parent_role ON parent_role.oid = am.roleid
JOIN pg_roles member_role ON member_role.oid = am.member
WHERE parent_role.rolname IN ('service_role', 'authenticated', 'anon')
   OR member_role.rolname IN ('service_role', 'authenticated', 'anon')
ORDER BY granted_role, member_role;

-- 5b. Direct table grants, including PUBLIC where reported by PostgreSQL.
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs')
)
SELECT tp.table_schema, tp.table_name, tp.grantee, tp.privilege_type, tp.is_grantable
FROM information_schema.table_privileges tp
JOIN expected e ON e.relation_name = tp.table_name
WHERE tp.table_schema = 'public'
  AND tp.grantee IN ('PUBLIC', 'service_role', 'authenticated', 'anon')
ORDER BY tp.table_name, tp.grantee, tp.privilege_type;

-- 5c. Effective table privileges (includes inherited and PUBLIC privileges).
WITH expected(relation_name) AS (
  VALUES ('backloads'), ('offloads'), ('trip_stops'), ('trips'),
         ('loading_reports'), ('unloading_reports'), ('report_receipts'),
         ('report_audit_logs')
), existing_relations AS (
  SELECT relation_name, to_regclass(format('public.%I', relation_name)) AS relation_oid
  FROM expected WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
), roles AS (
  SELECT rolname FROM pg_roles
  WHERE rolname IN ('service_role', 'authenticated', 'anon')
), privileges(privilege_name) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
SELECT r.rolname AS role_name, er.relation_name, p.privilege_name,
       has_table_privilege(r.rolname, er.relation_oid, p.privilege_name)
         AS effective_privilege
FROM roles r CROSS JOIN existing_relations er CROSS JOIN privileges p
ORDER BY r.rolname, er.relation_name, p.privilege_name;

-- 6. Count-only data conflict checks. Fixed SELECT statements are evaluated
-- through query_to_xml only when all listed relations/columns exist. The
-- function executes as the SQL Editor caller and does not modify database state.
WITH checks(check_name, required_columns, query_text) AS (
  VALUES
    ('backloads: missing stop or stop belongs to another trip',
     ARRAY['backloads.trip_id','backloads.trip_stop_id','trip_stops.id','trip_stops.trip_id']::text[],
     'SELECT count(*) AS n FROM public.backloads b LEFT JOIN public.trip_stops s ON s.id=b.trip_stop_id WHERE b.trip_stop_id IS NOT NULL AND (s.id IS NULL OR s.trip_id IS DISTINCT FROM b.trip_id)'),
    ('offloads: missing stop or stop belongs to another trip',
     ARRAY['offloads.trip_id','offloads.trip_stop_id','trip_stops.id','trip_stops.trip_id']::text[],
     'SELECT count(*) AS n FROM public.offloads o LEFT JOIN public.trip_stops s ON s.id=o.trip_stop_id WHERE o.trip_stop_id IS NOT NULL AND (s.id IS NULL OR s.trip_id IS DISTINCT FROM o.trip_id)'),
    ('unloading reports: null/missing/mismatched stop',
     ARRAY['unloading_reports.trip_id','unloading_reports.trip_stop_id','trip_stops.id','trip_stops.trip_id']::text[],
     'SELECT count(*) AS n FROM public.unloading_reports u LEFT JOIN public.trip_stops s ON s.id=u.trip_stop_id WHERE u.trip_stop_id IS NULL OR s.id IS NULL OR s.trip_id IS DISTINCT FROM u.trip_id'),
    ('unloading reports: duplicate stop references',
     ARRAY['unloading_reports.trip_stop_id']::text[],
     'SELECT count(*) AS n FROM (SELECT trip_stop_id FROM public.unloading_reports WHERE trip_stop_id IS NOT NULL GROUP BY trip_stop_id HAVING count(*)>1) d'),
    ('receipts: parent reference count is not exactly one',
     ARRAY['report_receipts.loading_report_id','report_receipts.unloading_report_id','report_receipts.backload_id','report_receipts.offload_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r WHERE num_nonnulls(r.loading_report_id,r.unloading_report_id,r.backload_id,r.offload_id)<>1'),
    ('receipts: stop missing or belongs to another trip',
     ARRAY['report_receipts.trip_id','report_receipts.trip_stop_id','trip_stops.id','trip_stops.trip_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r LEFT JOIN public.trip_stops s ON s.id=r.trip_stop_id WHERE r.trip_stop_id IS NOT NULL AND (s.id IS NULL OR s.trip_id IS DISTINCT FROM r.trip_id)'),
    ('receipts: loading parent missing or trip mismatch',
     ARRAY['report_receipts.loading_report_id','report_receipts.trip_id','loading_reports.id','loading_reports.trip_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r LEFT JOIN public.loading_reports p ON p.id=r.loading_report_id WHERE r.loading_report_id IS NOT NULL AND (p.id IS NULL OR p.trip_id IS DISTINCT FROM r.trip_id)'),
    ('receipts: unloading parent missing or stop/trip mismatch',
     ARRAY['report_receipts.unloading_report_id','report_receipts.trip_id','report_receipts.trip_stop_id','unloading_reports.id','unloading_reports.trip_id','unloading_reports.trip_stop_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r LEFT JOIN public.unloading_reports p ON p.id=r.unloading_report_id WHERE r.unloading_report_id IS NOT NULL AND (p.id IS NULL OR p.trip_id IS DISTINCT FROM r.trip_id OR p.trip_stop_id IS DISTINCT FROM r.trip_stop_id)'),
    ('receipts: backload parent missing or trip mismatch',
     ARRAY['report_receipts.backload_id','report_receipts.trip_id','backloads.id','backloads.trip_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r LEFT JOIN public.backloads p ON p.id=r.backload_id WHERE r.backload_id IS NOT NULL AND (p.id IS NULL OR p.trip_id IS DISTINCT FROM r.trip_id)'),
    ('receipts: offload parent missing or trip mismatch',
     ARRAY['report_receipts.offload_id','report_receipts.trip_id','offloads.id','offloads.trip_id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts r LEFT JOIN public.offloads p ON p.id=r.offload_id WHERE r.offload_id IS NOT NULL AND (p.id IS NULL OR p.trip_id IS DISTINCT FROM r.trip_id)'),
    ('existing loading report row count', ARRAY['loading_reports.id']::text[],
     'SELECT count(*) AS n FROM public.loading_reports'),
    ('existing unloading report row count', ARRAY['unloading_reports.id']::text[],
     'SELECT count(*) AS n FROM public.unloading_reports'),
    ('existing receipt row count', ARRAY['report_receipts.id']::text[],
     'SELECT count(*) AS n FROM public.report_receipts'),
    ('existing audit log row count', ARRAY['report_audit_logs.id']::text[],
     'SELECT count(*) AS n FROM public.report_audit_logs')
), checked AS (
  SELECT c.*,
    ARRAY(SELECT DISTINCT split_part(x, '.', 1)
          FROM unnest(c.required_columns) x
          WHERE to_regclass(format('public.%I', split_part(x, '.', 1))) IS NULL
          ORDER BY 1) AS missing_relations,
    ARRAY(SELECT x FROM unnest(c.required_columns) x
          WHERE to_regclass(format('public.%I', split_part(x, '.', 1))) IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public'
                AND col.table_name=split_part(x, '.', 1)
                AND col.column_name=split_part(x, '.', 2))
          ORDER BY 1) AS missing_columns
  FROM checks c
)
SELECT check_name,
  CASE WHEN cardinality(missing_relations)>0
       THEN 'MISSING RELATION: ' || array_to_string(missing_relations, ', ')
       WHEN cardinality(missing_columns)>0
       THEN 'MISSING COLUMN: ' || array_to_string(missing_columns, ', ')
       ELSE 'CHECKED' END AS status,
  CASE WHEN cardinality(missing_relations)=0 AND cardinality(missing_columns)=0
       THEN COALESCE((xpath('/table/row/n/text()',
                    query_to_xml(query_text, true, false, '')))[1]::text::bigint, 0)
       ELSE NULL END AS matching_row_count
FROM checked
ORDER BY check_name;

-- 7a. Proposed index-name conflicts and exact existing indexed columns.
WITH proposed_indexes(index_name, table_name, expected_columns) AS (
  VALUES
    ('proposed_trip_stops_id_trip_uq','trip_stops',ARRAY['id','trip_id']::text[]),
    ('proposed_loading_reports_id_trip_uq','loading_reports',ARRAY['id','trip_id']::text[]),
    ('proposed_unloading_reports_identity_uq','unloading_reports',ARRAY['id','trip_stop_id','trip_id']::text[]),
    ('proposed_backloads_id_trip_uq','backloads',ARRAY['id','trip_id']::text[]),
    ('proposed_offloads_id_trip_uq','offloads',ARRAY['id','trip_id']::text[]),
    ('proposed_unloading_reports_one_per_stop_uq','unloading_reports',ARRAY['trip_stop_id']::text[])
)
SELECT p.index_name AS proposed_name, p.table_name AS expected_table,
       p.expected_columns, idx_ns.nspname AS existing_schema,
       idx.relname AS existing_relation_name, tbl.relname AS existing_indexed_table,
       ix.indisunique AS is_unique, ix.indisvalid AS is_valid,
       ix.indisready AS is_ready, ix.indpred IS NULL AS has_no_predicate,
       ARRAY(SELECT a.attname FROM unnest(ix.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
             LEFT JOIN pg_attribute a ON a.attrelid=ix.indrelid AND a.attnum=k.attnum
             WHERE k.ord<=ix.indnkeyatts ORDER BY k.ord) AS existing_key_columns,
       pg_get_indexdef(idx.oid) AS existing_definition
FROM proposed_indexes p
LEFT JOIN pg_class idx ON idx.relname=p.index_name
LEFT JOIN pg_namespace idx_ns ON idx_ns.oid=idx.relnamespace
LEFT JOIN pg_index ix ON ix.indexrelid=idx.oid
LEFT JOIN pg_class tbl ON tbl.oid=ix.indrelid
ORDER BY p.index_name;

-- 7b. Proposed constraint-name conflicts.
WITH proposed_constraints(constraint_name) AS (
  VALUES ('proposed_unloading_report_stop_trip_fk'),
         ('proposed_receipts_exactly_one_parent_ck'),
         ('proposed_unloading_receipt_requires_stop_ck'),
         ('proposed_receipt_stop_trip_fk'),
         ('proposed_receipt_loading_trip_fk'),
         ('proposed_receipt_unloading_identity_fk'),
         ('proposed_receipt_backload_trip_fk'),
         ('proposed_receipt_offload_trip_fk'),
         ('proposed_backload_stop_trip_fk'), ('proposed_offload_stop_trip_fk')
)
SELECT p.constraint_name AS proposed_name, n.nspname AS existing_schema,
       tbl.relname AS existing_table, con.contype AS existing_constraint_type,
       con.convalidated AS is_validated,
       pg_get_constraintdef(con.oid, true) AS existing_definition
FROM proposed_constraints p
LEFT JOIN pg_constraint con ON con.conname=p.constraint_name
LEFT JOIN pg_class tbl ON tbl.oid=con.conrelid
LEFT JOIN pg_namespace n ON n.oid=tbl.relnamespace
ORDER BY p.constraint_name, n.nspname, tbl.relname;

-- 7c. Proposed trigger-name conflicts and attached functions.
WITH proposed_triggers(trigger_name) AS (
  VALUES ('proposed_receipt_scope_guard_trg'),
         ('proposed_backload_receipt_parent_guard_trg'),
         ('proposed_offload_receipt_parent_guard_trg')
)
SELECT p.trigger_name AS proposed_name, n.nspname AS existing_schema,
       tbl.relname AS existing_table, trg.tgenabled AS enabled_state,
       pg_get_triggerdef(trg.oid, true) AS existing_definition,
       fn_ns.nspname AS function_schema, fn.proname AS function_name,
       pg_get_userbyid(fn.proowner) AS function_owner, fn.prosecdef AS security_definer,
       fn.proconfig AS function_settings
FROM proposed_triggers p
LEFT JOIN pg_trigger trg ON trg.tgname=p.trigger_name AND NOT trg.tgisinternal
LEFT JOIN pg_class tbl ON tbl.oid=trg.tgrelid
LEFT JOIN pg_namespace n ON n.oid=tbl.relnamespace
LEFT JOIN pg_proc fn ON fn.oid=trg.tgfoid
LEFT JOIN pg_namespace fn_ns ON fn_ns.oid=fn.pronamespace
ORDER BY p.trigger_name, n.nspname, tbl.relname;

-- 7d. Proposed trigger-function name/signature conflicts.
WITH proposed_functions(function_name) AS (
  VALUES ('proposed_loading_unloading_validate_receipt_scope_v1'),
         ('proposed_loading_unloading_guard_parent_scope_v1')
)
SELECT p.function_name AS proposed_name, n.nspname AS existing_schema,
       fn.oid::regprocedure AS existing_signature,
       pg_get_userbyid(fn.proowner) AS function_owner,
       fn.prosecdef AS security_definer, fn.proconfig AS function_settings
FROM proposed_functions p
LEFT JOIN pg_proc fn ON fn.proname=p.function_name
LEFT JOIN pg_namespace n ON n.oid=fn.pronamespace
ORDER BY p.function_name, n.nspname, fn.oid::regprocedure::text;
