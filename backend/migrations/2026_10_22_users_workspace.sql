-- Additive Users workspace; no historical operational records are changed.
-- Recovery: disable new routes/workers, revoke new service RPCs. Keep retained
-- profiles, audit evidence and pending jobs; do not drop data for rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON public.audit_logs(user_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS flex_audit_actor_created_idx ON public.flex_audit_events(actor_profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS report_audit_actor_created_idx ON public.report_audit_logs(actor_profile_id,created_at DESC);
CREATE TABLE public.user_maintenance_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN ('DISABLE_AUTH','CLEANUP_PICTURE','FINALIZE_ACTIVITY')),
 dedupe_key text NOT NULL UNIQUE,payload jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','WORKING','DONE')),
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.user_maintenance_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_maintenance_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.user_maintenance_jobs TO service_role;
CREATE INDEX user_maintenance_pending_idx ON public.user_maintenance_jobs(next_attempt_at) WHERE state<>'DONE';

CREATE FUNCTION public.user_current_truck_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('user-current-truck-v1',0));
 IF NEW.status<>'ACTIVE' THEN NEW.assigned_truck_id:=NULL; END IF;
 IF NEW.assigned_truck_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.assigned_truck_id,NEW.status) IS NOT DISTINCT FROM (OLD.assigned_truck_id,OLD.status) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.drivers d WHERE d.assigned_truck_id=NEW.assigned_truck_id AND d.status='ACTIVE' AND d.id<>NEW.id)
 OR EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.trips t ON t.id=a.trip_id WHERE a.truck_id=NEW.assigned_truck_id AND a.driver_id IS NOT NULL AND a.driver_id<>NEW.id AND EXISTS(SELECT 1 FROM public.drivers active_driver WHERE active_driver.id=a.driver_id AND active_driver.status='ACTIVE') AND a.unassigned_at IS NULL AND t.archived_at IS NULL AND upper(t.status) NOT IN ('COMPLETED','DELIVERED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED')) THEN
 RAISE EXCEPTION 'This truck already has an active driver assignment' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_current_truck_guard BEFORE INSERT OR UPDATE OF assigned_truck_id,status ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.user_current_truck_guard_v1();
CREATE FUNCTION public.user_trip_truck_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('user-current-truck-v1',0));
 IF NEW.unassigned_at IS NULL AND NEW.driver_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.trips WHERE id=NEW.trip_id AND archived_at IS NULL AND upper(status) NOT IN ('COMPLETED','DELIVERED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED'))
 AND EXISTS(SELECT 1 FROM public.drivers WHERE assigned_truck_id=NEW.truck_id AND status='ACTIVE' AND id<>NEW.driver_id) THEN RAISE EXCEPTION 'Truck belongs to another current driver' USING ERRCODE='23505'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER user_trip_truck_guard BEFORE INSERT OR UPDATE OF truck_id,driver_id,unassigned_at ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.user_trip_truck_guard_v1();

CREATE FUNCTION public.user_assign_current_truck_v1(p_actor uuid,p_driver uuid,p_truck uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.drivers%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('user-current-truck-v1',0));
 SELECT * INTO d FROM public.drivers WHERE id=p_driver FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Driver not found' USING ERRCODE='P0002'; END IF;
 IF p_truck IS NOT NULL AND (d.status<>'ACTIVE' OR EXISTS(SELECT 1 FROM public.profiles WHERE id=d.profile_id AND deactivated_at IS NOT NULL)) THEN RAISE EXCEPTION 'Activate the driver account before assigning a truck' USING ERRCODE='23514'; END IF;
 IF p_truck IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trucks WHERE id=p_truck AND status='ACTIVE') THEN RAISE EXCEPTION 'Select an active truck' USING ERRCODE='23514'; END IF;
 IF d.assigned_truck_id IS NOT DISTINCT FROM p_truck THEN RETURN jsonb_build_object('driver_id',p_driver,'assigned_truck_id',p_truck); END IF;
 UPDATE public.drivers SET assigned_truck_id=p_truck,updated_at=now() WHERE id=p_driver;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,CASE WHEN p_truck IS NULL THEN 'DRIVER_TRUCK_REMOVED' ELSE 'DRIVER_TRUCK_ASSIGNED' END,'drivers',p_driver,jsonb_build_object('assigned_truck_id',d.assigned_truck_id),jsonb_build_object('assigned_truck_id',p_truck,'driver_name',concat_ws(' ',d.first_name,d.last_name)));
 RETURN jsonb_build_object('driver_id',p_driver,'assigned_truck_id',p_truck);
