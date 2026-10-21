-- Additive dependency: trip_workflow_completion (plus its source/convoy dependencies).
-- Prepared migration; application and validation status are recorded in docs.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $dependencies$
BEGIN
  IF to_regclass('public.trip_import_batches') IS NULL
    OR to_regclass('public.trip_import_groups') IS NULL
    OR to_regclass('public.trip_import_rows') IS NULL
    OR to_regclass('public.v_trip_source_master') IS NULL
    OR to_regclass('public.trip_cargo_allocations') IS NULL
    OR to_regclass('public.trip_assignment_stops') IS NULL
    OR to_regprocedure('public.create_trip_bundle_v2(uuid,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.finalize_trip_import_cargo_v1(uuid,uuid,text,jsonb)') IS NULL
    OR to_regprocedure('public.workflow_assignment_driver_guard_v1()') IS NULL
    OR to_regprocedure('public.tracking_assignment_v1(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Apply and review trip source import, convoy integrity and trip_workflow_completion before trip_import_recovery';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('warehouses','customer_stores') AND column_name='location_verified')<>2 THEN
    RAISE EXCEPTION 'Store and warehouse verification columns are required before trip_import_recovery';
  END IF;
END $dependencies$;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS assigned_truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_active_default_truck_unique ON public.drivers(assigned_truck_id) WHERE assigned_truck_id IS NOT NULL AND status='ACTIVE';
CREATE OR REPLACE FUNCTION public.set_trip_default_driver_v1(p_actor uuid,p_truck uuid,p_driver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('trip-workflow-master-resolution-v1',0));
  IF NOT EXISTS(SELECT 1 FROM public.trucks WHERE id=p_truck AND status='ACTIVE') OR (p_driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=p_driver AND status='ACTIVE')) THEN RAISE EXCEPTION 'Select an active truck and driver';END IF;
  UPDATE public.drivers SET assigned_truck_id=NULL WHERE assigned_truck_id=p_truck AND id IS DISTINCT FROM p_driver;
  IF p_driver IS NOT NULL THEN UPDATE public.drivers SET assigned_truck_id=p_truck WHERE id=p_driver;END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_trip_default_driver_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_default_driver_v1(uuid,uuid,uuid) TO service_role;
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS workflow_draft jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS workflow_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS workflow_outcomes jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS trip_import_batches_owner_updated_idx ON public.trip_import_batches(created_by,updated_at DESC);

