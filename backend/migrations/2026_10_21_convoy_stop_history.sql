BEGIN;
SET LOCAL lock_timeout='3s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.set_trip_assignment_stops_v1(uuid,uuid,uuid,text,uuid[],bigint)'::regprocedure),chr(13),''))<>'c3f33a7c75e65321be292df0ead10bbb' THEN RAISE EXCEPTION 'Stop responsibility function changed; review required';END IF;END$$;
CREATE OR REPLACE FUNCTION public.set_trip_assignment_stops_v1(p_actor uuid,p_trip uuid,p_assignment uuid,p_scope text,p_stop_ids uuid[],p_expected bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE assignment public.trip_truck_assignments%ROWTYPE; before_stops jsonb; before_assignment jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('ALL','SELECTED') OR p_stop_ids IS NULL OR cardinality(p_stop_ids)>200 OR array_position(p_stop_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid stop scope' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT * INTO assignment FROM public.trip_truck_assignments WHERE id=p_assignment AND trip_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE='P0002'; END IF;
 before_assignment=to_jsonb(assignment);
 IF assignment.collaboration_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Assignment changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_stop_ids)s WHERE NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=s AND trip_id=p_trip)) THEN RAISE EXCEPTION 'Stop belongs to another trip' USING ERRCODE='23514'; END IF;
 IF p_scope='SELECTED' AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id WHERE ca.assignment_id=p_assignment AND (li.trip_stop_id IS NULL OR NOT li.trip_stop_id=ANY(p_stop_ids))) THEN RAISE EXCEPTION 'Stop scope excludes allocated cargo' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO before_stops FROM public.trip_assignment_stops s WHERE s.assignment_id=p_assignment;
 IF EXISTS(SELECT 1 FROM public.trip_assignment_stops WHERE assignment_id=p_assignment AND progress<>'PENDING' AND NOT trip_stop_id=ANY(p_stop_ids)) THEN RAISE EXCEPTION 'Keep truck stops that have recorded delivery progress' USING ERRCODE='23514';END IF;
 DELETE FROM public.trip_assignment_stops WHERE assignment_id=p_assignment AND NOT trip_stop_id=ANY(p_stop_ids);
 INSERT INTO public.trip_assignment_stops(trip_id,assignment_id,trip_stop_id) SELECT p_trip,p_assignment,s FROM (SELECT DISTINCT unnest(p_stop_ids)s)u ON CONFLICT(assignment_id,trip_stop_id) DO NOTHING;
 UPDATE public.trip_truck_assignments SET stop_scope=p_scope WHERE id=p_assignment RETURNING * INTO assignment;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'UPDATE','trip_assignment_stops',p_assignment,jsonb_build_object('assignment',before_assignment,'responsibilities',before_stops),jsonb_build_object('trip_id',p_trip,'scope',p_scope,'stop_ids',p_stop_ids));RETURN to_jsonb(assignment);
END $$;
CREATE FUNCTION public.guard_assignment_stop_history_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.trips WHERE id=OLD.trip_id) AND EXISTS(SELECT 1 FROM public.trip_assignment_stops WHERE assignment_id=OLD.id) THEN
  RAISE EXCEPTION 'End this assignment to preserve truck-stop history; hard deletion is not permitted' USING ERRCODE='55000';
 END IF;RETURN OLD;
END$$;
CREATE TRIGGER convoy_stop_history_guard BEFORE DELETE ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_stop_history_v1();
REVOKE ALL ON FUNCTION public.guard_assignment_stop_history_v1() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
