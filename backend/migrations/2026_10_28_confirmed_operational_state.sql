-- Read projections only; historical source rows are not rewritten.
CREATE OR REPLACE FUNCTION public.read_confirmed_operational_state_v1(p_trips uuid[])
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH scope AS (
  SELECT a.id assignment_id,a.trip_id,s.id trip_stop_id,s.stop_sequence
  FROM public.trip_truck_assignments a JOIN public.trip_stops s ON s.trip_id=a.trip_id AND s.archived_at IS NULL
  WHERE a.trip_id=ANY(p_trips) AND a.unassigned_at IS NULL
   AND (a.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops r WHERE r.assignment_id=a.id AND r.trip_stop_id=s.id))
 ), times AS (
  SELECT e.assignment_id,e.trip_stop_id,
   min(e.event_time) FILTER(WHERE event_type='WAREHOUSE_ARRIVAL') warehouse_arrival_at,
   min(e.event_time) FILTER(WHERE event_type='LOADING_STARTED') loading_start_at,
   min(e.event_time) FILTER(WHERE event_type='LOADING_FINISHED') loading_finished_at,
   min(e.event_time) FILTER(WHERE event_type='WAREHOUSE_DEPARTURE') warehouse_departure_time,
   min(e.event_time) FILTER(WHERE event_type IN ('ARRIVED','STORE_ARRIVAL')) arrival_time,
   min(e.event_time) FILTER(WHERE event_type='UNLOADING_STARTED') start_unloading_time,
   min(e.event_time) FILTER(WHERE event_type='UNLOADING_FINISHED') finish_unloading_time,
   min(e.event_time) FILTER(WHERE event_type='STOP_DEPARTURE') departure_time,
   min(e.event_time) FILTER(WHERE event_type='POD_SUBMITTED') pod_submitted_at,
   bool_or(event_type='ASSIGNMENT_COMPLETED') assignment_completed
  FROM public.trip_events e WHERE e.trip_id=ANY(p_trips) AND e.assignment_id IS NOT NULL GROUP BY e.assignment_id,e.trip_stop_id
 ), rows AS (
  SELECT s.*,w.warehouse_arrival_at,w.loading_start_at,w.loading_finished_at,w.warehouse_departure_time,
   t.arrival_time,t.start_unloading_time,t.finish_unloading_time,t.departure_time,t.pod_submitted_at,
   coalesce(w.assignment_completed,false) assignment_completed,
   (SELECT max(i.pod_reviewed_at) FROM public.trip_images i WHERE i.assignment_id=s.assignment_id AND i.trip_stop_id=s.trip_stop_id AND i.kind='receipt' AND i.pod_review_status='APPROVED') pod_received_at,
   EXISTS(SELECT 1 FROM public.trip_events e WHERE e.assignment_id=s.assignment_id) has_events,
   CASE WHEN EXISTS(SELECT 1 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id WHERE ca.assignment_id=s.assignment_id AND li.trip_stop_id=s.trip_stop_id AND nullif(btrim(li.dr_number),'') IS NOT NULL) THEN
    NOT EXISTS(SELECT 1 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id WHERE ca.assignment_id=s.assignment_id AND li.trip_stop_id=s.trip_stop_id AND nullif(btrim(li.dr_number),'') IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.trip_images im WHERE im.assignment_id=s.assignment_id AND im.trip_stop_id=s.trip_stop_id AND im.kind='receipt' AND im.dr_number=li.dr_number AND im.pod_review_status='APPROVED'
    )) ELSE EXISTS(SELECT 1 FROM public.trip_images im WHERE im.assignment_id=s.assignment_id AND im.trip_stop_id=s.trip_stop_id AND im.kind='receipt' AND im.pod_review_status='APPROVED') END pod_approved
  FROM scope s LEFT JOIN times w ON w.assignment_id=s.assignment_id AND w.trip_stop_id IS NULL LEFT JOIN times t ON t.assignment_id=s.assignment_id AND t.trip_stop_id=s.trip_stop_id
 ) SELECT to_jsonb(rows)||jsonb_build_object('delivery_status',CASE
  WHEN departure_time IS NOT NULL AND pod_approved THEN 'COMPLETED'
  WHEN arrival_time IS NOT NULL THEN 'ARRIVED'
  WHEN warehouse_departure_time IS NOT NULL THEN 'IN_TRANSIT'
  WHEN warehouse_arrival_at IS NOT NULL THEN 'AT_DISPATCHER' ELSE 'PLANNED' END,
  'delivery_completed_date',CASE WHEN departure_time IS NOT NULL AND pod_approved THEN greatest(departure_time,pod_received_at) END)
 FROM rows;
