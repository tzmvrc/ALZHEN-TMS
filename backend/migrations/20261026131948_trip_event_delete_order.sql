-- A trip event can reference an offload or backload with a RESTRICT foreign key.
-- Keep all existing ownership, attachment and journal checks; delete the event
-- after its snapshot is captured and before either referenced report is removed.
-- This migration changes only the reviewed RPC definition. It deletes no data.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE
  definition text;
  old_order constant text := E'  DELETE FROM public.report_receipts WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);\n  DELETE FROM public.offloads WHERE id=ANY(v_offloads);';
  old_loop constant text := '  FOREACH v_table IN ARRAY ARRAY[''incidents'',''demurrages'',''pod_records'',''documents'',''store_calls'',''trip_events'',''trip_line_items''] LOOP';
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure), chr(13), ''))
      <> '5f452f59466b4169975c068e141dd80d' THEN
    RAISE EXCEPTION 'The transaction deletion function changed; review its delete order before applying this fix.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='trip_events_offload_id_fkey'
      AND conrelid='public.trip_events'::regclass
      AND confrelid='public.offloads'::regclass
      AND contype='f'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='trip_events_backload_id_fkey'
      AND conrelid='public.trip_events'::regclass
      AND confrelid='public.backloads'::regclass
      AND contype='f'
  ) THEN
    RAISE EXCEPTION 'The report/event foreign keys changed; review the delete order.';
  END IF;

  definition := replace(pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure), E'\r\n', E'\n');
  IF position(old_order in definition)=0 OR position(old_loop in definition)=0 THEN
    RAISE EXCEPTION 'The expected delete statements were not found; review the function.';
  END IF;
  definition := replace(definition, old_order,
    E'  DELETE FROM public.report_receipts WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);\n  -- Events reference offloads and backloads with RESTRICT FKs. The immutable\n  -- snapshot above already captured them; remove only this transaction''s events.\n  DELETE FROM public.trip_events WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);\n  DELETE FROM public.offloads WHERE id=ANY(v_offloads);');
  definition := replace(definition, old_loop,
    '  FOREACH v_table IN ARRAY ARRAY[''incidents'',''demurrages'',''pod_records'',''documents'',''store_calls'',''trip_line_items''] LOOP');
  EXECUTE definition;

  IF has_function_privilege('anon','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected deletion function permissions; installation rolled back.';
  END IF;
END $migration$;

COMMIT;
