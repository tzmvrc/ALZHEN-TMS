-- Claim/release an existing trip/truck assignment without replacing its Driver.
CREATE OR REPLACE FUNCTION public.select_driver_assignment_v1(p_actor uuid,p_profile uuid,p_assignment uuid,p_add boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.trip_truck_assignments%ROWTYPE;d public.drivers%ROWTYPE; trip uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL AND locked_at IS NULL) THEN RAISE EXCEPTION 'Management access required.' USING ERRCODE='42501';END IF;
 IF p_add IS NULL THEN RAISE EXCEPTION 'Choose an assignment action.' USING ERRCODE='22023';END IF;
 SELECT trip_id INTO trip FROM public.trip_truck_assignments WHERE id=p_assignment;
 PERFORM 1 FROM public.trips WHERE id=trip AND archived_at IS NULL AND status NOT IN ('CANCELLED','COMPLETED','DELIVERED','CLOSED') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active trip required.' USING ERRCODE='23514';END IF;
 SELECT * INTO a FROM public.trip_truck_assignments WHERE id=p_assignment AND unassigned_at IS NULL FOR UPDATE;
 IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.trucks WHERE id=a.truck_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Active truck assignment required.' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_profile AND role='TRUCKER' AND crew_role='DRIVER' AND deactivated_at IS NULL AND locked_at IS NULL) THEN RAISE EXCEPTION 'Active Driver required.' USING ERRCODE='23514';END IF;
 SELECT * INTO d FROM public.drivers WHERE profile_id=p_profile AND status='ACTIVE';
 IF d.id IS NULL THEN RAISE EXCEPTION 'Active Driver record required.' USING ERRCODE='23514';END IF;
 IF p_add AND a.driver_id IS NOT NULL AND a.driver_id<>d.id THEN RAISE EXCEPTION 'This assignment already has a Driver. Refresh and choose an unoccupied assignment.' USING ERRCODE='P0409';END IF;
 IF NOT p_add AND a.driver_id IS DISTINCT FROM d.id THEN RETURN jsonb_build_object('id',a.id);END IF;
 IF p_add AND a.driver_id=d.id THEN RETURN jsonb_build_object('id',a.id);END IF;
 -- Retain the existing current-truck compatibility relationship and its audit.
 IF p_add THEN PERFORM public.user_assign_current_truck_v1(p_actor,d.id,a.truck_id);
 ELSIF d.assigned_truck_id=a.truck_id AND NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments other WHERE other.id<>a.id AND other.driver_id=d.id AND other.unassigned_at IS NULL AND other.truck_id=a.truck_id) THEN PERFORM public.user_assign_current_truck_v1(p_actor,d.id,NULL);END IF;
 UPDATE public.trip_truck_assignments SET driver_id=CASE WHEN p_add THEN d.id ELSE NULL END,crew_version=crew_version+1,updated_at=clock_timestamp() WHERE id=a.id;
 -- Existing primary-crew trigger synchronizes membership, preserving old action attribution.
 UPDATE public.trip_truck_crew_members SET assigned_by=CASE WHEN p_add THEN p_actor ELSE assigned_by END,removed_by=CASE WHEN NOT p_add THEN p_actor ELSE removed_by END WHERE assignment_id=a.id AND profile_id=p_profile;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,CASE WHEN p_add THEN 'ASSIGNMENT_DRIVER_ADDED' ELSE 'ASSIGNMENT_DRIVER_REMOVED' END,'trip_truck_assignments',a.id,jsonb_build_object('driver_id',a.driver_id),jsonb_build_object('driver_id',CASE WHEN p_add THEN d.id ELSE NULL END,'trip_id',trip));
 RETURN jsonb_build_object('id',a.id);
END $$;
REVOKE ALL ON FUNCTION public.select_driver_assignment_v1(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_driver_assignment_v1(uuid,uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