$$;
REVOKE ALL ON FUNCTION public.read_confirmed_operational_state_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_confirmed_operational_state_v1(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_confirmed_delivery_state_v1(p_trip uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row record; states jsonb; next_status text; previous_setting text;
BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 previous_setting:=current_setting('alzhen.delivery_event_write',true);
 PERFORM set_config('alzhen.delivery_event_write','on',true);
 SELECT coalesce(jsonb_agg(x),'[]') INTO states FROM public.read_confirmed_operational_state_v1(ARRAY[p_trip]) x;
 FOR row IN SELECT (x->>'trip_stop_id')::uuid sid,
   bool_and((x->>'has_events')::boolean) all_started,
   min(CASE x->>'delivery_status' WHEN 'PLANNED' THEN 0 WHEN 'AT_DISPATCHER' THEN 1 WHEN 'IN_TRANSIT' THEN 2 WHEN 'ARRIVED' THEN 3 ELSE 4 END) stage
   FROM jsonb_array_elements(states) x GROUP BY x->>'trip_stop_id' LOOP
  IF row.all_started THEN
   next_status:=(ARRAY['PLANNED','AT_DISPATCHER','IN_TRANSIT','ARRIVED','COMPLETED'])[row.stage+1];
   UPDATE public.trip_stops SET delivery_status=next_status WHERE id=row.sid AND delivery_status IS DISTINCT FROM next_status;
  END IF;
 END LOOP;
 IF jsonb_array_length(states)>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(states) x WHERE (x->>'has_events')::boolean) THEN
  next_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(states) x WHERE x->>'delivery_status'<>'COMPLETED' OR NOT (x->>'assignment_completed')::boolean) THEN 'COMPLETED' ELSE 'IN_PROGRESS' END;
  UPDATE public.trips SET status=next_status WHERE id=p_trip AND status NOT IN ('CANCELLED','CANCELED') AND status IS DISTINCT FROM next_status;
 END IF;
 PERFORM set_config('alzhen.delivery_event_write',coalesce(previous_setting,''),true);
END $$;
REVOKE ALL ON FUNCTION public.refresh_confirmed_delivery_state_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_confirmed_delivery_state_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirmed_delivery_state_trigger_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='trip_images' THEN
  IF (NEW.pod_review_status,NEW.pod_reviewed_at) IS NOT DISTINCT FROM (OLD.pod_review_status,OLD.pod_reviewed_at) THEN RETURN NEW;END IF;
 END IF;
 PERFORM public.refresh_confirmed_delivery_state_v1(NEW.trip_id);RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS confirmed_delivery_state ON public.trip_events;
CREATE TRIGGER confirmed_delivery_state AFTER INSERT OR UPDATE OF event_time ON public.trip_events FOR EACH ROW EXECUTE FUNCTION public.confirmed_delivery_state_trigger_v1();
DROP TRIGGER IF EXISTS confirmed_pod_delivery_state ON public.trip_images;
CREATE TRIGGER confirmed_pod_delivery_state AFTER UPDATE OF pod_review_status,pod_reviewed_at ON public.trip_images FOR EACH ROW EXECUTE FUNCTION public.confirmed_delivery_state_trigger_v1();

CREATE OR REPLACE FUNCTION public.guard_confirmed_delivery_status_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status AND current_setting('alzhen.delivery_event_write',true) IS DISTINCT FROM 'on' AND EXISTS(SELECT 1 FROM public.trip_events WHERE trip_id=NEW.trip_id AND assignment_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Delivery Status follows confirmed Trucker milestones and approved POD. Correct the authoritative record in Trip Details instead.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_confirmed_delivery_status ON public.trip_stops;
CREATE TRIGGER guard_confirmed_delivery_status BEFORE UPDATE OF delivery_status ON public.trip_stops FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_delivery_status_v1();

-- Extend the established system-option constraint without changing historical values.
ALTER TABLE public.tms_dropdown_options DROP CONSTRAINT IF EXISTS tms_dropdown_options_check;
ALTER TABLE public.tms_dropdown_options ADD CONSTRAINT tms_dropdown_options_check CHECK(
 (field_key='letter_status' AND is_system AND option_value IN ('READY','SENT','CANCELLED'))
 OR (field_key='delivery_status' AND is_system AND option_value IN ('PLANNED','AT_DISPATCHER','IN_TRANSIT','ARRIVED','COMPLETED'))
 OR (field_key<>'letter_status' AND NOT is_system)
);
-- Retain historical options for historical labels; only these five remain selectable.
UPDATE public.tms_dropdown_options SET active=false WHERE field_key='delivery_status' AND option_value NOT IN ('PLANNED','AT_DISPATCHER','IN_TRANSIT','ARRIVED','COMPLETED');
INSERT INTO public.tms_dropdown_options(field_key,option_value,display_label,sort_order,active,is_system)
VALUES ('delivery_status','PLANNED','Planned',0,true,true),('delivery_status','AT_DISPATCHER','At Dispatcher',1,true,true),('delivery_status','IN_TRANSIT','In Transit',2,true,true),('delivery_status','ARRIVED','Arrived',3,true,true),('delivery_status','COMPLETED','Completed',4,true,true)
ON CONFLICT(field_key,lower(option_value)) DO UPDATE SET display_label=excluded.display_label,sort_order=excluded.sort_order,active=true,is_system=true;
