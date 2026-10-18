-- Phase 2C.7: close the status-change race between backend validation and RPC.
-- Replaces only our new scope guard; existing owner/ACL stay unchanged.
-- No row changes, new grants, RLS, Storage or publication changes.
-- Recovery: restore lock_operations_submission_scope_v1 from migration 11;
-- doing so removes only the extra terminal-state check, not ownership checks.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.lock_operations_submission_scope_v1(p_actor uuid,p_trip uuid,p_stop uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE actor_role text; trip_status text;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=p_actor FOR SHARE;
 IF actor_role IS NULL OR actor_role NOT IN ('ADMIN','STAFF','TRUCKER') THEN
  RAISE EXCEPTION 'Reporting is not authorized.' USING ERRCODE='42501';
 END IF;
 SELECT status::text INTO trip_status FROM public.trips WHERE id=p_trip AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trip unavailable.' USING ERRCODE='P0002'; END IF;
 IF p_stop IS NOT NULL THEN
  PERFORM id FROM public.trip_stops WHERE id=p_stop AND trip_id=p_trip AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stop does not belong to this active trip.' USING ERRCODE='23514'; END IF;
 END IF;
 IF actor_role='TRUCKER' THEN
  IF upper(btrim(coalesce(trip_status,''))) IN ('COMPLETED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED') THEN
   RAISE EXCEPTION 'Trucker trip is no longer active.' USING ERRCODE='42501';
  END IF;
  PERFORM a.id FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id
   WHERE a.trip_id=p_trip AND a.unassigned_at IS NULL AND d.profile_id=p_actor FOR SHARE OF a,d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trucker is not actively assigned.' USING ERRCODE='42501'; END IF;
 END IF;
END $$;

COMMIT;
