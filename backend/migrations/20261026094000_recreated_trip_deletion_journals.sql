-- Trips restored with their original UUIDs can coexist with a COMPLETE deletion
-- journal. Keep the old audit record and create a new journal for the new delete.
-- PENDING_STORAGE journals still block a new delete of the same live identity.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.transaction_deletion_jobs
  DROP CONSTRAINT IF EXISTS transaction_deletion_jobs_transaction_id_key;
CREATE INDEX IF NOT EXISTS transaction_deletion_jobs_identity_latest_idx
  ON public.transaction_deletion_jobs (transaction_id, revision DESC);

DO $migration$
DECLARE
  definition text;
  previous text;
BEGIN
  definition := replace(pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure), E'\r\n', E'\n');
  previous := definition;
  definition := replace(definition,
    'SELECT * INTO v_job FROM public.transaction_deletion_jobs WHERE transaction_id=coalesce(p_stop_id,p_trip_id);',
    'SELECT * INTO v_job FROM public.transaction_deletion_jobs WHERE transaction_id=coalesce(p_stop_id,p_trip_id) ORDER BY revision DESC LIMIT 1;');
  IF definition = previous THEN RAISE EXCEPTION 'Unexpected transaction deletion function: journal lookup'; END IF;
  previous := definition;
  definition := replace(definition,
    E'    RETURN to_jsonb(v_job);\n  END IF;\n  SELECT to_jsonb(t)',
    E'    IF (p_stop_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.trips WHERE id=p_trip_id))\n       OR (p_stop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=p_stop_id AND trip_id=p_trip_id)) THEN\n      RETURN to_jsonb(v_job);\n    END IF;\n    IF v_job.state <> ''COMPLETE'' THEN\n      RAISE EXCEPTION USING ERRCODE=''55000'',MESSAGE=''Previous deletion cleanup is pending for this live transaction.'';\n    END IF;\n    -- A COMPLETE journal and a live row mean the original identity was restored.\n    -- Preserve that journal and record a new attempt below.\n  END IF;\n  SELECT to_jsonb(t)');
  IF definition = previous THEN RAISE EXCEPTION 'Unexpected transaction deletion function: journal reuse'; END IF;
  EXECUTE definition;

  definition := replace(pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure), E'\r\n', E'\n');
  previous := definition;
  definition := replace(definition,
    'FROM public.transaction_deletion_jobs j WHERE j.trip_id=ANY(p_trip_ids);',
    'FROM (SELECT DISTINCT ON (trip_id,trip_stop_id) * FROM public.transaction_deletion_jobs WHERE trip_id=ANY(p_trip_ids) ORDER BY trip_id,trip_stop_id,revision DESC) j;');
  IF definition = previous THEN RAISE EXCEPTION 'Unexpected whole-trip deletion function: journal acknowledgement'; END IF;
  EXECUTE definition;
END $migration$;

COMMIT;
