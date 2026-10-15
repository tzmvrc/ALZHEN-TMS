-- PROPOSAL ONLY — DO NOT APPLY until live-schema preflight and manual review.
--
-- Adds an atomic Backload <-> Offload conversion RPC and a durable conversion
-- ledger. Source rows are retained for history; the application must exclude
-- ledger-listed source IDs from active Operations Reports after this migration
-- is reviewed/applied and before any conversion API is enabled.
--
-- The current application has no conversion RPC, no report-audit writer, and
-- no receipt access contract. This RPC rejects a conversion if the source has
-- receipt metadata so it cannot orphan or silently reclassify attachments.
-- It does not move Storage objects or receipt metadata.
--
-- One-time migration: if any statement fails, inspect the transaction state
-- and catalog before retrying. Do not assume a partial SQL Editor failure was
-- rolled back. No application should call this RPC until the migration and
-- source-suppression behavior have both been reviewed and released.

BEGIN;

DO $$
DECLARE
  v_table text;
  v_column text;
  v_type text;
  v_backloads_owner oid;
  v_offloads_owner oid;
  v_current_role_oid oid;
BEGIN
  IF to_regclass('public.operations_report_conversions') IS NOT NULL THEN
    RAISE EXCEPTION 'public.operations_report_conversions already exists; inspect it manually';
  END IF;
  IF to_regprocedure('public.convert_operations_report_v1(text,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'public.convert_operations_report_v1(text,uuid,uuid) already exists; inspect it manually';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['backloads', 'offloads'] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'public.% is required; compare the live schema before proceeding', v_table;
    END IF;
    FOREACH v_column IN ARRAY ARRAY['id', 'trip_id', 'trip_stop_id', 'reason', 'number_of_boxes', 'comments'] LOOP
      SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END
        INTO v_type
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = v_column;
      IF v_type IS NULL THEN
        RAISE EXCEPTION 'public.%.% is missing; compare the live schema before proceeding', v_table, v_column;
      END IF;
      IF v_column IN ('id', 'trip_id', 'trip_stop_id') AND v_type <> 'uuid' THEN
        RAISE EXCEPTION 'public.%.% must be uuid (found %)', v_table, v_column, v_type;
      END IF;
    END LOOP;
  END LOOP;

  -- The paired values must be assignment-compatible when copied to the
  -- opposite table. The exact data types are intentionally checked, not cast.
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('reason'), ('number_of_boxes'), ('comments')) AS wanted(column_name)
    LEFT JOIN information_schema.columns AS b
      ON b.table_schema = 'public' AND b.table_name = 'backloads' AND b.column_name = wanted.column_name
    LEFT JOIN information_schema.columns AS o
      ON o.table_schema = 'public' AND o.table_name = 'offloads' AND o.column_name = wanted.column_name
    WHERE b.udt_name IS DISTINCT FROM o.udt_name
       OR b.data_type IS DISTINCT FROM o.data_type
  ) THEN
    RAISE EXCEPTION 'Backload and Offload field types differ; review explicit conversion mappings';
  END IF;

  IF to_regclass('public.trip_stops') IS NULL OR to_regclass('public.trips') IS NULL
     OR to_regclass('public.profiles') IS NULL OR to_regclass('public.report_receipts') IS NULL THEN
    RAISE EXCEPTION 'Required trips, trip_stops, profiles, or report_receipts table is missing';
  END IF;
  FOREACH v_column IN ARRAY ARRAY['id', 'trip_id'] LOOP
    SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END
      INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'trip_stops' AND c.column_name = v_column;
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.trip_stops.% must exist as uuid (found %)', v_column, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;
  SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END
    INTO v_type
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public' AND c.table_name = 'trips' AND c.column_name = 'id';
  IF v_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'public.trips.id must exist as uuid (found %)', COALESCE(v_type, 'missing');
  END IF;

  FOREACH v_column IN ARRAY ARRAY['id', 'role'] LOOP
    SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END
      INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.column_name = v_column;
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'public.profiles.% is required', v_column;
    END IF;
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['backload_id', 'offload_id'] LOOP
    SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END
      INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'report_receipts' AND c.column_name = v_column;
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.report_receipts.% must exist as uuid (found %)', v_column, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;

  SELECT oid INTO v_current_role_oid FROM pg_roles WHERE rolname = current_user;
  SELECT c.relowner INTO v_backloads_owner FROM pg_class AS c WHERE c.oid = 'public.backloads'::regclass;
  SELECT c.relowner INTO v_offloads_owner FROM pg_class AS c WHERE c.oid = 'public.offloads'::regclass;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles AS r
    WHERE r.oid = v_current_role_oid AND (r.rolsuper OR r.rolbypassrls)
  ) AND (v_backloads_owner <> v_current_role_oid OR v_offloads_owner <> v_current_role_oid) THEN
    RAISE EXCEPTION 'The migration/function owner must own both cargo tables or have BYPASSRLS; review execution role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class AS c
    WHERE c.oid IN ('public.backloads'::regclass, 'public.offloads'::regclass)
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Forced RLS on backloads/offloads needs a separately reviewed function security design';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles AS r
    WHERE r.oid = v_current_role_oid AND (r.rolsuper OR r.rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_class AS c
    WHERE c.oid IN (
      'public.backloads'::regclass, 'public.offloads'::regclass,
      'public.trips'::regclass, 'public.trip_stops'::regclass,
      'public.profiles'::regclass, 'public.report_receipts'::regclass
    ) AND c.relrowsecurity AND c.relowner <> v_current_role_oid
  ) THEN
    RAISE EXCEPTION 'RLS-protected function dependencies must be owned by the function owner or use an approved bypass role';
  END IF;
  IF NOT has_table_privilege(current_user, 'public.backloads', 'SELECT')
     OR NOT has_table_privilege(current_user, 'public.backloads', 'INSERT')
     OR NOT has_table_privilege(current_user, 'public.offloads', 'SELECT')
     OR NOT has_table_privilege(current_user, 'public.offloads', 'INSERT')
     OR NOT has_table_privilege(current_user, 'public.trips', 'SELECT')
     OR NOT has_table_privilege(current_user, 'public.trip_stops', 'SELECT')
     OR NOT has_table_privilege(current_user, 'public.profiles', 'SELECT')
     OR NOT has_table_privilege(current_user, 'public.report_receipts', 'SELECT') THEN
    RAISE EXCEPTION 'Function owner lacks required source, target, scope, profile, or receipt SELECT/INSERT privileges';
  END IF;

  -- Refuse name collisions instead of treating them as successful preflight.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operations_report_conversions_source_uq'
       OR conname = 'operations_report_conversions_target_uq'
       OR conname = 'operations_report_conversions_kind_ck'
  ) THEN
    RAISE EXCEPTION 'A proposed conversion constraint name already exists; inspect its definition manually';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['backloads', 'offloads'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = 'id'
        AND (c.column_default IS NOT NULL OR c.is_identity = 'YES')
    ) THEN
      RAISE EXCEPTION 'public.%.id must generate a UUID for target records', v_table;
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE public.operations_report_conversions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL,
  source_record_id uuid NOT NULL,
  target_type text NOT NULL,
  target_record_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  trip_stop_id uuid,
  source_snapshot jsonb NOT NULL,
  actor_profile_id uuid NOT NULL,
  actor_role text NOT NULL,
  converted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT operations_report_conversions_kind_ck CHECK (
    (source_type = 'backloads' AND target_type = 'offloads') OR
    (source_type = 'offloads' AND target_type = 'backloads')
  ),
  CONSTRAINT operations_report_conversions_source_uq UNIQUE (source_type, source_record_id),
  CONSTRAINT operations_report_conversions_target_uq UNIQUE (target_type, target_record_id)
);

