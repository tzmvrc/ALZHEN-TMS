-- PROPOSAL ONLY: Loading / Unloading report integrity and private receipts.
-- This is a one-time, transactional migration draft. Review the live schema,
-- existing rows, constraints, grants, and bucket state before manual use.
-- Any failed preflight or DDL statement rolls back the transaction. Inspect
-- state before retrying if the SQL Editor/session did not confirm rollback.
--
-- Repository migrations do not define these report tables. The preflight
-- intentionally requires report_receipts to have UUID columns named
-- loading_report_id, unloading_report_id, backload_id, offload_id, trip_id,
-- and trip_stop_id. Adjust only after comparing with live catalog results.
-- This draft does not alter trip timestamps/events, existing report values,
-- backloads/offloads, RLS policies, Storage policies, or Realtime membership.

BEGIN;

DO $$
DECLARE
  v_table text;
  v_column text;
  v_type text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'loading_reports', 'unloading_reports', 'report_receipts',
    'report_audit_logs', 'trip_stops', 'backloads', 'offloads'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing; inspect the live schema first', v_table;
    END IF;
  END LOOP;

  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'storage.buckets is unavailable; review the Supabase Storage schema before applying';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'report-receipts' OR name = 'report-receipts'
  ) THEN
    RAISE EXCEPTION 'The report-receipts bucket already exists; inspect its settings and policies manually';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['loading_reports', 'backloads', 'offloads'] LOOP
    FOREACH v_column IN ARRAY ARRAY['id', 'trip_id'] LOOP
      SELECT c.udt_name INTO v_type
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = v_table
        AND c.column_name = v_column;
      IF v_type IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'public.%.% must exist and be uuid (found %)', v_table, v_column, COALESCE(v_type, 'missing');
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['id', 'trip_id'] LOOP
    SELECT c.udt_name INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'trip_stops'
      AND c.column_name = v_column;
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.trip_stops.% must exist and be uuid (found %)', v_column, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['id', 'trip_id', 'trip_stop_id'] LOOP
    SELECT c.udt_name INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'unloading_reports'
      AND c.column_name = v_column;
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.unloading_reports.% must exist and be uuid (found %)', v_column, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY['backloads', 'offloads'] LOOP
    SELECT c.udt_name INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = v_table
      AND c.column_name = 'trip_stop_id';
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.%.trip_stop_id must exist and be uuid (found %)', v_table, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;

  -- Proposed names are deliberately one-time. Abort rather than treating an
  -- existing same-named but potentially different object as validated.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN (
      'proposed_unloading_report_stop_trip_fk',
      'proposed_receipts_exactly_one_parent_ck',
      'proposed_unloading_receipt_requires_stop_ck',
      'proposed_receipt_stop_trip_fk',
      'proposed_receipt_loading_trip_fk',
      'proposed_receipt_unloading_identity_fk',
      'proposed_receipt_backload_trip_fk',
      'proposed_receipt_offload_trip_fk',
      'proposed_backload_stop_trip_fk',
      'proposed_offload_stop_trip_fk'
    )
  ) THEN
    RAISE EXCEPTION 'A proposed constraint name already exists; inspect its definition and migration history before proceeding';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal AND tgname IN (
      'proposed_receipt_scope_guard_trg',
      'proposed_backload_receipt_parent_guard_trg',
      'proposed_offload_receipt_parent_guard_trg'
    )
  ) THEN
    RAISE EXCEPTION 'A proposed trigger name already exists; inspect its definition and migration history before proceeding';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('report_receipts', 'backloads', 'offloads')
      AND relation.relrowsecurity
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Trigger queries require service_role to bypass RLS on protected receipt/parent rows; inspect role attributes and policies before applying';
  END IF;
  IF to_regprocedure('public.proposed_loading_unloading_validate_receipt_scope_v1()') IS NOT NULL
     OR to_regprocedure('public.proposed_loading_unloading_guard_parent_scope_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'A proposed trigger function already exists; inspect its definition and migration history before proceeding';
  END IF;

  FOREACH v_column IN ARRAY ARRAY[
    'trip_id', 'trip_stop_id', 'loading_report_id',
    'unloading_report_id', 'backload_id', 'offload_id'
  ] LOOP
    SELECT c.udt_name INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'report_receipts'
      AND c.column_name = v_column;
    IF v_type IS DISTINCT FROM 'uuid' THEN
      RAISE EXCEPTION 'public.report_receipts.% must exist and be uuid (found %); compare the live schema before adapting this draft', v_column, COALESCE(v_type, 'missing');
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loading_reports'
      AND column_name = 'trip_id' AND is_nullable <> 'NO'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unloading_reports'
      AND column_name IN ('trip_id', 'trip_stop_id') AND is_nullable <> 'NO'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report_receipts'
      AND column_name = 'trip_id' AND is_nullable <> 'NO'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('backloads', 'offloads')
      AND column_name = 'trip_id' AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'Required report trip/stop key columns are nullable; review and tighten the live schema separately before applying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.unloading_reports
    WHERE trip_stop_id IS NULL
  ) THEN
    RAISE EXCEPTION 'unloading_reports has a null trip_stop_id; resolve by reviewed data plan before enforcing one report per stop';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.unloading_reports
    GROUP BY trip_stop_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'unloading_reports has multiple rows for a stop; resolve by reviewed data plan before enforcing uniqueness';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.unloading_reports AS ur
    LEFT JOIN public.trip_stops AS ts ON ts.id = ur.trip_stop_id
    WHERE ts.id IS NULL OR ts.trip_id IS DISTINCT FROM ur.trip_id
  ) THEN
    RAISE EXCEPTION 'An unloading report has a missing stop or mismatched trip_id; review existing rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.backloads AS b
    LEFT JOIN public.trip_stops AS ts ON ts.id = b.trip_stop_id
    WHERE b.trip_stop_id IS NOT NULL
      AND (ts.id IS NULL OR ts.trip_id IS DISTINCT FROM b.trip_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.offloads AS o
    LEFT JOIN public.trip_stops AS ts ON ts.id = o.trip_stop_id
    WHERE o.trip_stop_id IS NOT NULL
      AND (ts.id IS NULL OR ts.trip_id IS DISTINCT FROM o.trip_id)
  ) THEN
    RAISE EXCEPTION 'A stop-scoped backload/offload has a missing stop or mismatched trip_id; inspect existing rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    WHERE num_nonnulls(
      rr.loading_report_id, rr.unloading_report_id, rr.backload_id, rr.offload_id
    ) <> 1
  ) THEN
    RAISE EXCEPTION 'Each receipt must reference exactly one of the four report parent types; review existing rows';
  END IF;

  -- Refuse inconsistent existing relationships; never select a winner or
  -- rewrite receipt parent/trip/stop values automatically.
  IF EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    LEFT JOIN public.loading_reports AS lr ON lr.id = rr.loading_report_id
    WHERE rr.loading_report_id IS NOT NULL
      AND (lr.id IS NULL OR rr.trip_id IS DISTINCT FROM lr.trip_id)
  ) OR EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    LEFT JOIN public.unloading_reports AS ur ON ur.id = rr.unloading_report_id
    WHERE rr.unloading_report_id IS NOT NULL
      AND (ur.id IS NULL OR rr.trip_id IS DISTINCT FROM ur.trip_id
        OR rr.trip_stop_id IS DISTINCT FROM ur.trip_stop_id)
  ) OR EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    LEFT JOIN public.backloads AS b ON b.id = rr.backload_id
    WHERE rr.backload_id IS NOT NULL
      AND (b.id IS NULL OR rr.trip_id IS DISTINCT FROM b.trip_id
        OR (b.trip_stop_id IS NOT NULL AND rr.trip_stop_id IS DISTINCT FROM b.trip_stop_id))
  ) OR EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    LEFT JOIN public.offloads AS o ON o.id = rr.offload_id
    WHERE rr.offload_id IS NOT NULL
      AND (o.id IS NULL OR rr.trip_id IS DISTINCT FROM o.trip_id
        OR (o.trip_stop_id IS NOT NULL AND rr.trip_stop_id IS DISTINCT FROM o.trip_stop_id))
  ) OR EXISTS (
    SELECT 1 FROM public.report_receipts AS rr
    LEFT JOIN public.trip_stops AS ts ON ts.id = rr.trip_stop_id
    WHERE rr.trip_stop_id IS NOT NULL
      AND (ts.id IS NULL OR rr.trip_id IS DISTINCT FROM ts.trip_id)
  ) THEN
    RAISE EXCEPTION 'Existing receipt parent/trip/stop links are inconsistent; inspect and resolve them separately';
  END IF;
