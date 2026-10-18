-- Disposable PostgreSQL ONLY: exact 20-parent boundary and read-only preview.
BEGIN;
SELECT fixture_trip(n,0) FROM generate_series(700,720)n;
DO $$ DECLARE ids uuid[]; r jsonb; jobs bigint; trips bigint; updates bigint; BEGIN
 SELECT array_agg(fixture_id(n) ORDER BY n) INTO ids FROM generate_series(700,719)n;
 SELECT count(*) INTO jobs FROM transaction_deletion_jobs;
 SELECT count(*) INTO trips FROM public.trips;
 SELECT count(*) INTO updates FROM driver_trip_updates;
 r:=preview_whole_trip_deletion_v1(ids,fixture_id(1));
 IF jsonb_array_length(r->'trips')<>20 OR (r->'counts'->>'driver_trip_updates')::int<>20 THEN RAISE EXCEPTION '20-parent preview mismatch'; END IF;
 IF (SELECT count(*) FROM transaction_deletion_jobs)<>jobs OR (SELECT count(*) FROM public.trips)<>trips OR (SELECT count(*) FROM driver_trip_updates)<>updates THEN RAISE EXCEPTION 'Preview mutated data'; END IF;
 RAISE NOTICE 'PASS: exact 20-parent preview creates no journal and changes no modeled parents/history';
 BEGIN PERFORM delete_whole_trips_v1(array_append(ids,fixture_id(720)),fixture_id(1));RAISE EXCEPTION '21-parent delete accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF (SELECT count(*) FROM public.trips)<>trips OR (SELECT count(*) FROM transaction_deletion_jobs)<>jobs THEN RAISE EXCEPTION 'Over-limit delete partially applied'; END IF;
 RAISE NOTICE 'PASS: 21-parent batch rejected atomically, never truncated';
 r:=delete_whole_trips_v1(ids,fixture_id(1));
 IF jsonb_array_length(r)<>20 OR EXISTS(SELECT FROM public.trips WHERE id=ANY(ids)) OR NOT EXISTS(SELECT FROM public.trips WHERE id=fixture_id(720)) THEN RAISE EXCEPTION 'Exact 20-parent deletion failed or changed unrelated parent'; END IF;
 RAISE NOTICE 'PASS: exact 20-parent atomic deletion, unrelated parent preserved';
END $$;
ROLLBACK;
