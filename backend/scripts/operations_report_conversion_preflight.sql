-- ALZHEN TMS Operations Reports conversion preflight.
-- READ ONLY: all executable statements below are catalog queries or SELECTs.
-- This script does not prove that a migration was applied merely because an
-- object with a proposed name exists. Compare definitions and migration
-- history separately before deciding whether any proposal has been applied.

-- 1. Required relations used by the October 13, 14, and 15 proposals.
WITH expected(relation_name) AS (
  VALUES ('trips'), ('profiles'), ('trip_stops'),
         ('loading_reports'), ('unloading_reports'), ('backloads'), ('offloads'),
         ('backload_items'), ('offload_items'), ('report_receipts'),
         ('report_audit_logs'), ('operations_report_conversions')
)
SELECT e.relation_name,
       to_regclass(format('public.%I', e.relation_name)) AS relation,
       to_regclass(format('public.%I', e.relation_name)) IS NOT NULL AS relation_exists
FROM expected e
ORDER BY e.relation_name;

-- 2. All live columns for relevant relations, plus explicit missing-column
-- results for the fields referenced by the three proposals.
WITH required_columns(table_name, column_name) AS (
  VALUES
    ('trips','id'), ('profiles','id'), ('profiles','role'),
    ('trip_stops','id'), ('trip_stops','trip_id'), ('trip_stops','stop_sequence'),
    ('trip_stops','store_id'), ('trip_stops','customer_id'),
    ('trip_stops','delivery_status'), ('trip_stops','arrival_time'),
    ('trip_stops','start_unloading_time'), ('trip_stops','finish_unloading_time'),
    ('trip_stops','departure_time'), ('trip_stops','remarks'),
    ('loading_reports','id'), ('loading_reports','trip_id'),
    ('loading_reports','warehouse_arrival_at'), ('loading_reports','loading_start_at'),
    ('loading_reports','loading_finished_at'),
    ('unloading_reports','id'), ('unloading_reports','trip_id'), ('unloading_reports','trip_stop_id'),
    ('backloads','id'), ('backloads','trip_id'), ('backloads','trip_stop_id'),
    ('backloads','reason'), ('backloads','number_of_boxes'), ('backloads','comments'),
    ('offloads','id'), ('offloads','trip_id'), ('offloads','trip_stop_id'),
    ('offloads','reason'), ('offloads','number_of_boxes'), ('offloads','comments'),
    ('backload_items','id'), ('backload_items','backload_id'),
    ('offload_items','id'), ('offload_items','offload_id'),
    ('report_receipts','id'), ('report_receipts','trip_id'), ('report_receipts','trip_stop_id'),
    ('report_receipts','loading_report_id'), ('report_receipts','unloading_report_id'),
    ('report_receipts','backload_id'), ('report_receipts','offload_id'),
    ('report_receipts','created_at'),
    ('operations_report_conversions','id'), ('operations_report_conversions','source_type'),
    ('operations_report_conversions','source_id'), ('operations_report_conversions','target_type'),
    ('operations_report_conversions','target_id'), ('operations_report_conversions','trip_id'),
    ('operations_report_conversions','trip_stop_id'), ('operations_report_conversions','actor_profile_id'),
    ('operations_report_conversions','source_snapshot'), ('operations_report_conversions','source_items_snapshot'),
    ('operations_report_conversions','created_at'),
    -- Legacy October 14 proposal fields; included to expose its shape mismatch
    -- with the later October 15 conversion-ledger contract.
    ('operations_report_conversions','source_record_id'),
    ('operations_report_conversions','target_record_id'),
    ('operations_report_conversions','actor_role'),
    ('operations_report_conversions','converted_at')
), relevant_tables(table_name) AS (
  SELECT DISTINCT table_name FROM required_columns
)
SELECT c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_schema,
       c.udt_name, c.is_nullable, c.column_default, c.is_identity,
       c.identity_generation, c.is_generated, c.generation_expression,
       'PRESENT'::text AS check_status