CREATE OR REPLACE FUNCTION public.save_trip_import_draft_v1(p_actor uuid,p_batch uuid,p_revision bigint,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved public.trip_import_batches%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
  IF p_batch IS NULL OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740990
    OR jsonb_typeof(p_draft) IS DISTINCT FROM 'object' OR pg_column_size(p_draft)>12000000
    OR jsonb_typeof(p_draft->'files') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_draft->'plans') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_draft->'targets') IS DISTINCT FROM 'object'
    OR (p_draft->'preview' IS NOT NULL AND p_draft->'preview'<>'null'::jsonb AND
      (jsonb_typeof(p_draft->'preview') IS DISTINCT FROM 'object' OR jsonb_typeof(p_draft->'preview'->'rows') IS DISTINCT FROM 'array')) THEN
    RAISE EXCEPTION 'Invalid import draft';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('trip-source-import-v1',0));
  INSERT INTO public.trip_import_batches(id,created_by) VALUES(p_batch,p_actor) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.trip_import_batches WHERE id=p_batch AND created_by=p_actor) THEN RAISE EXCEPTION 'Import batch belongs to another user' USING ERRCODE='42501';END IF;
  -- Finalization locks its group first. Hold the same rows while comparing
  -- sealed plans so an autosave cannot replace a concurrently confirmed plan.
  PERFORM 1 FROM public.trip_import_groups WHERE batch_id=p_batch ORDER BY group_key FOR UPDATE;
  SELECT * INTO saved FROM public.trip_import_batches WHERE id=p_batch FOR UPDATE;
  IF saved.created_by<>p_actor THEN RAISE EXCEPTION 'Import batch belongs to another user' USING ERRCODE='42501';END IF;
  IF saved.workflow_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'This draft changed in another window. Reopen the batch before editing' USING ERRCODE='40001';END IF;
  -- After rows exist, their destination and signed source identity cannot be changed.
  IF EXISTS(SELECT 1 FROM public.trip_import_rows WHERE batch_id=p_batch) AND
    (saved.workflow_draft->'files',saved.workflow_draft->'preview',saved.workflow_draft->'targets',saved.workflow_draft->'initialTarget') IS DISTINCT FROM
    (p_draft->'files',p_draft->'preview',p_draft->'targets',p_draft->'initialTarget') THEN RAISE EXCEPTION 'Imported source rows and group destinations are immutable. Resume allocation or start a new batch';END IF;
  IF EXISTS(SELECT 1 FROM public.trip_import_groups g WHERE g.batch_id=p_batch AND g.allocation_plan IS NOT NULL AND
    g.allocation_plan IS DISTINCT FROM p_draft->'plans'->g.group_key) THEN
    RAISE EXCEPTION 'Confirmed cargo plans cannot be replaced by draft edits. Edit saved allocations in Trip details';END IF;
  UPDATE public.trip_import_batches SET workflow_draft=p_draft,workflow_revision=workflow_revision+1,updated_at=clock_timestamp() WHERE id=p_batch RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'revision',saved.workflow_revision,'updated_at',saved.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.save_trip_import_draft_v1(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_trip_import_draft_v1(uuid,uuid,bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.workflow_import_plan_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE draft jsonb;
BEGIN
  IF NEW.allocation_plan IS NOT DISTINCT FROM OLD.allocation_plan THEN RETURN NEW;END IF;
  IF OLD.allocation_plan IS NOT NULL THEN RAISE EXCEPTION 'Confirmed import plans cannot be replaced or cleared. Edit allocations in Trip details' USING ERRCODE='23514';END IF;
  SELECT workflow_draft INTO draft FROM public.trip_import_batches WHERE id=NEW.batch_id;
  IF draft IS NOT NULL AND draft<>'{}'::jsonb AND (draft->'plans'->NEW.group_key) IS DISTINCT FROM NEW.allocation_plan THEN
    RAISE EXCEPTION 'The saved cargo proposal changed. Reopen the batch and confirm its current plan before retrying' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_import_plan_guard ON public.trip_import_groups;
CREATE TRIGGER workflow_import_plan_guard BEFORE UPDATE OF allocation_plan ON public.trip_import_groups FOR EACH ROW EXECUTE FUNCTION public.workflow_import_plan_guard_v1();
REVOKE ALL ON FUNCTION public.workflow_import_plan_guard_v1() FROM PUBLIC,anon,authenticated;

-- Only definite overlapping active schedules reserve a resource. Undated PLANNED
-- trips remain explicitly unreserved; historical terminal trips never block work.
CREATE OR REPLACE FUNCTION public.assert_trip_resource_schedule_v1(p_trip uuid,p_truck uuid,p_driver uuid,p_assignment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.assert_trip_resource_schedule_v1(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_trip_resource_schedule_v1(uuid,uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.workflow_assignment_schedule_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.trip_id,NEW.truck_id,NEW.driver_id,NEW.unassigned_at) IS NOT DISTINCT FROM (OLD.trip_id,OLD.truck_id,OLD.driver_id,OLD.unassigned_at) THEN RETURN NEW;END IF;
  IF NEW.unassigned_at IS NULL THEN PERFORM public.assert_trip_resource_schedule_v1(NEW.trip_id,NEW.truck_id,NEW.driver_id,NEW.id);END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_assignment_schedule_guard ON public.trip_truck_assignments;
CREATE TRIGGER workflow_assignment_schedule_guard BEFORE INSERT OR UPDATE OF trip_id,truck_id,driver_id,unassigned_at ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.workflow_assignment_schedule_guard_v1();
CREATE OR REPLACE FUNCTION public.workflow_trip_schedule_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE assignment record;
BEGIN
  IF (NEW.loading_date,NEW.estimated_delivery_date,NEW.status,NEW.archived_at) IS NOT DISTINCT FROM (OLD.loading_date,OLD.estimated_delivery_date,OLD.status,OLD.archived_at) THEN RETURN NEW;END IF;
  FOR assignment IN SELECT * FROM public.trip_truck_assignments WHERE trip_id=NEW.id AND unassigned_at IS NULL ORDER BY id LOOP
    PERFORM public.assert_trip_resource_schedule_v1(NEW.id,assignment.truck_id,assignment.driver_id,assignment.id);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_trip_schedule_guard ON public.trips;
CREATE TRIGGER workflow_trip_schedule_guard AFTER UPDATE OF loading_date,estimated_delivery_date,status,archived_at ON public.trips FOR EACH ROW EXECUTE FUNCTION public.workflow_trip_schedule_guard_v1();
-- Apply the same physical-unit rules to later edits in Trip details, while
-- retaining the installed capacity, version and source-total guards.
CREATE OR REPLACE FUNCTION public.workflow_cargo_ratio_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE source public.trip_line_items%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
  SELECT * INTO source FROM public.trip_line_items WHERE id=NEW.trip_line_item_id AND trip_id=NEW.trip_id;
  IF NOT FOUND OR source.quantity IS NULL OR source.cbm IS NULL OR NEW.quantity*source.cbm<>NEW.allocated_cbm*source.quantity THEN RAISE EXCEPTION 'Allocation quantity and CBM must preserve the source proportions' USING ERRCODE='23514';END IF;
  IF (NEW.quantity>0 OR NEW.allocated_cbm>0) AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations other WHERE other.trip_line_item_id=NEW.trip_line_item_id AND other.id<>NEW.id AND (other.quantity>0 OR other.allocated_cbm>0) AND (NEW.quantity<>trunc(NEW.quantity) OR other.quantity<>trunc(other.quantity))) THEN RAISE EXCEPTION 'Only whole product units may be split between trucks' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_cargo_ratio_guard ON public.trip_cargo_allocations;
CREATE TRIGGER workflow_cargo_ratio_guard BEFORE INSERT OR UPDATE OF quantity,allocated_cbm ON public.trip_cargo_allocations FOR EACH ROW EXECUTE FUNCTION public.workflow_cargo_ratio_guard_v1();
REVOKE ALL ON FUNCTION public.workflow_assignment_schedule_guard_v1(),public.workflow_trip_schedule_guard_v1(),public.workflow_cargo_ratio_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.tracking_route_context_v1(p_assignment uuid,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; points jsonb; origin jsonb; plate text; dispatch text;
BEGIN
  a:=public.tracking_assignment_v1(p_assignment,p_lock);IF a IS NULL THEN RETURN NULL;END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.trip_stops WHERE trip_id=(a->>'tripId')::uuid ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.trip_assignment_stops WHERE assignment_id=p_assignment ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.customer_stores WHERE id IN(SELECT store_id FROM public.trip_stops WHERE trip_id=(a->>'tripId')::uuid) ORDER BY id FOR SHARE;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(st.name,'Destination'),
    'latitude',CASE WHEN st.location_verified THEN st.latitude ELSE NULL END,'longitude',CASE WHEN st.location_verified THEN st.longitude ELSE NULL END)
    ORDER BY s.stop_sequence,s.id),'[]'::jsonb) INTO points
  FROM public.trip_stops s JOIN public.trip_truck_assignments ta ON ta.id=p_assignment AND ta.trip_id=s.trip_id
    LEFT JOIN public.trip_assignment_stops scope ON scope.assignment_id=ta.id AND scope.trip_stop_id=s.id
    LEFT JOIN public.customer_stores st ON st.id=s.store_id
  WHERE s.trip_id=(a->>'tripId')::uuid AND s.archived_at IS NULL AND (ta.stop_scope='ALL' OR scope.id IS NOT NULL)
    AND coalesce(scope.progress,s.delivery_status,'PENDING') NOT IN ('COMPLETED','DELIVERED','CANCELLED');
  SELECT jsonb_build_object('id','position','latitude',l.latitude,'longitude',l.longitude,'captured_at',l.captured_at,'accuracy_meters',l.accuracy_meters,'revision',l.revision) INTO origin
  FROM public.trip_tracking_locations l WHERE l.assignment_id=p_assignment AND l.profile_id=(a->>'profileId')::uuid AND l.enabled AND l.captured_at IS NOT NULL;
  SELECT tr.plate_number,t.dispatch_number INTO plate,dispatch FROM public.trip_truck_assignments ta JOIN public.trucks tr ON tr.id=ta.truck_id JOIN public.trips t ON t.id=ta.trip_id WHERE ta.id=p_assignment;
  RETURN a||jsonb_build_object('destinations',points,'origin',origin,'plate_number',plate,'dispatch_number',dispatch,'context_token',md5(jsonb_build_array(a,points)::text));
END $$;
CREATE OR REPLACE FUNCTION public.planned_route_context_v1(p_assignment uuid,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; t public.trips%ROWTYPE; w public.warehouses%ROWTYPE; origin jsonb; points jsonb;
BEGIN
  a:=public.tracking_assignment_v1(p_assignment,p_lock);IF a IS NULL THEN RETURN NULL;END IF;
  SELECT * INTO t FROM public.trips WHERE id=(a->>'tripId')::uuid;
  IF p_lock THEN
    PERFORM 1 FROM public.trip_stops WHERE trip_id=t.id ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.trip_assignment_stops WHERE assignment_id=p_assignment ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.customer_stores WHERE id IN(SELECT store_id FROM public.trip_stops WHERE trip_id=t.id) ORDER BY id FOR SHARE;
    SELECT * INTO w FROM public.warehouses WHERE id=t.warehouse_id FOR SHARE;
  ELSE SELECT * INTO w FROM public.warehouses WHERE id=t.warehouse_id;END IF;
  origin:=jsonb_build_object('id',w.id,'latitude',CASE WHEN w.location_verified THEN w.latitude ELSE NULL END,'longitude',CASE WHEN w.location_verified THEN w.longitude ELSE NULL END);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'latitude',CASE WHEN st.location_verified THEN st.latitude ELSE NULL END,
    'longitude',CASE WHEN st.location_verified THEN st.longitude ELSE NULL END,'stopSequence',s.stop_sequence)
    ORDER BY s.stop_sequence NULLS LAST,s.id),'[]'::jsonb) INTO points
  FROM public.trip_stops s JOIN public.trip_truck_assignments ta ON ta.id=p_assignment AND ta.trip_id=s.trip_id
    LEFT JOIN public.trip_assignment_stops scope ON scope.assignment_id=ta.id AND scope.trip_stop_id=s.id
    LEFT JOIN public.customer_stores st ON st.id=s.store_id
  WHERE s.trip_id=t.id AND s.archived_at IS NULL AND (ta.stop_scope='ALL' OR scope.id IS NOT NULL);
  RETURN jsonb_build_object('id',p_assignment,'tripId',t.id,'active',t.archived_at IS NULL AND t.status NOT IN('COMPLETED','CANCELLED') AND EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id=p_assignment AND unassigned_at IS NULL),
    'origin',origin,'destinations',points,'context_token',md5(jsonb_build_array(a,t.warehouse_id,origin,points)::text));
