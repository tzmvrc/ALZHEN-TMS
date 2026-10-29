-- Crew classification does not change authentication roles or device-session policy.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crew_role text;
UPDATE public.profiles SET crew_role='DRIVER' WHERE role='TRUCKER' AND crew_role IS NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_crew_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_crew_role_check CHECK
 ((role='TRUCKER' AND crew_role IS NOT NULL AND crew_role IN ('DRIVER','HELPER')) OR (role<>'TRUCKER' AND crew_role IS NULL));
CREATE OR REPLACE FUNCTION public.guard_profile_crew_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.role='TRUCKER' THEN NEW.crew_role:=coalesce(NEW.crew_role,'DRIVER');END IF;
 IF TG_OP='UPDATE' AND NEW.crew_role IS DISTINCT FROM OLD.crew_role AND current_user IN ('anon','authenticated') THEN RAISE EXCEPTION 'Only management may change crew classification.' USING ERRCODE='42501';END IF;
 IF NEW.crew_role='HELPER' AND EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id JOIN public.trips t ON t.id=a.trip_id WHERE d.profile_id=NEW.id AND a.unassigned_at IS NULL AND t.archived_at IS NULL) THEN RAISE EXCEPTION 'Replace the active primary driver before classifying this account as Helper.' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_crew_guard ON public.profiles;
CREATE TRIGGER profiles_crew_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_crew_v1();