FROM information_schema.columns c
JOIN relevant_tables r ON r.table_name = c.table_name
WHERE c.table_schema = 'public'
UNION ALL
SELECT r.table_name, NULL::integer, r.column_name, NULL::text, NULL::text,
       NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
       NULL::text, NULL::text, 'MISSING'::text
FROM required_columns r
WHERE to_regclass(format('public.%I', r.table_name)) IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = r.table_name
       AND c.column_name = r.column_name
   )
ORDER BY table_name, ordinal_position NULLS LAST, column_name, check_status;

-- 3. Constraints and their actual definitions on all relevant report, scope,
-- item, receipt, and conversion-ledger relations.
SELECT ns.nspname AS schema_name, tbl.relname AS table_name, con.conname AS constraint_name,
       CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUSION'
         ELSE con.contype::text END AS constraint_type,
       con.convalidated AS is_validated, con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class tbl ON tbl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
WHERE ns.nspname = 'public'
  AND tbl.relname IN ('trips','profiles','trip_stops','loading_reports','unloading_reports',
    'backloads','offloads','backload_items','offload_items','report_receipts',
    'report_audit_logs','operations_report_conversions')
ORDER BY tbl.relname, constraint_type, con.conname;

-- 4. Indexes for the same relations. This exposes existing key indexes and
-- whether proposed one-loading-per-trip / one-unloading-per-stop indexes exist.
SELECT ns.nspname AS schema_name, tbl.relname AS table_name, idx.relname AS index_name,
       ix.indisprimary AS is_primary, ix.indisunique AS is_unique,
       ix.indisvalid AS is_valid, ix.indisready AS is_ready, ix.indislive AS is_live,
       ix.indnkeyatts AS key_column_count,
       pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
       pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index ix
JOIN pg_class tbl ON tbl.oid = ix.indrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN pg_class idx ON idx.oid = ix.indexrelid
WHERE ns.nspname = 'public'
  AND tbl.relname IN ('trip_stops','loading_reports','unloading_reports','backloads','offloads',
    'backload_items','offload_items','report_receipts','operations_report_conversions')
ORDER BY tbl.relname, idx.relname;

-- 4b. Presence and definitions for explicitly named proposed indexes and
-- constraints. A matching name alone is not proof that an object is compatible.
WITH expected_objects(object_kind, object_name) AS (
  VALUES
    ('INDEX','proposed_trip_stops_id_trip_uq'),
    ('INDEX','proposed_loading_reports_id_trip_uq'),
    ('INDEX','proposed_unloading_reports_identity_uq'),
    ('INDEX','proposed_backloads_id_trip_uq'),
    ('INDEX','proposed_offloads_id_trip_uq'),
    ('INDEX','proposed_unloading_reports_one_per_stop_uq'),
    ('CONSTRAINT','proposed_unloading_report_stop_trip_fk'),
    ('CONSTRAINT','proposed_receipts_exactly_one_parent_ck'),
    ('CONSTRAINT','proposed_unloading_receipt_requires_stop_ck'),
    ('CONSTRAINT','proposed_receipt_stop_trip_fk'),
    ('CONSTRAINT','proposed_receipt_loading_trip_fk'),
    ('CONSTRAINT','proposed_receipt_unloading_identity_fk'),
    ('CONSTRAINT','proposed_receipt_backload_trip_fk'),
    ('CONSTRAINT','proposed_receipt_offload_trip_fk'),
    ('CONSTRAINT','proposed_backload_stop_trip_fk'),
    ('CONSTRAINT','proposed_offload_stop_trip_fk'),
    ('CONSTRAINT','operations_report_conversions_kind_ck'),
    ('CONSTRAINT','operations_report_conversions_source_uq'),
    ('CONSTRAINT','operations_report_conversions_target_uq')
), found_objects AS (
  SELECT 'INDEX'::text AS object_kind, idx.relname AS object_name,
         tbl.relname AS parent_table, pg_get_indexdef(idx.oid) AS definition
  FROM pg_class idx
  JOIN pg_namespace ns ON ns.oid = idx.relnamespace
  LEFT JOIN pg_index ix ON ix.indexrelid = idx.oid
  LEFT JOIN pg_class tbl ON tbl.oid = ix.indrelid
  WHERE ns.nspname = 'public' AND idx.relkind = 'i'
  UNION ALL
  SELECT 'CONSTRAINT'::text, con.conname, tbl.relname,
         pg_get_constraintdef(con.oid, true)
  FROM pg_constraint con
  JOIN pg_class tbl ON tbl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  WHERE ns.nspname = 'public'
)
SELECT e.object_kind, e.object_name,
       CASE WHEN f.object_name IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status,
       f.parent_table, f.definition
