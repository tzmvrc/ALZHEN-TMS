-- Delivery quantities reference cargo allocations. Journal and remove them
-- before the whole-trip routine removes its presentation allocations.
DO $migration$
DECLARE
  definition text;
  old_fragment text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure)
     <> 'c7fc1d7d96501281fb73081149533afb' THEN
    RAISE EXCEPTION 'Whole-trip deletion function changed; review required';
  END IF;
  definition:=pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure);
  old_fragment:='    ''cargo_allocations'',(SELECT coalesce(jsonb_agg(to_jsonb(a)),''[]'') FROM public.trip_cargo_allocations a WHERE a.trip_id=trip),';
  IF position(old_fragment IN definition)=0 THEN
    RAISE EXCEPTION 'Cargo allocation snapshot not found';
  END IF;
  definition:=replace(definition,old_fragment,
    old_fragment||E'\n'||
    '    ''delivery_quantities'',(SELECT coalesce(jsonb_agg(to_jsonb(q)),''[]'')
      FROM public.trip_delivery_quantities q
      JOIN public.trip_cargo_allocations a ON a.id=q.allocation_id
      WHERE a.trip_id=trip),');

  old_fragment:='  DELETE FROM public.trip_cargo_allocations WHERE trip_id=trip;';
  IF position(old_fragment IN definition)=0 THEN
    RAISE EXCEPTION 'Cargo allocation deletion point not found';
  END IF;
  definition:=replace(definition,old_fragment,
    '  IF EXISTS (
    SELECT 1 FROM public.trip_delivery_quantities q
    JOIN public.trip_cargo_allocations a ON a.id=q.allocation_id
    JOIN public.trip_events e ON e.id=q.event_id
    WHERE a.trip_id=trip AND e.trip_id IS DISTINCT FROM trip
  ) THEN
    RAISE EXCEPTION ''Delivery quantities cross trip ownership; review required.'' USING ERRCODE=''55000'';
  END IF;
  DELETE FROM public.trip_delivery_quantities q USING public.trip_cargo_allocations a
    WHERE q.allocation_id=a.id AND a.trip_id=trip;
'||old_fragment);
  EXECUTE definition;
END $migration$;
