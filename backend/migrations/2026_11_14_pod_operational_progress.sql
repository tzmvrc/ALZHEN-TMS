-- Physical milestones remain authoritative regardless of later POD decisions.
-- No backfill or updates to operational, quantity, billing or audit records.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
 IF position('delivery_stop_pod_ready_v1(a.id,sid,true)' IN definition)=0 THEN
  RAISE EXCEPTION 'Installed delivery writer differs from the inspected approval guard';
 END IF;
 definition:=replace(definition,'delivery_stop_pod_ready_v1(a.id,sid,true)','delivery_stop_pod_ready_v1(a.id,sid,false)');
 definition:=replace(definition,'delivery_stop_pod_ready_v1(a.id,st.id,true)','delivery_stop_pod_ready_v1(a.id,st.id,false)');
 definition:=replace(definition,'Wait for Admin approval of every required POD receipt before completing delivery.','Submit a POD before completing delivery.');
 definition:=replace(definition,'Complete every assigned stop and obtain the required POD approvals first.','Complete every assigned delivery stop first.');
 EXECUTE definition;

 definition:=pg_get_functiondef('public.delivery_stop_pod_ready_v1(uuid,uuid,boolean)'::regprocedure);
 IF position('SELECT EXISTS(SELECT 1 FROM scope) AND CASE WHEN EXISTS(SELECT 1 FROM expected)' IN definition)=0 THEN
  RAISE EXCEPTION 'Installed POD readiness differs from the inspected definition';
 END IF;
 definition:=replace(definition,'SELECT EXISTS(SELECT 1 FROM scope) AND CASE WHEN EXISTS(SELECT 1 FROM expected)',
  'SELECT EXISTS(SELECT 1 FROM scope) AND CASE WHEN NOT p_require_approved THEN EXISTS(SELECT 1 FROM documents) WHEN EXISTS(SELECT 1 FROM expected)');
 EXECUTE definition;

 definition:=pg_get_viewdef('public.v_confirmed_assignment_stop_state'::regclass,true);
 IF position('departure_time IS NOT NULL AND pod_approved' IN definition)=0 THEN
  RAISE EXCEPTION 'Installed physical-state projection differs from the inspected definition';
 END IF;
 definition:=replace(definition,'departure_time IS NOT NULL AND pod_approved','departure_time IS NOT NULL');
 definition:=replace(definition,'GREATEST(departure_time, pod_received_at)','departure_time');
 EXECUTE 'CREATE OR REPLACE VIEW public.v_confirmed_assignment_stop_state AS '||definition;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
