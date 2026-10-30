-- Stop deletion must journal and remove its POD images before deleting the stop.
-- Otherwise the stop FK sets trip_images.trip_stop_id to NULL and the POD cargo
-- guard rejects the update after whole-trip cargo allocations were removed.
-- The existing Storage ownership checks, immutable manifest and evidence guard
-- remain in force for every image.
DO $migration$
DECLARE
  definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure)
     <> '53c290f6aa5e98f00f172776cc5bbada' THEN
    RAISE EXCEPTION 'Transaction deletion function changed; review required';
  END IF;
  definition := pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure);

  old_fragment := $old$  IF v_last THEN
    FOR v_image IN SELECT * FROM public.trip_images WHERE trip_id=p_trip_id LOOP$old$;
  new_fragment := $new$  IF p_stop_id IS NOT NULL AND EXISTS (
    SELECT FROM public.trip_images i
    LEFT JOIN public.pod_records p ON p.id=i.pod_record_id
    WHERE i.trip_stop_id=p_stop_id
      AND (i.trip_id IS DISTINCT FROM p_trip_id
        OR (i.pod_record_id IS NOT NULL AND (p.trip_id IS DISTINCT FROM p_trip_id OR p.trip_stop_id IS DISTINCT FROM p_stop_id)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Stop POD image ownership requires review.';
  END IF;
  IF v_last OR p_stop_id IS NOT NULL THEN
    FOR v_image IN SELECT * FROM public.trip_images WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id) LOOP$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Image ownership loop changed'; END IF;
  definition := replace(definition,old_fragment,new_fragment);

  old_fragment := $old$AND (i.trip_id<>p_trip_id OR NOT v_last))$old$;
  new_fragment := $new$AND (i.trip_id<>p_trip_id OR NOT(v_last OR i.trip_stop_id=p_stop_id)))$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Image retention check changed'; END IF;
  definition := replace(definition,old_fragment,new_fragment);

  old_fragment := $old$    v_snapshot:=v_snapshot||jsonb_build_object('loading_reports',v_rows);
  END IF;
  IF v_last THEN
    SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)$old$;
  new_fragment := $new$    v_snapshot:=v_snapshot||jsonb_build_object('loading_reports',v_rows);
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows
      FROM public.trip_images t WHERE t.trip_id=p_trip_id AND t.trip_stop_id=p_stop_id;
    v_snapshot:=v_snapshot||jsonb_build_object('trip_images',v_rows);
  END IF;
  IF v_last THEN
    SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Image journal snapshot changed'; END IF;
  definition := replace(definition,old_fragment,new_fragment);

  old_fragment := $old$  -- Earlier stops keep their image relations exactly as before.
  IF v_last THEN
    PERFORM set_config('alzhen.trip_image_deletion_job',v_job.id::text,true);
    DELETE FROM public.trip_images WHERE trip_id=p_trip_id;
    PERFORM set_config('alzhen.trip_image_deletion_job','',true);
  END IF;$old$;
  new_fragment := $new$  -- Remove only this stop's verified images; a final stop also removes trip-wide images.
  IF v_last OR p_stop_id IS NOT NULL THEN
    PERFORM set_config('alzhen.trip_image_deletion_job',v_job.id::text,true);
    DELETE FROM public.trip_images WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);
    PERFORM set_config('alzhen.trip_image_deletion_job','',true);
  END IF;$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Image deletion point changed'; END IF;
  definition := replace(definition,old_fragment,new_fragment);

  EXECUTE definition;
  IF has_function_privilege('anon','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected deletion RPC privileges';
  END IF;
END $migration$;
