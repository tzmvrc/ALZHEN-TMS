-- Allow saved delivery evidence to leave only through the reviewed, journaled
-- whole-trip deletion path. Ordinary image edits and deletes remain protected.
DO $migration$
DECLARE
  definition text;
  old_fragment text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure)
     <> 'c37e4e41a26648b55ff80361de069612' THEN
    RAISE EXCEPTION 'Trip deletion function changed; review required';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delivery_evidence_guard_v1()'::regprocedure)
     <> '1c4b7d8991a191869816fbf3fdbe9496' THEN
    RAISE EXCEPTION 'Delivery evidence guard changed; review required';
  END IF;

  definition := pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure);
  old_fragment := '  INSERT INTO public.transaction_deletion_jobs(';
  IF position(old_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'Deletion journal insertion not found';
  END IF;
  definition := replace(definition, old_fragment,
    '  SELECT coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) INTO v_rows
     FROM public.trip_delivery_quantities q
     JOIN public.trip_events e ON e.id=q.event_id
     WHERE e.trip_id=p_trip_id AND (v_last OR e.trip_stop_id=p_stop_id);
  v_snapshot:=v_snapshot||jsonb_build_object(''trip_delivery_quantities'',v_rows);
' || old_fragment);

  old_fragment := '  IF v_last THEN DELETE FROM public.trip_images WHERE trip_id=p_trip_id; END IF;';
  IF position(old_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'Trip image deletion point not found';
  END IF;
  definition := replace(definition, old_fragment,
    '  IF v_last THEN
    PERFORM set_config(''alzhen.trip_image_deletion_job'',v_job.id::text,true);
    DELETE FROM public.trip_images WHERE trip_id=p_trip_id;
    PERFORM set_config(''alzhen.trip_image_deletion_job'','''',true);
  END IF;');

  old_fragment := '  DELETE FROM public.trip_events WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);';
  IF position(old_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'Trip event deletion point not found';
  END IF;
  definition := replace(definition, old_fragment,
    '  DELETE FROM public.trip_delivery_quantities q USING public.trip_events e
    WHERE q.event_id=e.id AND e.trip_id=p_trip_id AND (v_last OR e.trip_stop_id=p_stop_id);
' || old_fragment);
  EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.delivery_evidence_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $guard$
BEGIN
  IF OLD.delivery_event_id IS NOT NULL THEN
    IF TG_OP='DELETE' THEN
      -- The job and its immutable snapshot are created inside the same
      -- privileged transaction, after exact Storage ownership was checked.
      IF EXISTS (
        SELECT 1
        FROM public.transaction_deletion_jobs j
        CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) manifest
        JOIN storage.objects object
          ON object.bucket_id=manifest->>'bucket' AND object.name=manifest->>'path'
        WHERE j.id=nullif(current_setting('alzhen.trip_image_deletion_job',true),'')::uuid
          AND j.trip_id=OLD.trip_id
          AND j.state='PENDING_STORAGE'
          AND j.snapshot->'trip_images' @> jsonb_build_array(jsonb_build_object('id',OLD.id))
          AND manifest->>'bucket'='trip-images'
          AND manifest->>'path'=OLD.storage_path
          AND manifest->>'object_id'=object.id::text
          AND manifest->>'metadata_fingerprint'=md5(coalesce(object.metadata::text,''))
          AND manifest->>'object_version' IS NOT DISTINCT FROM to_jsonb(object)->>'version'
      ) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Saved delivery evidence must be retained with its event.' USING ERRCODE='23514';
    END IF;
    IF NEW.delivery_event_id IS DISTINCT FROM OLD.delivery_event_id
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 THEN
      RAISE EXCEPTION 'Saved delivery evidence must be retained with its event.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$guard$;
