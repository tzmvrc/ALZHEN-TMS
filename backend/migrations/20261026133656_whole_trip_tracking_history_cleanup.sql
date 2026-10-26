-- GPS history has a restrictive assignment FK. Preserve it in the private
-- deletion audit before removing the trip's assignments.
DO $migration$
DECLARE
  definition text;
  old_fragment text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure)
     <> 'eeb93010008af0c7ce51c485b99d6f9c' THEN
    RAISE EXCEPTION 'Whole-trip deletion function changed; review required';
  END IF;
  definition:=pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure);
  old_fragment:='    ''assignment_stops'',(SELECT coalesce(jsonb_agg(to_jsonb(a)),''[]'') FROM public.trip_assignment_stops a WHERE a.trip_id=trip),';
  IF position(old_fragment IN definition)=0 THEN
    RAISE EXCEPTION 'Assignment snapshot not found';
  END IF;
  definition:=replace(definition,old_fragment,
    old_fragment||E'\n'||
    '    ''tracking_history'',(SELECT coalesce(jsonb_agg(to_jsonb(h)),''[]'')
      FROM public.trip_tracking_history h
      JOIN public.trip_truck_assignments a ON a.id=h.assignment_id
      WHERE a.trip_id=trip),');
  old_fragment:='  DELETE FROM public.trip_assignment_stops WHERE trip_id=trip;';
  IF position(old_fragment IN definition)=0 THEN
    RAISE EXCEPTION 'Assignment cleanup point not found';
  END IF;
  definition:=replace(definition,old_fragment,
    '  DELETE FROM public.trip_tracking_history h USING public.trip_truck_assignments a
    WHERE h.assignment_id=a.id AND a.trip_id=trip;
'||old_fragment);
  EXECUTE definition;
END $migration$;