END;
$$;

DO $$
DECLARE
  v_column text;
  v_type text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY[
    'warehouse_arrival_at', 'loading_start_at', 'loading_finished_at'
  ] LOOP
    SELECT c.udt_name INTO v_type
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public' AND c.table_name = 'loading_reports'
      AND c.column_name = v_column;
    IF v_type IS NOT NULL AND v_type IS DISTINCT FROM 'timestamptz' THEN
      RAISE EXCEPTION 'public.loading_reports.% exists with type %; expected timestamptz', v_column, v_type;
    END IF;
    IF v_type IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = 'loading_reports'
        AND c.column_name = v_column
        AND (c.is_nullable <> 'YES' OR c.column_default IS NOT NULL
          OR c.is_generated <> 'NEVER' OR c.is_identity <> 'NO')
    ) THEN
      RAISE EXCEPTION 'public.loading_reports.% exists but is not a nullable, default-free, ordinary timestamptz column; inspect it manually', v_column;
    END IF;
  END LOOP;
END;
$$;

-- The preceding block validates every existing definition before any column
-- is added. Missing columns are added explicitly; incompatible definitions
-- abort instead of being silently accepted by IF NOT EXISTS.
DO $$
DECLARE
  v_column text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY[
    'warehouse_arrival_at', 'loading_start_at', 'loading_finished_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'loading_reports'
        AND column_name = v_column
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.loading_reports ADD COLUMN %I timestamptz',
        v_column
      );
    END IF;
  END LOOP;
