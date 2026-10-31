-- Read-only search projection. Canonical visibility remains v_active_trip_listing;
-- the existing dashboard's IN_PROGRESS status filter is applied by the service.
CREATE OR REPLACE VIEW public.v_home_trip_listing AS
SELECT t.*,w.name AS origin_name,
 concat_ws(' ',t.trip_reference,t.trip_number::text,t.dispatch_number,w.name,
  (SELECT string_agg(concat_ws(' ',truck.plate_number,driver.first_name,driver.last_name),' ' ORDER BY a.id)
   FROM public.trip_truck_assignments a
   LEFT JOIN public.trucks truck ON truck.id=a.truck_id
   LEFT JOIN public.drivers driver ON driver.id=a.driver_id
   WHERE a.trip_id=t.id AND a.unassigned_at IS NULL),
  (SELECT string_agg(concat_ws(' ',s.delivery_location,store.name),' ' ORDER BY s.stop_sequence,s.id)
   FROM public.trip_stops s LEFT JOIN public.customer_stores store ON store.id=s.store_id
   WHERE s.trip_id=t.id AND s.archived_at IS NULL),
  (SELECT string_agg(concat_ws(' ',p.first_name,p.last_name),' ' ORDER BY c.id)
   FROM public.trip_truck_crew_members c
   JOIN public.trip_truck_assignments a ON a.id=c.assignment_id
   JOIN public.profiles p ON p.id=c.profile_id
   WHERE a.trip_id=t.id AND a.unassigned_at IS NULL AND c.removed_at IS NULL)
 ) AS _home_search_text
FROM public.v_active_trip_listing t LEFT JOIN public.warehouses w ON w.id=t.warehouse_id;
REVOKE ALL ON public.v_home_trip_listing FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_home_trip_listing TO service_role;