END $$;

CREATE FUNCTION public.user_deactivate_v1(p_actor uuid,p_subject uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('users-admin-management-v1',0));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='ADMIN' AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF p_actor=p_subject THEN RAISE EXCEPTION 'You cannot delete your signed-in account' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
 IF p.is_admin OR (p.role='ADMIN' AND (SELECT count(*) FROM public.profiles WHERE role='ADMIN' AND deactivated_at IS NULL)<=1) THEN RAISE EXCEPTION 'Required administrators cannot be deleted' USING ERRCODE='42501'; END IF;
 IF p.deactivated_at IS NOT NULL THEN RETURN jsonb_build_object('id',p_subject,'deleted',true,'retained',true); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('user-current-truck-v1',0));
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'USER_DEACTIVATED','profiles',p_subject,jsonb_build_object('name',concat_ws(' ',p.first_name,p.last_name),'role',p.role,'driver_assignments',(SELECT jsonb_agg(jsonb_build_object('driver_id',id,'assigned_truck_id',assigned_truck_id)) FROM public.drivers WHERE profile_id=p_subject)),jsonb_build_object('status','DEACTIVATED','operational_history','retained'));
 UPDATE public.drivers SET assigned_truck_id=NULL,status='INACTIVE',updated_at=now() WHERE profile_id=p_subject;
 UPDATE public.profiles SET deactivated_at=now(),deactivated_by=p_actor,updated_at=now() WHERE id=p_subject;
 DELETE FROM public.admin_staff_session_days WHERE profile_id=p_subject;
 DELETE FROM public.trucker_active_sessions WHERE profile_id=p_subject;
 INSERT INTO public.user_maintenance_jobs(profile_id,kind,dedupe_key) VALUES(p_subject,'DISABLE_AUTH','disable:'||p_subject) ON CONFLICT(dedupe_key) DO UPDATE SET state='PENDING',next_attempt_at=now();
 RETURN jsonb_build_object('id',p_subject,'deleted',true,'retained',true);
END $$;

CREATE FUNCTION public.user_profile_patch_v1(p_actor uuid,p_subject uuid,p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE; updated public.profiles%ROWTYPE; admin boolean; key text; allowed text[];
BEGIN
 SELECT role='ADMIN' INTO admin FROM public.profiles WHERE id=p_actor AND deactivated_at IS NULL;
 IF admin IS NULL OR (p_actor<>p_subject AND NOT admin) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_subject FOR UPDATE;
 IF NOT FOUND OR p.deactivated_at IS NOT NULL THEN RAISE EXCEPTION 'Active profile not found' USING ERRCODE='P0002'; END IF;
 allowed:=ARRAY['first_name','last_name','contact_number'];IF admin THEN allowed:=allowed||ARRAY['license_number','driver_notes','driver_status','trucking_company_id'];END IF;
 IF jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb THEN RAISE EXCEPTION 'Provide a profile change' USING ERRCODE='22023'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_patch) LOOP
 IF NOT(key=ANY(allowed)) OR (jsonb_typeof(p_patch->key) NOT IN ('string','null')) OR length(coalesce(p_patch->>key,''))>2000 THEN RAISE EXCEPTION 'Unsupported profile field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (p_patch?'first_name' AND nullif(trim(p_patch->>'first_name'),'') IS NULL) OR (p_patch?'last_name' AND nullif(trim(p_patch->>'last_name'),'') IS NULL) THEN RAISE EXCEPTION 'First and last name are required' USING ERRCODE='22023'; END IF;
 IF p_patch?'driver_status' AND p_patch->>'driver_status' NOT IN ('ACTIVE','INACTIVE') THEN RAISE EXCEPTION 'Invalid driver status' USING ERRCODE='22023'; END IF;
 UPDATE public.profiles SET first_name=CASE WHEN p_patch?'first_name' THEN trim(p_patch->>'first_name') ELSE first_name END,last_name=CASE WHEN p_patch?'last_name' THEN trim(p_patch->>'last_name') ELSE last_name END,contact_number=CASE WHEN p_patch?'contact_number' THEN nullif(trim(p_patch->>'contact_number'),'') ELSE contact_number END,updated_at=now() WHERE id=p_subject RETURNING * INTO updated;
 IF p.role='TRUCKER' THEN UPDATE public.drivers SET first_name=updated.first_name,last_name=updated.last_name,contact_number=CASE WHEN p_patch?'contact_number' THEN updated.contact_number ELSE contact_number END,license_number=CASE WHEN p_patch?'license_number' THEN nullif(trim(p_patch->>'license_number'),'') ELSE license_number END,notes=CASE WHEN p_patch?'driver_notes' THEN nullif(trim(p_patch->>'driver_notes'),'') ELSE notes END,status=CASE WHEN p_patch?'driver_status' THEN p_patch->>'driver_status' ELSE status END,trucking_company_id=CASE WHEN p_patch?'trucking_company_id' THEN nullif(p_patch->>'trucking_company_id','')::uuid ELSE trucking_company_id END,updated_at=now() WHERE profile_id=p_subject; END IF;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'USER_PROFILE_EDITED','profiles',p_subject,to_jsonb(p)-ARRAY['profile_picture_path'],p_patch||jsonb_build_object('name',concat_ws(' ',updated.first_name,updated.last_name)));
 RETURN to_jsonb(updated);