ALTER TABLE public.trip_truck_assignments ADD COLUMN IF NOT EXISTS crew_version bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.trip_truck_crew_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL REFERENCES public.trip_truck_assignments(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 crew_role text NOT NULL CHECK(crew_role IN ('DRIVER','HELPER')),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(), assigned_by uuid REFERENCES public.profiles(id),
 removed_at timestamptz, removed_by uuid REFERENCES public.profiles(id),
 UNIQUE(assignment_id,profile_id)
);
CREATE INDEX IF NOT EXISTS crew_profile_active ON public.trip_truck_crew_members(profile_id,assignment_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS crew_assignment_active ON public.trip_truck_crew_members(assignment_id,crew_role) WHERE removed_at IS NULL;
ALTER TABLE public.trip_truck_crew_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_truck_crew_members FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.trip_truck_crew_members TO service_role;

INSERT INTO public.trip_truck_crew_members(assignment_id,profile_id,crew_role,assigned_at,removed_at)
 SELECT a.id,p.id,'DRIVER',coalesce(a.assigned_at,a.created_at,clock_timestamp()),a.unassigned_at
 FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id JOIN public.profiles p ON p.id=d.profile_id AND p.role='TRUCKER'
 ON CONFLICT(assignment_id,profile_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.crew_assignment_access_v1(p_actor uuid,p_assignment uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.trip_truck_crew_members c JOIN public.trip_truck_assignments a ON a.id=c.assignment_id
 JOIN public.profiles p ON p.id=c.profile_id WHERE c.assignment_id=p_assignment AND c.profile_id=p_actor
 AND c.removed_at IS NULL AND a.unassigned_at IS NULL AND p.role='TRUCKER' AND p.deactivated_at IS NULL AND p.locked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.crew_assignment_access_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crew_assignment_access_v1(uuid,uuid) TO service_role,authenticated;

CREATE OR REPLACE FUNCTION public.sync_primary_crew_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person uuid;
BEGIN
 SELECT p.id INTO person FROM public.drivers d JOIN public.profiles p ON p.id=d.profile_id AND p.role='TRUCKER' WHERE d.id=NEW.driver_id;
 IF person IS NOT NULL AND NEW.unassigned_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=person AND crew_role='DRIVER') THEN RAISE EXCEPTION 'Select a Driver account as the primary driver.' USING ERRCODE='23514';END IF;
 UPDATE public.trip_truck_crew_members SET removed_at=clock_timestamp() WHERE assignment_id=NEW.id AND removed_at IS NULL AND (NEW.unassigned_at IS NOT NULL OR (crew_role='DRIVER' AND profile_id IS DISTINCT FROM person));
 IF person IS NOT NULL AND NEW.unassigned_at IS NULL THEN
 INSERT INTO public.trip_truck_crew_members(assignment_id,profile_id,crew_role) VALUES(NEW.id,person,'DRIVER')
 ON CONFLICT(assignment_id,profile_id) DO UPDATE SET removed_at=NULL,removed_by=NULL,crew_role='DRIVER';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assignment_primary_crew ON public.trip_truck_assignments;
CREATE TRIGGER assignment_primary_crew AFTER INSERT OR UPDATE OF driver_id,unassigned_at ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.sync_primary_crew_v1();

CREATE OR REPLACE FUNCTION public.signal_crew_change_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE trip uuid;
BEGIN
 SELECT trip_id INTO trip FROM public.trip_truck_assignments WHERE id=NEW.assignment_id;
 INSERT INTO public.trip_operational_signals(trip_id,source,record_id) VALUES(trip,'trip_truck_crew_members',NEW.assignment_id)
 ON CONFLICT(trip_id,source) DO UPDATE SET record_id=excluded.record_id,revision=gen_random_uuid(),changed_at=clock_timestamp();RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_operational_signal ON public.trip_truck_crew_members;
CREATE TRIGGER crew_operational_signal AFTER INSERT OR UPDATE ON public.trip_truck_crew_members FOR EACH ROW EXECUTE FUNCTION public.signal_crew_change_v1();

CREATE OR REPLACE FUNCTION public.save_assignment_crew_v1(p_actor uuid,p_trip uuid,p_assignment uuid,p_helpers uuid[],p_expected bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.trip_truck_assignments%ROWTYPE; member uuid; previous jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL AND locked_at IS NULL) THEN RAISE EXCEPTION 'Management access required.' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active trip required.' USING ERRCODE='23514';END IF;
 SELECT * INTO a FROM public.trip_truck_assignments WHERE id=p_assignment AND trip_id=p_trip AND unassigned_at IS NULL FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Active truck assignment required.' USING ERRCODE='42501';END IF;
 IF p_helpers IS NULL OR array_position(p_helpers,NULL) IS NOT NULL OR cardinality(p_helpers)<>(SELECT count(DISTINCT v) FROM unnest(p_helpers)v) THEN RAISE EXCEPTION 'Choose distinct Helper accounts.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_helpers) person LEFT JOIN public.profiles p ON p.id=person WHERE p.id IS NULL OR p.role<>'TRUCKER' OR p.crew_role<>'HELPER' OR p.deactivated_at IS NOT NULL OR p.locked_at IS NOT NULL) THEN RAISE EXCEPTION 'Choose active Helper accounts.' USING ERRCODE='23514';END IF;
 SELECT coalesce(jsonb_agg(profile_id ORDER BY profile_id),'[]') INTO previous FROM public.trip_truck_crew_members WHERE assignment_id=a.id AND crew_role='HELPER' AND removed_at IS NULL;
 IF previous=(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM unnest(p_helpers)v) THEN RETURN jsonb_build_object('id',a.id,'crew_version',a.crew_version);END IF;
 IF a.crew_version<>p_expected THEN RAISE EXCEPTION 'Crew changed. Refresh before saving.' USING ERRCODE='P0409';END IF;
 UPDATE public.trip_truck_crew_members SET removed_at=clock_timestamp(),removed_by=p_actor WHERE assignment_id=a.id AND crew_role='HELPER' AND removed_at IS NULL AND NOT(profile_id=ANY(p_helpers));
 FOREACH member IN ARRAY p_helpers LOOP
 INSERT INTO public.trip_truck_crew_members(assignment_id,profile_id,crew_role,assigned_by) VALUES(a.id,member,'HELPER',p_actor)
 ON CONFLICT(assignment_id,profile_id) DO UPDATE SET removed_at=NULL,removed_by=NULL,assigned_at=CASE WHEN trip_truck_crew_members.removed_at IS NOT NULL THEN clock_timestamp() ELSE trip_truck_crew_members.assigned_at END,assigned_by=p_actor,crew_role='HELPER';END LOOP;
 UPDATE public.trip_truck_assignments SET crew_version=crew_version+1 WHERE id=a.id RETURNING * INTO a;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'TRUCK_CREW_CHANGED','trip_truck_assignments',a.id,jsonb_build_object('helpers',previous),jsonb_build_object('helpers',p_helpers,'trip_id',p_trip));
 RETURN jsonb_build_object('id',a.id,'crew_version',a.crew_version);
END $$;
REVOKE ALL ON FUNCTION public.save_assignment_crew_v1(uuid,uuid,uuid,uuid[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_assignment_crew_v1(uuid,uuid,uuid,uuid[],bigint) TO service_role;

-- Preserve the currently installed writers, including all POD safety corrections.
DO $patch$
DECLARE definition text; target regprocedure; old text;
BEGIN
 FOREACH target IN ARRAY ARRAY['public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure,'public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb)'::regprocedure] LOOP
 SELECT pg_get_functiondef(target) INTO definition;
 IF position('crew_assignment_access_v1' IN definition)=0 THEN
  definition:=regexp_replace(definition,'not exists\(select 1 from public.drivers where id=a.driver_id and profile_id=p_actor\)','NOT public.crew_assignment_access_v1(p_actor,a.id)','gi');
  IF position('crew_assignment_access_v1' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected assignment writer authorization';END IF;
  IF target='public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb)'::regprocedure THEN definition:=replace(definition,' AND uploaded_by=p_actor AND kind=', ' AND kind=');END IF;
  EXECUTE definition;
 END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure) INTO definition;
 IF position('crew_once_milestone_v1' IN definition)=0 THEN
 old:=' if lat is not null or lng is not null then';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected delivery writer validation';END IF;
 definition:=replace(definition,old,$once$
 -- crew_once_milestone_v1: trip/assignment locks serialize concurrent crew writes.
 if k in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED') then
  select * into saved from public.trip_events where assignment_id=a.id and trip_stop_id is not distinct from sid and event_type=k order by event_time,id limit 1;
  if found then return to_jsonb(saved);end if;
 end if;
$once$||old);EXECUTE definition;END IF;
 target:=to_regprocedure('public.user_profile_patch_v1(uuid,uuid,jsonb)');
 IF target IS NOT NULL THEN
 SELECT pg_get_functiondef(target) INTO definition;
 IF position('crew_role' IN definition)=0 THEN
 definition:=replace(definition,$old$ARRAY['license_number','driver_notes','driver_status','trucking_company_id']$old$,$new$ARRAY['license_number','driver_notes','driver_status','trucking_company_id','crew_role']$new$);
 definition:=replace(definition,'UPDATE public.profiles SET first_name=',$new$UPDATE public.profiles SET crew_role=CASE WHEN p_patch?'crew_role' AND p.role='TRUCKER' THEN p_patch->>'crew_role' ELSE crew_role END,first_name=$new$);
 EXECUTE definition;END IF;END IF;
 target:=to_regprocedure('public.lock_operations_submission_scope_v1(uuid,uuid,uuid)');
 IF target IS NOT NULL THEN
 SELECT pg_get_functiondef(target) INTO definition;
 definition:=replace(definition,'d.profile_id=p_actor','public.crew_assignment_access_v1(p_actor,a.id)');EXECUTE definition;END IF;
END $patch$;

-- Historical actor identity is fixed at event creation, independent of later crew edits.
CREATE OR REPLACE FUNCTION public.capture_crew_actor_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE person public.profiles%ROWTYPE; classification text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.delivery_metadata ? 'actor_snapshot' THEN NEW.delivery_metadata:=coalesce(NEW.delivery_metadata,'{}')||jsonb_build_object('actor_snapshot',OLD.delivery_metadata->'actor_snapshot');END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO person FROM public.profiles WHERE id=NEW.recorded_by;
 SELECT crew_role INTO classification FROM public.trip_truck_crew_members WHERE assignment_id=NEW.assignment_id AND profile_id=NEW.recorded_by AND removed_at IS NULL;
 NEW.delivery_metadata:=coalesce(NEW.delivery_metadata,'{}')||jsonb_build_object('actor_snapshot',jsonb_build_object('profile_id',NEW.recorded_by,'name',coalesce(nullif(btrim(concat_ws(' ',person.first_name,person.last_name)),''),'Unknown'),'crew_role',coalesce(classification,person.crew_role)));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_event_actor ON public.trip_events;
CREATE TRIGGER crew_event_actor BEFORE INSERT OR UPDATE ON public.trip_events FOR EACH ROW EXECUTE FUNCTION public.capture_crew_actor_v1();
CREATE OR REPLACE FUNCTION public.audit_crew_event_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES(NEW.recorded_by,'CREW_DELIVERY_'||NEW.event_type,'trip_events',NEW.id,jsonb_build_object('assignment_id',NEW.assignment_id,'trip_id',NEW.trip_id,'actor',NEW.delivery_metadata->'actor_snapshot','event_time',NEW.event_time));RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_event_audit ON public.trip_events;
CREATE TRIGGER crew_event_audit AFTER INSERT ON public.trip_events FOR EACH ROW EXECUTE FUNCTION public.audit_crew_event_v1();

-- Fan out the existing confirmed rejection notification, sharing its event key.
CREATE OR REPLACE FUNCTION public.notify_pod_crew_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE assignment uuid; original public.admin_notifications%ROWTYPE;
BEGIN
 SELECT * INTO original FROM public.admin_notifications WHERE id=NEW.id;
 IF original.notification_type<>'pod_rejected' OR original.metadata?'crew_notice_source' THEN RETURN NEW;END IF;
 SELECT assignment_id INTO assignment FROM public.trip_images WHERE id=nullif(original.metadata->>'receipt_id','')::uuid;
 IF assignment IS NULL THEN RETURN NEW;END IF;
 INSERT INTO public.admin_notifications(recipient_profile_id,actor_profile_id,notification_type,reference_type,reference_id,trip_id,event_key,message,metadata)
 SELECT c.profile_id,original.actor_profile_id,original.notification_type,original.reference_type,original.reference_id,coalesce(original.trip_id,original.reference_id),original.event_key,original.message,original.metadata||jsonb_build_object('assignment_id',assignment,'crew_notice_source',original.id)
 FROM public.trip_truck_crew_members c WHERE c.assignment_id=assignment AND public.crew_assignment_access_v1(c.profile_id,assignment) AND c.profile_id<>original.recipient_profile_id
 ON CONFLICT(recipient_profile_id,event_key) DO NOTHING;
 RETURN NEW;
END $$;
-- Deferred so the original review workflow has already enriched message/action metadata.
DROP TRIGGER IF EXISTS pod_crew_notification ON public.admin_notifications;
CREATE CONSTRAINT TRIGGER pod_crew_notification AFTER INSERT ON public.admin_notifications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.notify_pod_crew_v1();

-- Remove permissive direct reads of other trucks; Admin/Staff read access stays intact.
DROP POLICY IF EXISTS "authenticated users can read trip truck assignments" ON public.trip_truck_assignments;
DROP POLICY IF EXISTS "authenticated users can read trip events" ON public.trip_events;
DROP POLICY IF EXISTS crew_assignment_read ON public.trip_truck_assignments;
CREATE POLICY crew_assignment_read ON public.trip_truck_assignments FOR SELECT TO authenticated USING
 (public.crew_assignment_access_v1(auth.uid(),id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')));
DROP POLICY IF EXISTS crew_event_read ON public.trip_events;
CREATE POLICY crew_event_read ON public.trip_events FOR SELECT TO authenticated USING
 (public.crew_assignment_access_v1(auth.uid(),assignment_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')));

DO $directory$
DECLARE definition text;
BEGIN
 IF to_regclass('public.v_managed_users_directory') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v_managed_users_directory' AND column_name='crew_role') THEN
 SELECT pg_get_viewdef('public.v_managed_users_directory'::regclass,true) INTO definition;
 definition:=regexp_replace(definition,'\s+FROM profiles p',', p.crew_role FROM profiles p');
 EXECUTE 'CREATE OR REPLACE VIEW public.v_managed_users_directory AS '||definition;
 END IF;
END $directory$;
NOTIFY pgrst,'reload schema';
