-- Crew membership is owned by a truck assignment but has a restrictive FK.
-- Preserve both active and historical membership in the deletion journal, then
-- remove only memberships of assignments belonging to the deleted trip.
DO $migration$
DECLARE definition text; old_fragment text; new_fragment text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure)
     <> '9bd67f85ccf7c7d357d248cfc13778b4' THEN
    RAISE EXCEPTION 'Transaction deletion function changed; review required';
  END IF;
  definition:=pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure);

  old_fragment:=$old$public.trip_truck_assignments,public.trip_events,public.store_calls,$old$;
  new_fragment:=$new$public.trip_truck_assignments,public.trip_truck_crew_members,public.trip_events,public.store_calls,$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Crew lock point changed'; END IF;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$    v_snapshot:=v_snapshot||jsonb_build_object('assignments',v_rows);$old$;
  new_fragment:=$new$    v_snapshot:=v_snapshot||jsonb_build_object('assignments',v_rows);
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') INTO v_rows
      FROM public.trip_truck_crew_members c
      JOIN public.trip_truck_assignments a ON a.id=c.assignment_id
      WHERE a.trip_id=p_trip_id;
    v_snapshot:=v_snapshot||jsonb_build_object('trip_truck_crew_members',v_rows);$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Crew journal point changed'; END IF;
  definition:=replace(definition,old_fragment,new_fragment);

  old_fragment:=$old$    DELETE FROM public.driver_trip_updates WHERE trip_id=p_trip_id;
    DELETE FROM public.trips WHERE id=p_trip_id;$old$;
  new_fragment:=$new$    DELETE FROM public.driver_trip_updates WHERE trip_id=p_trip_id;
    DELETE FROM public.trip_truck_crew_members c USING public.trip_truck_assignments a
      WHERE c.assignment_id=a.id AND a.trip_id=p_trip_id;
    DELETE FROM public.trips WHERE id=p_trip_id;$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Crew deletion point changed'; END IF;
  definition:=replace(definition,old_fragment,new_fragment);
  EXECUTE definition;
  IF has_function_privilege('anon','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected deletion RPC privileges';
  END IF;

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.preview_whole_trip_deletion_v1(uuid[],uuid)'::regprocedure)
     <> '439640f55fae5314576f4f78472c1cda' THEN
    RAISE EXCEPTION 'Whole-trip preview function changed; review required';
  END IF;
  definition:=replace(pg_get_functiondef('public.preview_whole_trip_deletion_v1(uuid[],uuid)'::regprocedure),E'\r\n',E'\n');
  old_fragment:=$old$ SELECT count(*) INTO n FROM public.offload_items i JOIN public.offloads r ON r.id=i.offload_id WHERE r.trip_id=ANY(p_trip_ids);$old$;
  new_fragment:=$new$ SELECT count(*) INTO n FROM public.trip_truck_crew_members c
   JOIN public.trip_truck_assignments a ON a.id=c.assignment_id
   WHERE a.trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('trip_truck_crew_members',n);

 SELECT count(*) INTO n FROM public.offload_items i JOIN public.offloads r ON r.id=i.offload_id WHERE r.trip_id=ANY(p_trip_ids);$new$;
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Crew impact count point changed'; END IF;
  definition:=replace(definition,old_fragment,new_fragment);
  EXECUTE definition;
  IF has_function_privilege('anon','public.preview_whole_trip_deletion_v1(uuid[],uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.preview_whole_trip_deletion_v1(uuid[],uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.preview_whole_trip_deletion_v1(uuid[],uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected preview RPC privileges';
  END IF;
END $migration$;