COMMENT ON TABLE public.operations_report_conversions IS
  'Append-only history of Backload/Offload category moves; source records are retained and hidden from active reports by the backend.';
COMMENT ON COLUMN public.operations_report_conversions.source_snapshot IS
  'Complete original source row captured by the same transaction. Historical only; never replay this JSON over current records.';

ALTER TABLE public.operations_report_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.operations_report_conversions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.operations_report_conversions TO service_role;

CREATE FUNCTION public.convert_operations_report_v1(
  p_source_type text,
  p_source_record_id uuid,
  p_actor_profile_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_role text;
  v_trip_id uuid;
  v_stop_id uuid;
  v_initial_trip_id uuid;
  v_initial_stop_id uuid;
  v_target_type text;
  v_reason public.backloads.reason%TYPE;
  v_boxes public.backloads.number_of_boxes%TYPE;
  v_comments public.backloads.comments%TYPE;
  v_target_id uuid;
  v_history_id bigint;
  v_snapshot jsonb;
  v_source_snapshot jsonb;
  v_has_source boolean := false;
BEGIN
  IF p_source_type IS NULL OR p_source_type NOT IN ('backloads', 'offloads')
     OR p_source_record_id IS NULL OR p_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'Unsupported conversion request' USING ERRCODE = '22023';
  END IF;
  v_target_type := CASE p_source_type WHEN 'backloads' THEN 'offloads' ELSE 'backloads' END;

  SELECT upper(p.role::text) INTO v_role
  FROM public.profiles AS p
  WHERE p.id = p_actor_profile_id;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'STAFF') THEN
    RAISE EXCEPTION 'Only ADMIN or STAFF may convert operational reports' USING ERRCODE = '42501';
  END IF;

  -- Read the scope, take a transaction-scoped advisory lock for that exact
  -- trip/stop, then lock and reread the source. A scope change while waiting
  -- aborts and must be retried from a fresh read.
  IF p_source_type = 'backloads' THEN
    SELECT b.trip_id, b.trip_stop_id INTO v_initial_trip_id, v_initial_stop_id
    FROM public.backloads AS b WHERE b.id = p_source_record_id;
  ELSE
    SELECT o.trip_id, o.trip_stop_id INTO v_initial_trip_id, v_initial_stop_id
    FROM public.offloads AS o WHERE o.id = p_source_record_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source report no longer exists' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('operations-report-conversion'),
    hashtext(v_target_type || ':' || v_initial_trip_id::text || ':' || COALESCE(v_initial_stop_id::text, 'trip'))
  );

  IF p_source_type = 'backloads' THEN
    SELECT b.trip_id, b.trip_stop_id, b.reason, b.number_of_boxes, b.comments, to_jsonb(b)
      INTO v_trip_id, v_stop_id, v_reason, v_boxes, v_comments, v_source_snapshot
    FROM public.backloads AS b WHERE b.id = p_source_record_id FOR UPDATE;
    v_has_source := FOUND;
  ELSE
    SELECT o.trip_id, o.trip_stop_id, o.reason, o.number_of_boxes, o.comments, to_jsonb(o)
      INTO v_trip_id, v_stop_id, v_reason, v_boxes, v_comments, v_source_snapshot
    FROM public.offloads AS o WHERE o.id = p_source_record_id FOR UPDATE;
    v_has_source := FOUND;
  END IF;
  IF NOT v_has_source THEN
    RAISE EXCEPTION 'Source report no longer exists' USING ERRCODE = 'P0002';
  END IF;
  IF v_trip_id IS DISTINCT FROM v_initial_trip_id OR v_stop_id IS DISTINCT FROM v_initial_stop_id THEN
    RAISE EXCEPTION 'Source report scope changed; reload before converting' USING ERRCODE = '40001';
  END IF;
  IF v_stop_id IS NOT NULL THEN
    PERFORM 1 FROM public.trip_stops AS s
    WHERE s.id = v_stop_id AND s.trip_id = v_trip_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source stop no longer belongs to its trip' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips AS t WHERE t.id = v_trip_id) THEN
    RAISE EXCEPTION 'Source trip no longer exists' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operations_report_conversions AS c
    WHERE c.source_type = p_source_type AND c.source_record_id = p_source_record_id
  ) THEN
    RAISE EXCEPTION 'Source report has already been converted' USING ERRCODE = '23505';
  END IF;

  -- Do not impose a new one-report-per-scope rule: checked-in migrations do
  -- not establish that cardinality. Existing unique constraints on the target
  -- table are allowed to reject an insert; that error rolls back the complete
  -- conversion. No target record is merged or overwritten.

  -- Preserve all metadata by refusing conversion while receipt records remain
  -- attached. Storage paths are neither copied nor changed by this RPC.
  IF (p_source_type = 'backloads' AND EXISTS (SELECT 1 FROM public.report_receipts AS r WHERE r.backload_id = p_source_record_id))
     OR (p_source_type = 'offloads' AND EXISTS (SELECT 1 FROM public.report_receipts AS r WHERE r.offload_id = p_source_record_id)) THEN
    RAISE EXCEPTION 'This report has receipt metadata; resolve attachment transfer before converting' USING ERRCODE = '23514';
  END IF;

  -- This is the complete source row, including columns unknown to the current
  -- application contract. It is historical evidence only and must never be
  -- replayed over an unrelated/current source or target record.
  v_snapshot := v_source_snapshot;
  IF v_target_type = 'offloads' THEN
    BEGIN
      INSERT INTO public.offloads (trip_id, trip_stop_id, reason, number_of_boxes, comments)
      VALUES (v_trip_id, v_stop_id, v_reason, v_boxes, v_comments)
      RETURNING id INTO v_target_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Offload target conflicts with an existing uniqueness rule' USING ERRCODE = '23505';
    END;
  ELSE
    BEGIN
      INSERT INTO public.backloads (trip_id, trip_stop_id, reason, number_of_boxes, comments)
      VALUES (v_trip_id, v_stop_id, v_reason, v_boxes, v_comments)
      RETURNING id INTO v_target_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Backload target conflicts with an existing uniqueness rule' USING ERRCODE = '23505';
    END;
  END IF;

  INSERT INTO public.operations_report_conversions (
    source_type, source_record_id, target_type, target_record_id,
    trip_id, trip_stop_id, source_snapshot, actor_profile_id, actor_role
  ) VALUES (
    p_source_type, p_source_record_id, v_target_type, v_target_id,
    v_trip_id, v_stop_id, v_snapshot, p_actor_profile_id, v_role
  ) RETURNING id INTO v_history_id;

  RETURN jsonb_build_object(
    'conversion_id', v_history_id,
    'source_type', p_source_type, 'source_record_id', p_source_record_id,
    'target_type', v_target_type, 'target_record_id', v_target_id,
    'trip_id', v_trip_id, 'trip_stop_id', v_stop_id,
    'actor_profile_id', p_actor_profile_id, 'actor_role', v_role
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.convert_operations_report_v1(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_operations_report_v1(text, uuid, uuid) TO service_role;

COMMIT;
