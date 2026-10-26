-- Whole-trip deletion removes stops one at a time in one atomic RPC. An image
-- can reference an event from an earlier stop; its record and Storage manifest
-- are intentionally captured and removed with the final stop. Defer only this
-- FK for the whole-trip RPC, then check it before acknowledging deletion.
-- Standalone stop deletion continues to check the FK immediately.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $preflight$
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),chr(13),''))
      <> '6a2ea9e47c2405e5499e13857661c464' THEN
    RAISE EXCEPTION 'Whole-trip deletion changed; review image/event handling before installation.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.trip_images'::regclass
      AND confrelid='public.trip_events'::regclass
      AND conname='trip_images_delivery_event_id_fkey'
      AND contype='f' AND NOT condeferrable
  ) THEN
    RAISE EXCEPTION 'Image/event foreign key changed; review before installation.';
  END IF;
END $preflight$;

ALTER TABLE public.trip_images
  ALTER CONSTRAINT trip_images_delivery_event_id_fkey DEFERRABLE INITIALLY IMMEDIATE;

DO $migration$
DECLARE
  definition text;
  before_loop constant text := ' FOR trip IN SELECT DISTINCT id FROM unnest(p_trip_ids) id ORDER BY id LOOP';
  before_ack constant text := E' SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',j.id,''trip_id'',j.trip_id,''trip_stop_id'',j.trip_stop_id,''state'',j.state) ORDER BY j.created_at,j.id),''[]'') INTO jobs';
BEGIN
  definition := replace(pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),E'\r\n',E'\n');
  IF position(before_loop in definition)=0 OR position(before_ack in definition)=0 THEN
    RAISE EXCEPTION 'Expected whole-trip delete statements not found; installation rolled back.';
  END IF;
  definition := replace(definition,before_loop,
    E' -- Earlier-stop events may be referenced by images retained until the final\n -- stop captures their immutable Storage manifest. No FK is disabled.\n SET CONSTRAINTS trip_images_delivery_event_id_fkey DEFERRED;\n\n FOR trip IN SELECT DISTINCT id FROM unnest(p_trip_ids) id ORDER BY id LOOP');
  definition := replace(definition,before_ack,
    E' -- Force the image/event FK check before returning a committed acknowledgement.\n SET CONSTRAINTS trip_images_delivery_event_id_fkey IMMEDIATE;\n\n SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',j.id,''trip_id'',j.trip_id,''trip_stop_id'',j.trip_stop_id,''state'',j.state) ORDER BY j.created_at,j.id),''[]'') INTO jobs');
  EXECUTE definition;
  IF has_function_privilege('anon','public.delete_whole_trips_v1(uuid[],uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.delete_whole_trips_v1(uuid[],uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.delete_whole_trips_v1(uuid[],uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected whole-trip deletion permissions; installation rolled back.';
  END IF;
END $migration$;

COMMIT;