FROM expected_objects e
LEFT JOIN found_objects f ON f.object_kind = e.object_kind AND f.object_name = e.object_name
ORDER BY e.object_kind, e.object_name, f.parent_table;

-- 5. RLS flags and current policies. Catalog presence is evidence of current
-- definitions only; it does not establish which migration created them.
SELECT e.table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM (VALUES ('profiles'),('trip_stops'),('loading_reports'),('unloading_reports'),
             ('backloads'),('offloads'),('backload_items'),('offload_items'),
             ('report_receipts'),('report_audit_logs'),('operations_report_conversions')) e(table_name)
LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', e.table_name))
ORDER BY e.table_name;

SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles','trip_stops','loading_reports','unloading_reports',
    'backloads','offloads','backload_items','offload_items','report_receipts',
    'report_audit_logs','operations_report_conversions')
ORDER BY tablename, policyname;

-- 6. Every trigger currently attached to the report parents, child items,
-- receipts, or stops, with its trigger definition and implementation routine.
SELECT table_ns.nspname AS table_schema, tbl.relname AS table_name,
       trg.tgname AS trigger_name, trg.tgenabled AS enabled_state,
       trg.tgisinternal AS is_internal,
       pg_get_triggerdef(trg.oid, true) AS trigger_definition,
       fn_ns.nspname AS function_schema, fn.oid::regprocedure AS function_signature,
       pg_get_userbyid(fn.proowner) AS function_owner,
       fn.prosecdef AS security_definer, fn.proconfig AS function_settings,
       pg_get_functiondef(fn.oid) AS function_definition
FROM pg_trigger trg
JOIN pg_class tbl ON tbl.oid = trg.tgrelid
JOIN pg_namespace table_ns ON table_ns.oid = tbl.relnamespace
JOIN pg_proc fn ON fn.oid = trg.tgfoid
JOIN pg_namespace fn_ns ON fn_ns.oid = fn.pronamespace
WHERE table_ns.nspname = 'public'
  AND tbl.relname IN ('loading_reports','unloading_reports','backloads','offloads',
    'backload_items','offload_items','report_receipts','trip_stops')
ORDER BY tbl.relname, trg.tgname;

-- 6b. Explicit expected trigger-name presence for both integrity and
-- conversion proposals, including same-named triggers attached elsewhere.
WITH expected_triggers(trigger_name) AS (
  VALUES
    ('proposed_receipt_scope_guard_trg'),
    ('proposed_backload_receipt_parent_guard_trg'),
    ('proposed_offload_receipt_parent_guard_trg'),
    ('converted_loading_report_immutable_trg'),
    ('converted_unloading_report_immutable_trg'),
    ('converted_backload_immutable_trg'),
    ('converted_offload_immutable_trg'),
    ('converted_receipt_parent_immutable_trg'),
    ('converted_backload_item_immutable_trg'),
    ('converted_offload_item_immutable_trg'),
    ('converted_unloading_stop_immutable_trg')
)
SELECT e.trigger_name,
       CASE WHEN trg.oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status,
       ns.nspname AS table_schema, tbl.relname AS table_name,
       trg.tgenabled AS enabled_state, pg_get_triggerdef(trg.oid, true) AS definition
