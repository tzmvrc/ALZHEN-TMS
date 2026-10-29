-- Extend existing direct-read policies to the same active assignment-scoped crew rule.
-- Management read permissions are preserved; no operational rows are changed.
DROP POLICY IF EXISTS convoy_stops_read ON public.trip_assignment_stops;
CREATE POLICY convoy_stops_read ON public.trip_assignment_stops FOR SELECT TO authenticated USING
 (public.crew_assignment_access_v1(auth.uid(),assignment_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')));
DROP POLICY IF EXISTS convoy_cargo_read ON public.trip_cargo_allocations;
CREATE POLICY convoy_cargo_read ON public.trip_cargo_allocations FOR SELECT TO authenticated USING
 (public.crew_assignment_access_v1(auth.uid(),assignment_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')));
DROP POLICY IF EXISTS "authenticated users can read trip line items" ON public.trip_line_items;
DROP POLICY IF EXISTS crew_line_items_read ON public.trip_line_items;
CREATE POLICY crew_line_items_read ON public.trip_line_items FOR SELECT TO authenticated USING
 (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')) OR EXISTS
 (SELECT 1 FROM public.trip_cargo_allocations a WHERE a.trip_line_item_id=trip_line_items.id AND public.crew_assignment_access_v1(auth.uid(),a.assignment_id)));
DROP POLICY IF EXISTS "authenticated users can read trip stops" ON public.trip_stops;
DROP POLICY IF EXISTS crew_stops_read ON public.trip_stops;
CREATE POLICY crew_stops_read ON public.trip_stops FOR SELECT TO authenticated USING
 (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')) OR EXISTS
 (SELECT 1 FROM public.trip_truck_assignments a WHERE a.trip_id=trip_stops.trip_id AND public.crew_assignment_access_v1(auth.uid(),a.id)
 AND (a.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops s WHERE s.assignment_id=a.id AND s.trip_stop_id=trip_stops.id))));
DROP POLICY IF EXISTS "authenticated users can read trips" ON public.trips;
DROP POLICY IF EXISTS crew_trips_read ON public.trips;
CREATE POLICY crew_trips_read ON public.trips FOR SELECT TO authenticated USING
 (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('ADMIN','STAFF')) OR EXISTS
 (SELECT 1 FROM public.trip_truck_assignments a WHERE a.trip_id=trips.id AND public.crew_assignment_access_v1(auth.uid(),a.id)));
-- Archived primary-driver history must not block later account classification edits.
CREATE OR REPLACE FUNCTION public.guard_profile_crew_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.role='TRUCKER' THEN NEW.crew_role:=coalesce(NEW.crew_role,'DRIVER');END IF;
 IF TG_OP='UPDATE' AND NEW.crew_role IS DISTINCT FROM OLD.crew_role AND current_user IN ('anon','authenticated') THEN RAISE EXCEPTION 'Only management may change crew classification.' USING ERRCODE='42501';END IF;
 IF NEW.crew_role='HELPER' AND EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id JOIN public.trips t ON t.id=a.trip_id WHERE d.profile_id=NEW.id AND a.unassigned_at IS NULL AND t.archived_at IS NULL) THEN RAISE EXCEPTION 'Replace the active primary driver before classifying this account as Helper.' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
