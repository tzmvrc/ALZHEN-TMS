-- Custom activity must not activate delivery progress. Keep historical rows intact.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.read_confirmed_operational_state_v1(uuid[])'::regprocedure) INTO definition;
 definition:=replace(definition,
  'EXISTS(SELECT 1 FROM public.trip_events e WHERE e.assignment_id=s.assignment_id) has_events',
  'EXISTS(SELECT 1 FROM public.trip_events e WHERE e.assignment_id=s.assignment_id AND e.event_type IN (''WAREHOUSE_ARRIVAL'',''LOADING_STARTED'',''LOADING_FINISHED'',''WAREHOUSE_DEPARTURE'',''ARRIVED'',''STORE_ARRIVAL'',''UNLOADING_STARTED'',''UNLOADING_FINISHED'',''STOP_DEPARTURE'',''ASSIGNMENT_COMPLETED'')) has_events');
 EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.guard_confirmed_delivery_status_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status OR current_setting('alzhen.delivery_event_write',true)='on' THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM public.trip_events WHERE trip_id=NEW.trip_id AND assignment_id IS NOT NULL AND event_type IN ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED','STORE_ARRIVAL','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED')) THEN
  RAISE EXCEPTION 'Delivery Status follows confirmed Trucker milestones and approved POD. Correct the authoritative record in Trip Details instead.' USING ERRCODE='23514';
 END IF;
 IF NEW.delivery_status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM public.pod_records WHERE trip_stop_id=NEW.id AND pod_status='RECEIVED' AND pod_received_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.trip_images WHERE trip_stop_id=NEW.id AND kind='receipt' AND pod_review_status='APPROVED') THEN
  RAISE EXCEPTION 'POD must be approved or received before marking delivery Completed.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