END;
$$;

-- Add only exact composite keys needed by the FKs below. An equivalent unique
-- index/constraint already present on the same ordered columns is reused.
DO $$
DECLARE
  v_spec record;
  v_exists boolean;
  v_named_index regclass;
BEGIN
  FOR v_spec IN
    SELECT * FROM (VALUES
      ('trip_stops', ARRAY['id','trip_id']::text[], 'proposed_trip_stops_id_trip_uq'),
      ('loading_reports', ARRAY['id','trip_id']::text[], 'proposed_loading_reports_id_trip_uq'),
      ('unloading_reports', ARRAY['id','trip_stop_id','trip_id']::text[], 'proposed_unloading_reports_identity_uq'),
      ('backloads', ARRAY['id','trip_id']::text[], 'proposed_backloads_id_trip_uq'),
      ('offloads', ARRAY['id','trip_id']::text[], 'proposed_offloads_id_trip_uq'),
      ('unloading_reports', ARRAY['trip_stop_id']::text[], 'proposed_unloading_reports_one_per_stop_uq')
    ) AS s(table_name, key_columns, index_name)
  LOOP
    v_named_index := to_regclass(format('public.%I', v_spec.index_name));
    IF v_named_index IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM pg_index AS ix
      WHERE ix.indexrelid = v_named_index
        AND ix.indrelid = to_regclass(format('public.%I', v_spec.table_name))
        AND ix.indisunique
        AND ix.indisvalid
        AND ix.indpred IS NULL
        AND ix.indexprs IS NULL
        AND ix.indnkeyatts = cardinality(v_spec.key_columns)
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute AS a
            ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
          WHERE k.ord <= ix.indnkeyatts
          ORDER BY k.ord
        ) = v_spec.key_columns
    ) THEN
      RAISE EXCEPTION 'Index name public.% exists but is not the expected valid unique index on public.% (%)',
        v_spec.index_name, v_spec.table_name, array_to_string(v_spec.key_columns, ', ');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_index AS ix
      WHERE ix.indrelid = to_regclass(format('public.%I', v_spec.table_name))
        AND ix.indisunique
        AND ix.indisvalid
        AND ix.indpred IS NULL
        AND ix.indexprs IS NULL
        AND ix.indnkeyatts = cardinality(v_spec.key_columns)
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute AS a
            ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
          WHERE k.ord <= ix.indnkeyatts
          ORDER BY k.ord
        ) = v_spec.key_columns
    ) INTO v_exists;
    IF NOT v_exists THEN
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON public.%I (%s)',
        v_spec.index_name,
        v_spec.table_name,
        (SELECT string_agg(format('%I', column_name), ', ' ORDER BY ord)
         FROM unnest(v_spec.key_columns) WITH ORDINALITY AS cols(column_name, ord))
      );
    END IF;
  END LOOP;