FROM expected_triggers e
LEFT JOIN pg_trigger trg ON trg.tgname = e.trigger_name AND NOT trg.tgisinternal
LEFT JOIN pg_class tbl ON tbl.oid = trg.tgrelid
LEFT JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
ORDER BY e.trigger_name, ns.nspname, tbl.relname;

-- 7. Definitions for functions created or referenced by the three migration
-- files, including the older October 14 overload. Missing rows mean no matching
-- signature is currently found; do not infer migration application from names.
WITH expected(signature) AS (
  VALUES
    ('public.proposed_loading_unloading_validate_receipt_scope_v1()'),
    ('public.proposed_loading_unloading_guard_parent_scope_v1()'),
    ('public.convert_operations_report_v1(text,uuid,uuid)'),
    ('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('public.guard_converted_operations_report_source_v1()'),
    ('public.guard_converted_report_receipt_parent_v1()'),
    ('public.guard_converted_operations_report_item_v1()'),
    ('public.guard_converted_unloading_stop_v1()')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS routine
  FROM expected
)
SELECT r.signature AS expected_signature, p.oid::regprocedure AS existing_signature,
       pg_get_userbyid(p.proowner) AS function_owner, owner_role.rolsuper AS owner_is_superuser,
       owner_role.rolbypassrls AS owner_bypasses_rls,
       p.prosecdef AS security_definer, p.proconfig AS function_settings,
       p.proacl AS raw_acl,
       pg_get_functiondef(p.oid) AS function_definition
FROM resolved r
LEFT JOIN pg_proc p ON p.oid = r.routine::oid
LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
ORDER BY r.signature;

-- 8. Function EXECUTE ACL entries and effective EXECUTE checks for migration
-- routines. PUBLIC/default ACL entries are shown explicitly.
WITH expected(signature) AS (
  VALUES
    ('public.proposed_loading_unloading_validate_receipt_scope_v1()'),
    ('public.proposed_loading_unloading_guard_parent_scope_v1()'),
    ('public.convert_operations_report_v1(text,uuid,uuid)'),
    ('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('public.guard_converted_operations_report_source_v1()'),
    ('public.guard_converted_report_receipt_parent_v1()'),
    ('public.guard_converted_operations_report_item_v1()'),
    ('public.guard_converted_unloading_stop_v1()')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS routine FROM expected
)
SELECT r.signature AS expected_signature, p.oid::regprocedure AS existing_signature,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       acl.privilege_type, acl.is_grantable
FROM resolved r
JOIN pg_proc p ON p.oid = r.routine::oid
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
ORDER BY r.signature, grantee;

WITH expected(signature) AS (
  VALUES
    ('public.proposed_loading_unloading_validate_receipt_scope_v1()'),
    ('public.proposed_loading_unloading_guard_parent_scope_v1()'),
    ('public.convert_operations_report_v1(text,uuid,uuid)'),
    ('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('public.guard_converted_operations_report_source_v1()'),
    ('public.guard_converted_report_receipt_parent_v1()'),
    ('public.guard_converted_operations_report_item_v1()'),
    ('public.guard_converted_unloading_stop_v1()')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS routine FROM expected
), principals(role_name) AS (
  VALUES ('service_role'), ('authenticated'), ('anon')
)
SELECT r.signature AS expected_signature, p.oid::regprocedure AS existing_signature,
       principals.role_name,
       CASE WHEN p.oid IS NULL OR to_regrole(principals.role_name) IS NULL THEN NULL
            ELSE has_function_privilege(principals.role_name, p.oid, 'EXECUTE') END AS effective_execute
FROM resolved r
LEFT JOIN pg_proc p ON p.oid = r.routine::oid
CROSS JOIN principals
ORDER BY r.signature, principals.role_name;

-- 9. Role attributes, schema usage, and effective table privileges for
-- service_role and each function owner. These are read-only checks; they do not
-- grant or revoke anything. NULL rows indicate a missing routine/table/role.
SELECT rolname AS role_name, rolcanlogin AS can_login, rolinherit AS inherits_privileges,
       rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
FROM pg_roles
WHERE rolname IN ('service_role','authenticated','anon')
ORDER BY rolname;

-- Effective table rights for the API service_role and browser-facing roles.
-- These catalog checks do not grant or revoke any privileges.
WITH expected(table_name) AS (
  VALUES ('profiles'),('trip_stops'),('loading_reports'),('unloading_reports'),
    ('backloads'),('offloads'),('backload_items'),('offload_items'),
    ('report_receipts'),('report_audit_logs'),('operations_report_conversions')
), principals(role_name) AS (
  VALUES ('service_role'),('authenticated'),('anon')
), privileges(privilege_name) AS (
  VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER')
)
SELECT p.role_name, e.table_name, v.privilege_name,
       CASE WHEN to_regrole(p.role_name) IS NULL OR to_regclass(format('public.%I',e.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege(p.role_name, format('public.%I',e.table_name), v.privilege_name) END AS effective_privilege
FROM principals p CROSS JOIN expected e CROSS JOIN privileges v
ORDER BY p.role_name, e.table_name, v.privilege_name;

WITH expected(signature) AS (
  VALUES
    ('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('public.guard_converted_operations_report_source_v1()'),
    ('public.guard_converted_report_receipt_parent_v1()'),
    ('public.guard_converted_operations_report_item_v1()'),
    ('public.guard_converted_unloading_stop_v1()')
), owners AS (
  SELECT e.signature, p.proowner AS owner_oid, owner_role.rolname AS owner_name,
         owner_role.rolsuper, owner_role.rolbypassrls
  FROM expected e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)::oid
  LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
)
SELECT o.signature, o.owner_name, o.rolsuper AS owner_is_superuser,
       o.rolbypassrls AS owner_bypasses_rls,
       CASE WHEN o.owner_oid IS NULL THEN NULL
            ELSE has_schema_privilege(o.owner_oid, 'public', 'USAGE') END AS public_schema_usage
FROM owners o
ORDER BY o.signature;

WITH expected(signature) AS (
  VALUES
    ('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('public.guard_converted_operations_report_source_v1()'),
    ('public.guard_converted_report_receipt_parent_v1()'),
    ('public.guard_converted_operations_report_item_v1()'),
    ('public.guard_converted_unloading_stop_v1()')
), owners AS (
  SELECT e.signature, p.proowner AS owner_oid, owner_role.rolname AS owner_name
  FROM expected e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)::oid
  LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
), required(table_name, privilege_name, function_signature) AS (
  VALUES
    ('operations_report_conversions','SELECT','*'),
    ('operations_report_conversions','INSERT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('profiles','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('report_receipts','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('report_receipts','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('trip_stops','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('trip_stops','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('backload_items','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('offload_items','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('loading_reports','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('loading_reports','INSERT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('loading_reports','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('unloading_reports','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('unloading_reports','INSERT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('unloading_reports','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('backloads','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('backloads','INSERT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('backloads','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('offloads','SELECT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('offloads','INSERT','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('offloads','UPDATE','public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'),
    ('backloads','SELECT','public.guard_converted_report_receipt_parent_v1()'),
    ('backloads','UPDATE','public.guard_converted_report_receipt_parent_v1()'),
    ('offloads','SELECT','public.guard_converted_report_receipt_parent_v1()'),
    ('offloads','UPDATE','public.guard_converted_report_receipt_parent_v1()'),
    ('loading_reports','SELECT','public.guard_converted_report_receipt_parent_v1()'),
    ('loading_reports','UPDATE','public.guard_converted_report_receipt_parent_v1()'),
    ('unloading_reports','SELECT','public.guard_converted_report_receipt_parent_v1()'),
    ('unloading_reports','UPDATE','public.guard_converted_report_receipt_parent_v1()'),
    ('backloads','SELECT','public.guard_converted_operations_report_item_v1()'),
    ('backloads','UPDATE','public.guard_converted_operations_report_item_v1()'),
    ('offloads','SELECT','public.guard_converted_operations_report_item_v1()'),
    ('offloads','UPDATE','public.guard_converted_operations_report_item_v1()'),
    ('unloading_reports','SELECT','public.guard_converted_unloading_stop_v1()')
)
SELECT o.signature, o.owner_name, r.table_name, r.privilege_name,
       CASE WHEN o.owner_oid IS NULL OR to_regclass(format('public.%I', r.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege(o.owner_oid, format('public.%I', r.table_name), r.privilege_name) END AS effective_privilege
FROM required r
JOIN owners o ON r.function_signature='*' OR r.function_signature=o.signature
ORDER BY o.signature, r.table_name, r.privilege_name;

-- Check any backing sequence for target report IDs and the identity conversion
-- ledger ID. UUID defaults need no sequence; sequence-backed IDs do.
WITH expected_tables(table_name) AS (
  VALUES ('loading_reports'),('unloading_reports'),('backloads'),('offloads'),
         ('operations_report_conversions')
), sequences AS (
  SELECT e.table_name,
         CASE WHEN to_regclass(format('public.%I',e.table_name)) IS NULL
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_schema='public' AND c.table_name=e.table_name AND c.column_name='id') THEN NULL
              ELSE pg_get_serial_sequence(format('public.%I',e.table_name),'id') END AS sequence_name
  FROM expected_tables e
), rpc_owner AS (
  SELECT p.proowner AS owner_oid,
         'public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)'::text AS signature,
         pg_get_userbyid(p.proowner) AS owner_name
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)')::oid
)
SELECT o.signature, o.owner_name, s.table_name, s.sequence_name,
       CASE WHEN o.owner_oid IS NULL OR s.sequence_name IS NULL THEN NULL
            ELSE has_sequence_privilege(o.owner_oid, s.sequence_name, 'USAGE') END AS sequence_usage,
       CASE WHEN o.owner_oid IS NULL OR s.sequence_name IS NULL THEN NULL
            ELSE has_sequence_privilege(o.owner_oid, s.sequence_name, 'UPDATE') END AS sequence_update,
       CASE WHEN o.owner_oid IS NULL OR s.sequence_name IS NULL THEN NULL
            ELSE has_sequence_privilege(o.owner_oid, s.sequence_name, 'USAGE')
              OR has_sequence_privilege(o.owner_oid, s.sequence_name, 'UPDATE') END AS can_advance_identity
FROM rpc_owner o CROSS JOIN sequences s
ORDER BY s.table_name;

-- 10. Migration-history availability. The presence of a history relation is
-- only a hint: table contents and migration naming conventions must be reviewed
-- separately. No history table is assumed or queried dynamically.
SELECT to_regclass('supabase_migrations.schema_migrations') AS supabase_schema_migrations_relation,
       to_regclass('public.schema_migrations') AS public_schema_migrations_relation;

-- Prerequisites not safely established by these catalog reads:
-- * Whether the October 13/14/15 files were actually run, and whether their
--   recorded history matches the current object definitions.
-- * Whether migration executor privileges, deployment ordering, or transaction
--   boundaries are suitable for applying any proposal.
-- * Whether trigger behavior, receipt transfers, RLS bypass, rollback, and
--   concurrent receipt/item writes behave as intended at runtime.
-- * Whether private Storage objects exist, their bucket policies, or whether
--   stored receipt paths resolve to the intended files.
-- Review returned definitions and perform approved tests in a disposable
-- database before proposing any migration execution.
