-- Task-approved non-destructive update of exactly 28 owned static demo GPS events.
-- Reuses actual cached Mapbox road vertices for each physical truck's own assigned stops.
-- Does not alter timestamps, real telemetry, consent, tracking sessions or route-cache data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $align$
DECLARE changed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_DEMO30_V1'));
 WITH scopes AS (
  SELECT a.id,a.trip_id,c.planned_geometry,
   (SELECT s.id FROM public.trip_assignment_stops r JOIN public.trip_stops s ON s.id=r.trip_stop_id WHERE r.assignment_id=a.id AND r.progress='COMPLETED' ORDER BY s.stop_sequence DESC LIMIT 1) last_done,
   (SELECT s.id FROM public.trip_assignment_stops r JOIN public.trip_stops s ON s.id=r.trip_stop_id WHERE r.assignment_id=a.id AND r.progress<>'COMPLETED' ORDER BY s.stop_sequence LIMIT 1) next_stop,
   EXISTS(SELECT 1 FROM public.trip_assignment_stops r WHERE r.assignment_id=a.id AND r.progress='IN_PROGRESS') at_stop
  FROM public.trip_truck_assignments a JOIN public.trips t ON t.id=a.trip_id JOIN public.trip_route_cache c ON c.assignment_id=a.id
  WHERE a.id::text LIKE 'e6301024-%' AND t.remarks LIKE '%[ALZHEN_DEMO30_V1]%' AND t.status='IN_PROGRESS' AND c.planned_geometry->>'type'='LineString'
 ), indices AS (
  SELECT sc.*,
   coalesce((SELECT point.ordinality FROM public.trip_stops s JOIN public.customer_stores st ON st.id=s.store_id CROSS JOIN LATERAL jsonb_array_elements(sc.planned_geometry->'coordinates') WITH ORDINALITY point(coords,ordinality) WHERE s.id=sc.last_done ORDER BY power((point.coords->>0)::float8-st.longitude::float8,2)+power((point.coords->>1)::float8-st.latitude::float8,2),point.ordinality LIMIT 1),1) first_index,
   (SELECT point.ordinality FROM public.trip_stops s JOIN public.customer_stores st ON st.id=s.store_id CROSS JOIN LATERAL jsonb_array_elements(sc.planned_geometry->'coordinates') WITH ORDINALITY point(coords,ordinality) WHERE s.id=coalesce(sc.next_stop,sc.last_done) ORDER BY power((point.coords->>0)::float8-st.longitude::float8,2)+power((point.coords->>1)::float8-st.latitude::float8,2),point.ordinality LIMIT 1) last_index
  FROM scopes sc
 ), fixes AS (
  SELECT id,trip_id,planned_geometry->'coordinates'->(greatest(1,CASE WHEN at_stop OR next_stop IS NULL THEN last_index ELSE floor(first_index+greatest(0,last_index-first_index)*0.4)::bigint END)-1)::integer AS point FROM indices WHERE last_index IS NOT NULL
 )
 UPDATE public.trip_events e SET latitude=(fixes.point->>1)::numeric,longitude=(fixes.point->>0)::numeric
 FROM fixes WHERE e.trip_id=fixes.trip_id AND e.id::text LIKE 'e6301024-%' AND e.event_type='DEMO_SIMULATED_GPS'
 AND e.notes LIKE '%[ALZHEN_DEMO30_V1]%' AND position('[assignment:'||fixes.id::text||']' in e.notes)>0;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>28 THEN RAISE EXCEPTION 'Expected exactly 28 owned GPS events, got %; all changes rolled back',changed; END IF;
END;
$align$;
COMMIT;