END $$;
REVOKE ALL ON FUNCTION public.tracking_route_context_v1(uuid,boolean),public.planned_route_context_v1(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_route_context_v1(uuid,boolean),public.planned_route_context_v1(uuid,boolean) TO service_role;
-- Preserve source totals and show truck-level values in separate columns. This
-- keeps a split product's original quantity/CBM distinct from each allocation.
DO $report_allocations$
DECLARE view_name text; definition text; projection_columns integer;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['v_tms_combined','v_dispatch_report','v_trip_booking','v_trip_source_master'] LOOP
    IF to_regclass('public.'||view_name) IS NULL THEN CONTINUE;END IF;
    SELECT count(*) INTO projection_columns FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name AND column_name IN ('_cargo_allocation_id','line_allocated_quantity','line_allocated_cbm','assignment_stop_progress');
    IF projection_columns=4 THEN CONTINUE;END IF;
    IF projection_columns<>0 THEN RAISE EXCEPTION 'Review incomplete cargo projection columns on % before extending it',view_name;END IF;
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name AND column_name IN ('_assignment_id','_trip_line_item_id','_trip_stop_id'))<>3 THEN RAISE EXCEPTION 'Review physical report identities before extending %',view_name;END IF;
    SELECT rtrim(pg_get_viewdef(to_regclass('public.'||view_name),true),E';\n ') INTO definition;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT original.*,allocation.id AS _cargo_allocation_id,allocation.quantity AS line_allocated_quantity,allocation.allocated_cbm AS line_allocated_cbm,responsibility.progress AS assignment_stop_progress FROM (%s) original LEFT JOIN public.trip_cargo_allocations allocation ON allocation.assignment_id=original._assignment_id AND allocation.trip_line_item_id=original._trip_line_item_id LEFT JOIN public.trip_assignment_stops responsibility ON responsibility.assignment_id=original._assignment_id AND responsibility.trip_stop_id=original._trip_stop_id',view_name,definition);
  END LOOP;
END $report_allocations$;
NOTIFY pgrst,'reload schema';
COMMIT;
