CREATE OR REPLACE FUNCTION public.assert_trip_resource_schedule_v1(p_trip uuid, p_truck uuid, p_driver uuid, p_assignment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE target public.trips%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('trip-workflow-schedules-v1',0));
  SELECT * INTO target FROM public.trips WHERE id=p_trip;
  IF NOT FOUND OR target.archived_at IS NOT NULL OR upper(target.status::text) IN ('CANCELLED','CANCELED','COMPLETED','DELIVERED') THEN RETURN;END IF;
  IF target.loading_date IS NULL OR target.estimated_delivery_date IS NULL THEN
    IF upper(target.status::text)<>'PLANNED' THEN RAISE EXCEPTION 'Complete loading and delivery dates before activating an assigned trip' USING ERRCODE='23514';END IF;
    RETURN;
  END IF;
  IF target.estimated_delivery_date<target.loading_date THEN RAISE EXCEPTION 'Delivery date cannot precede loading date' USING ERRCODE='23514';END IF;
  IF EXISTS(
    SELECT 1 FROM public.trip_truck_assignments a JOIN public.trips t ON t.id=a.trip_id
    WHERE a.id IS DISTINCT FROM p_assignment AND a.trip_id<>p_trip AND a.unassigned_at IS NULL AND t.archived_at IS NULL
      AND (a.truck_id=p_truck OR (p_driver IS NOT NULL AND a.driver_id=p_driver))
      AND upper(t.status::text) NOT IN ('CANCELLED','CANCELED','COMPLETED','DELIVERED')
      AND t.loading_date IS NOT NULL AND t.estimated_delivery_date IS NOT NULL
      AND t.loading_date<=target.estimated_delivery_date AND t.estimated_delivery_date>=target.loading_date
  ) THEN RAISE EXCEPTION 'Truck or driver has a conflicting active trip schedule. Choose another resource or change the dates' USING ERRCODE='23514';END IF;
END $function$