END;
$$;

-- One unloading report per stop and exact trip/stop ownership.
DO $$
BEGIN
  ALTER TABLE public.unloading_reports
    ADD CONSTRAINT proposed_unloading_report_stop_trip_fk
    FOREIGN KEY (trip_stop_id, trip_id)
    REFERENCES public.trip_stops (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.backloads
    ADD CONSTRAINT proposed_backload_stop_trip_fk
    FOREIGN KEY (trip_stop_id, trip_id)
    REFERENCES public.trip_stops (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.offloads
    ADD CONSTRAINT proposed_offload_stop_trip_fk
    FOREIGN KEY (trip_stop_id, trip_id)
    REFERENCES public.trip_stops (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
END;
$$;

-- The receipt parent CHECK selects exactly one parent. Composite FKs enforce
-- parent/trip identity. The stop FK enforces that any supplied stop belongs to
-- the same trip. Unloading requires a stop; a loading or whole-trip backload/
-- offload receipt may omit it.
DO $$
BEGIN
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipts_exactly_one_parent_ck
    CHECK (num_nonnulls(
      loading_report_id, unloading_report_id, backload_id, offload_id
    ) = 1);
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_unloading_receipt_requires_stop_ck
    CHECK (unloading_report_id IS NULL OR trip_stop_id IS NOT NULL);

  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipt_stop_trip_fk
    FOREIGN KEY (trip_stop_id, trip_id)
    REFERENCES public.trip_stops (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipt_loading_trip_fk
    FOREIGN KEY (loading_report_id, trip_id)
    REFERENCES public.loading_reports (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipt_unloading_identity_fk
    FOREIGN KEY (unloading_report_id, trip_stop_id, trip_id)
    REFERENCES public.unloading_reports (id, trip_stop_id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipt_backload_trip_fk
    FOREIGN KEY (backload_id, trip_id)
    REFERENCES public.backloads (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.report_receipts
    ADD CONSTRAINT proposed_receipt_offload_trip_fk
    FOREIGN KEY (offload_id, trip_id)
    REFERENCES public.offloads (id, trip_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
END;
$$;

-- Composite FKs cannot ensure a receipt stop equals the optional stop on a
-- backload/offload parent when that parent's stop is NULL on the receipt side
-- (MATCH SIMPLE). This trigger covers only that conditional rule. Receipt
-- writes and parent updates lock in the same order: parent row, then a shared
-- transaction advisory lock for that parent. Under READ COMMITTED, the
-- subsequent volatile PL/pgSQL SPI query that checks receipts gets a fresh
-- statement snapshot after any advisory-lock wait. Thus a receipt that wins
-- is visible to the later parent guard; if the scope update wins, the receipt
-- waits for the parent row and validates its committed values. Whole-trip
-- rows remain valid.
CREATE FUNCTION public.proposed_loading_unloading_validate_receipt_scope_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id uuid;
  v_parent_trip uuid;
  v_parent_stop uuid;
  v_parent_found boolean;
  v_parent_count bigint;
  v_parent_table text;
BEGIN
  IF NEW.backload_id IS NOT NULL THEN
    v_parent_id := NEW.backload_id;
    v_parent_table := 'backloads';
  ELSIF NEW.offload_id IS NOT NULL THEN
    v_parent_id := NEW.offload_id;
    v_parent_table := 'offloads';
  ELSE
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT trip_id, trip_stop_id FROM public.%I WHERE id = $1 FOR UPDATE',
    v_parent_table
  ) INTO v_parent_trip, v_parent_stop USING v_parent_id;
  GET DIAGNOSTICS v_parent_count = ROW_COUNT;
  v_parent_found := v_parent_count > 0;
  IF NOT v_parent_found THEN
    RAISE EXCEPTION 'The referenced parent report does not exist' USING ERRCODE = '23503';
  END IF;
  -- Keep lock order consistent with the parent UPDATE triggers: row first,
  -- then advisory lock. Hash collisions only serialize unrelated parents.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_parent_table || ':' || v_parent_id::text, 0)
  );
  IF v_parent_trip IS DISTINCT FROM NEW.trip_id THEN
    RAISE EXCEPTION 'Receipt trip_id must match its parent report' USING ERRCODE = '23514';
  END IF;
  IF v_parent_stop IS NOT NULL AND NEW.trip_stop_id IS DISTINCT FROM v_parent_stop THEN
    RAISE EXCEPTION 'Receipt stop must match the stop-scoped backload/offload report' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.proposed_loading_unloading_guard_parent_scope_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_receipts boolean;
BEGIN
  IF NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
     AND to_jsonb(NEW) ->> 'trip_stop_id' IS NOT DISTINCT FROM to_jsonb(OLD) ->> 'trip_stop_id' THEN
    RETURN NEW;
  END IF;
  -- PostgreSQL has already locked this parent row for UPDATE before invoking
  -- the BEFORE trigger. Acquire the same advisory lock as receipt writes only
  -- after that row lock, then perform the receipt check as a separate query.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(TG_TABLE_NAME || ':' || OLD.id::text, 0)
  );
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.report_receipts WHERE %I = $1)',
    TG_ARGV[0]
  ) INTO v_has_receipts USING OLD.id;
  IF v_has_receipts THEN
    RAISE EXCEPTION 'Cannot change a report trip/stop binding while receipts are attached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER proposed_receipt_scope_guard_trg
    BEFORE INSERT OR UPDATE OF backload_id, offload_id, trip_id, trip_stop_id
    ON public.report_receipts
    FOR EACH ROW EXECUTE FUNCTION public.proposed_loading_unloading_validate_receipt_scope_v1();
  CREATE TRIGGER proposed_backload_receipt_parent_guard_trg
    BEFORE UPDATE OF trip_id, trip_stop_id ON public.backloads
    FOR EACH ROW EXECUTE FUNCTION public.proposed_loading_unloading_guard_parent_scope_v1('backload_id');
  CREATE TRIGGER proposed_offload_receipt_parent_guard_trg
    BEFORE UPDATE OF trip_id, trip_stop_id ON public.offloads
    FOR EACH ROW EXECUTE FUNCTION public.proposed_loading_unloading_guard_parent_scope_v1('offload_id');
END;
$$;

-- API-mediated backend access only. Revoke direct browser-role CRUD. Reports
-- support read/create/update; receipts support read/create/delete; audit is
-- readable and append-only (no UPDATE or DELETE privilege).
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL PRIVILEGES ON TABLE
  public.loading_reports, public.unloading_reports,
  public.report_receipts, public.report_audit_logs
FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.report_audit_logs FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.loading_reports, public.unloading_reports
TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.report_receipts TO service_role;
GRANT SELECT, INSERT ON TABLE public.report_audit_logs TO service_role;
-- Invoker-security trigger queries must be able to read their parent scope.
GRANT SELECT ON TABLE public.backloads, public.offloads TO service_role;

-- Grant sequence usage only if an existing serial/identity id requires it.
DO $$
DECLARE
  v_table text;
  v_sequence regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'loading_reports', 'unloading_reports', 'report_receipts', 'report_audit_logs'
  ] LOOP
    v_sequence := pg_get_serial_sequence(format('public.%I', v_table), 'id');
    IF v_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO service_role', v_sequence);
    END IF;
  END LOOP;
END;
$$;

-- Create only when absent. If the bucket already exists, the preflight above
-- aborts for manual review; no existing bucket settings or policies are changed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-receipts', 'report-receipts', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

COMMIT;
