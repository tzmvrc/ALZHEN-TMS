-- SECURITY DEFINER functions resolve SET CONSTRAINTS names through the schema.
-- Use the verified schema-qualified FK name; keep all checks and delete order.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE definition text;
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),chr(13),''))
      <> 'e3a10d7d8f63506b47b25bb0a8052454' THEN
    RAISE EXCEPTION 'Whole-trip deletion changed; review the constraint reference.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.trip_images'::regclass
      AND conname='trip_images_delivery_event_id_fkey'
      AND condeferrable AND NOT condeferred
  ) THEN
    RAISE EXCEPTION 'Expected immediate deferrable image/event FK was not found.';
  END IF;
  definition:=replace(pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),E'\r\n',E'\n');
  IF position('SET CONSTRAINTS trip_images_delivery_event_id_fkey DEFERRED' in definition)=0
    OR position('SET CONSTRAINTS trip_images_delivery_event_id_fkey IMMEDIATE' in definition)=0 THEN
    RAISE EXCEPTION 'Expected constraint statements were not found.';
  END IF;
  definition:=replace(definition,'SET CONSTRAINTS trip_images_delivery_event_id_fkey DEFERRED',
    'SET CONSTRAINTS public.trip_images_delivery_event_id_fkey DEFERRED');
  definition:=replace(definition,'SET CONSTRAINTS trip_images_delivery_event_id_fkey IMMEDIATE',
    'SET CONSTRAINTS public.trip_images_delivery_event_id_fkey IMMEDIATE');
  EXECUTE definition;
END $migration$;

COMMIT;