END $$;

CREATE FUNCTION public.user_profile_picture_v1(p_actor uuid,p_subject uuid,p_path text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_path text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND deactivated_at IS NULL AND (id=p_subject OR role='ADMIN')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_path NOT LIKE p_subject::text||'/%' OR p_path LIKE '%..%' THEN RAISE EXCEPTION 'Invalid owned image path' USING ERRCODE='22023'; END IF;
 SELECT profile_picture_path INTO old_path FROM public.profiles WHERE id=p_subject AND deactivated_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
 UPDATE public.profiles SET profile_picture_path=p_path,updated_at=now() WHERE id=p_subject;
 UPDATE public.user_maintenance_jobs SET state='DONE',updated_at=now() WHERE dedupe_key='picture:'||p_path;
 IF old_path IS NOT NULL AND old_path<>p_path AND old_path LIKE p_subject::text||'/%' AND old_path NOT LIKE '%..%' THEN
 INSERT INTO public.user_maintenance_jobs(profile_id,kind,dedupe_key,payload) VALUES(p_subject,'CLEANUP_PICTURE','picture:'||old_path,jsonb_build_object('path',old_path)) ON CONFLICT(dedupe_key) DO UPDATE SET state='PENDING',next_attempt_at=now(); END IF;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES(p_actor,'PROFILE_PICTURE_UPDATED','profiles',p_subject,jsonb_build_object('status','updated'));
END $$;
CREATE FUNCTION public.claim_user_maintenance_v1() RETURNS SETOF public.user_maintenance_jobs LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.user_maintenance_jobs SET state='WORKING',attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id IN (SELECT id FROM public.user_maintenance_jobs WHERE (state='PENDING' OR state='WORKING' AND lease_until<now()) AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING *;
$$;
CREATE VIEW public.v_user_activity AS
 SELECT 'audit:'||id::text AS id,user_id,action,entity_type AS module,entity_id,old_data,new_data,created_at FROM public.audit_logs
 UNION ALL SELECT 'flex:'||id::text,actor_profile_id,upper(action), 'flexible-tables',entity_id,before_data,after_data,created_at FROM public.flex_audit_events
 UNION ALL SELECT 'report:'||id::text,actor_profile_id,upper(action),entity_type,entity_id,before_data,after_data,created_at FROM public.report_audit_logs
 UNION ALL SELECT 'pod:'||id::text,actor_profile_id,'POD_'||upper(decision),'pod',receipt_id,NULL::jsonb,jsonb_build_object('trip_id',trip_id,'trip_stop_id',trip_stop_id,'result',outcome,'actor_name',actor_snapshot),created_at FROM public.pod_review_events;
REVOKE ALL ON public.v_user_activity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_user_activity TO service_role;
CREATE FUNCTION public.user_activity_stats_v1(p_actor uuid,p_subject uuid,p_days integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND deactivated_at IS NULL AND (id=p_subject OR role='ADMIN')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('period_days',greatest(1,least(p_days,90)),'daily',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS day,count(*)::int AS actions FROM public.v_user_activity WHERE user_id=p_subject AND action<>'REQUEST_STARTED' AND coalesce(new_data->>'result','SUCCESS') NOT IN ('FAILED','STARTED') AND created_at>=now()-make_interval(days=>greatest(1,least(p_days,90))) GROUP BY 1 ORDER BY 1)x),'breakdown',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT coalesce(module,'other') AS module,count(*)::int AS actions FROM public.v_user_activity WHERE user_id=p_subject AND action<>'REQUEST_STARTED' AND coalesce(new_data->>'result','SUCCESS') NOT IN ('FAILED','STARTED') AND created_at>=now()-make_interval(days=>greatest(1,least(p_days,90))) GROUP BY 1 ORDER BY 2 DESC)x),'coverage','Recorded activity only. Missing historical logs do not mean no work was done.');
END $$;
DO $$ DECLARE signature regprocedure; BEGIN FOR signature IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('user_assign_current_truck_v1','user_deactivate_v1','user_profile_patch_v1','user_profile_picture_v1','claim_user_maintenance_v1','user_activity_stats_v1') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',signature);END LOOP;END $$;
-- Existing published signal feed, rather than another websocket channel.
CREATE TRIGGER audit_activity_signal AFTER INSERT OR UPDATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
CREATE TRIGGER flex_activity_signal AFTER INSERT ON public.flex_audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
CREATE TRIGGER report_activity_signal AFTER INSERT ON public.report_audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
CREATE TRIGGER pod_activity_signal AFTER INSERT ON public.pod_review_events FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();

CREATE FUNCTION public.user_available_trucks_v1(p_actor uuid,p_driver uuid,p_search text DEFAULT '',p_after text DEFAULT NULL)
RETURNS SETOF public.trucks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=p_driver) THEN RAISE EXCEPTION 'Driver not found' USING ERRCODE='P0002';END IF;
 RETURN QUERY SELECT t.* FROM public.trucks t WHERE t.status='ACTIVE' AND (p_after IS NULL OR t.plate_number>p_after)
 AND (coalesce(p_search,'')='' OR t.plate_number ILIKE '%'||p_search||'%' OR t.truck_type ILIKE '%'||p_search||'%')
 AND NOT EXISTS(SELECT 1 FROM public.drivers d WHERE d.assigned_truck_id=t.id AND d.status='ACTIVE' AND d.id<>p_driver)
 AND NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.trips trip ON trip.id=a.trip_id WHERE a.truck_id=t.id AND a.driver_id IS NOT NULL AND a.driver_id<>p_driver AND EXISTS(SELECT 1 FROM public.drivers active_driver WHERE active_driver.id=a.driver_id AND active_driver.status='ACTIVE') AND a.unassigned_at IS NULL AND trip.archived_at IS NULL AND upper(trip.status) NOT IN ('COMPLETED','DELIVERED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED'))
 ORDER BY t.plate_number,t.id LIMIT 51;
END $$;
REVOKE ALL ON FUNCTION public.user_available_trucks_v1(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_available_trucks_v1(uuid,uuid,text,text) TO service_role;

CREATE VIEW public.v_managed_users_directory AS
 SELECT p.id,p.first_name,p.last_name,p.role,p.is_admin,p.created_at,p.updated_at,p.deactivated_at,
 u.email::text AS email,coalesce(d.contact_number,p.contact_number) AS contact_number,d.id AS driver_id,
 d.license_number,d.notes AS driver_notes,d.status AS driver_status,d.trucking_company_id,
 company.name AS trucking_company_name,d.assigned_truck_id,truck.plate_number,truck.truck_type,
 CASE WHEN p.deactivated_at IS NULL THEN 'ACTIVE' ELSE 'DEACTIVATED' END AS account_status
 FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id LEFT JOIN public.drivers d ON d.profile_id=p.id
 LEFT JOIN public.trucks truck ON truck.id=d.assigned_truck_id LEFT JOIN public.trucking_companies company ON company.id=d.trucking_company_id;
REVOKE ALL ON public.v_managed_users_directory FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_managed_users_directory TO service_role;
COMMIT;
