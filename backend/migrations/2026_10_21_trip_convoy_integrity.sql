BEGIN;
SET LOCAL lock_timeout='3s';
-- Additive: no historical assignment or cargo allocation is inferred.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid='public.trip_truck_assignments'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=2 AND pg_get_indexdef(i.indexrelid,1,true)='id' AND pg_get_indexdef(i.indexrelid,2,true)='trip_id') THEN ALTER TABLE public.trip_truck_assignments ADD CONSTRAINT convoy_assignment_trip_key UNIQUE(id,trip_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid='public.trip_stops'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=2 AND pg_get_indexdef(i.indexrelid,1,true)='id' AND pg_get_indexdef(i.indexrelid,2,true)='trip_id') THEN ALTER TABLE public.trip_stops ADD CONSTRAINT convoy_stop_trip_key UNIQUE(id,trip_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid='public.trip_line_items'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=2 AND pg_get_indexdef(i.indexrelid,1,true)='id' AND pg_get_indexdef(i.indexrelid,2,true)='trip_id') THEN ALTER TABLE public.trip_line_items ADD CONSTRAINT convoy_item_trip_key UNIQUE(id,trip_id); END IF; END $$;
ALTER TABLE public.trip_truck_assignments ADD COLUMN stop_scope text NOT NULL DEFAULT 'ALL' CHECK(stop_scope IN ('ALL','SELECTED'));
CREATE UNIQUE INDEX convoy_active_truck_once_idx ON public.trip_truck_assignments(trip_id,truck_id) WHERE unassigned_at IS NULL;
CREATE INDEX convoy_active_assignments_idx ON public.trip_truck_assignments(trip_id,id) WHERE unassigned_at IS NULL;
CREATE TABLE public.trip_assignment_stops(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL,
 assignment_id uuid NOT NULL,trip_stop_id uuid NOT NULL,
 progress text NOT NULL DEFAULT 'PENDING' CHECK(progress IN ('PENDING','IN_PROGRESS','COMPLETED')),
 collaboration_version bigint NOT NULL DEFAULT 1 CHECK(collaboration_version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assignment_id,trip_stop_id),
 FOREIGN KEY(assignment_id,trip_id) REFERENCES public.trip_truck_assignments(id,trip_id) ON DELETE CASCADE,
 FOREIGN KEY(trip_stop_id,trip_id) REFERENCES public.trip_stops(id,trip_id) ON DELETE CASCADE
);
CREATE INDEX convoy_assignment_stops_trip_idx ON public.trip_assignment_stops(trip_id,trip_stop_id);
CREATE TABLE public.trip_cargo_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL,assignment_id uuid NOT NULL,trip_line_item_id uuid NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>=0 AND quantity<'Infinity'::numeric AND quantity<>'NaN'::numeric),
 allocated_cbm numeric NOT NULL CHECK(allocated_cbm>=0 AND allocated_cbm<'Infinity'::numeric AND allocated_cbm<>'NaN'::numeric),
 collaboration_version bigint NOT NULL DEFAULT 1 CHECK(collaboration_version BETWEEN 1 AND 9007199254740991),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(assignment_id,trip_line_item_id),
 FOREIGN KEY(assignment_id,trip_id) REFERENCES public.trip_truck_assignments(id,trip_id) ON DELETE CASCADE,
 FOREIGN KEY(trip_line_item_id,trip_id) REFERENCES public.trip_line_items(id,trip_id) ON DELETE CASCADE
);
CREATE INDEX convoy_allocations_trip_idx ON public.trip_cargo_allocations(trip_id,assignment_id);
CREATE INDEX convoy_allocations_item_idx ON public.trip_cargo_allocations(trip_line_item_id);
ALTER TABLE public.trip_assignment_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_cargo_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_assignment_stops,public.trip_cargo_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.trip_assignment_stops,public.trip_cargo_allocations TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.trip_assignment_stops,public.trip_cargo_allocations TO service_role;
CREATE POLICY convoy_stops_read ON public.trip_assignment_stops FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('ADMIN','STAFF')) OR EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.id=assignment_id AND d.profile_id=auth.uid()));
CREATE POLICY convoy_cargo_read ON public.trip_cargo_allocations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('ADMIN','STAFF')) OR EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.id=assignment_id AND d.profile_id=auth.uid()));
CREATE FUNCTION public.validate_trip_cargo_allocation_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a record; line record; used_quantity numeric; used_cbm numeric; capacity numeric; truck_cbm numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.trip_id<>OLD.trip_id OR NEW.assignment_id<>OLD.assignment_id OR NEW.trip_line_item_id<>OLD.trip_line_item_id) THEN RAISE EXCEPTION 'Allocation identity cannot be moved' USING ERRCODE='23514'; END IF;
 -- All allocation/source writes serialize on this physical trip, not dispatch text.
 PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.trip_truck_assignments WHERE id=NEW.assignment_id AND trip_id=NEW.trip_id;
 IF a.unassigned_at IS NOT NULL THEN RAISE EXCEPTION 'Assignment is inactive' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT line FROM public.trip_line_items WHERE id=NEW.trip_line_item_id AND trip_id=NEW.trip_id;
 IF a.stop_scope='SELECTED' AND (line.trip_stop_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_assignment_stops WHERE assignment_id=a.id AND trip_stop_id=line.trip_stop_id)) THEN RAISE EXCEPTION 'Truck does not attend this cargo stop' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(quantity),0),coalesce(sum(allocated_cbm),0) INTO used_quantity,used_cbm FROM public.trip_cargo_allocations WHERE trip_line_item_id=line.id AND id<>NEW.id;
 IF line.quantity IS NULL OR line.cbm IS NULL OR used_quantity+NEW.quantity>line.quantity OR used_cbm+NEW.allocated_cbm>line.cbm THEN RAISE EXCEPTION 'Allocation exceeds or cannot verify source cargo' USING ERRCODE='23514'; END IF;
 SELECT capacity_cbm INTO capacity FROM public.trucks WHERE id=a.truck_id;
 SELECT coalesce(sum(allocated_cbm),0) INTO truck_cbm FROM public.trip_cargo_allocations WHERE assignment_id=a.id AND id<>NEW.id;
 IF capacity IS NULL OR capacity<=0 OR truck_cbm+NEW.allocated_cbm>capacity THEN RAISE EXCEPTION 'Allocation exceeds or cannot verify truck capacity' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN NEW.collaboration_version=OLD.collaboration_version+1; END IF;
 NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER convoy_cargo_validate BEFORE INSERT OR UPDATE ON public.trip_cargo_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_trip_cargo_allocation_v1();
CREATE FUNCTION public.protect_allocated_cargo_source_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE used_quantity numeric; used_cbm numeric;
BEGIN
 PERFORM 1 FROM public.trips WHERE id=OLD.trip_id FOR UPDATE;
 IF TG_TABLE_NAME='trip_line_items' THEN
  SELECT coalesce(sum(quantity),0),coalesce(sum(allocated_cbm),0) INTO used_quantity,used_cbm FROM public.trip_cargo_allocations WHERE trip_line_item_id=OLD.id;
  IF EXISTS(SELECT 1 FROM public.trip_cargo_allocations WHERE trip_line_item_id=OLD.id) AND (NEW.trip_id<>OLD.trip_id OR NEW.trip_stop_id IS DISTINCT FROM OLD.trip_stop_id OR NEW.quantity IS NULL OR NEW.cbm IS NULL OR NEW.quantity<used_quantity OR NEW.cbm<used_cbm) THEN RAISE EXCEPTION 'Reallocate cargo before changing its source or reducing totals' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT coalesce(sum(allocated_cbm),0) INTO used_cbm FROM public.trip_cargo_allocations WHERE assignment_id=OLD.id;
  IF EXISTS(SELECT 1 FROM public.trip_cargo_allocations WHERE assignment_id=OLD.id AND (quantity>0 OR allocated_cbm>0)) AND (NEW.trip_id<>OLD.trip_id OR NEW.unassigned_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.trucks WHERE id=NEW.truck_id AND capacity_cbm>=used_cbm)) THEN RAISE EXCEPTION 'Reallocate cargo before changing or removing this assignment' USING ERRCODE='23514'; END IF;
  IF NEW.stop_scope='SELECTED' AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id WHERE ca.assignment_id=OLD.id AND (li.trip_stop_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_assignment_stops s WHERE s.assignment_id=OLD.id AND s.trip_stop_id=li.trip_stop_id))) THEN RAISE EXCEPTION 'Truck stop scope excludes allocated cargo' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER convoy_cargo_source_guard BEFORE UPDATE ON public.trip_line_items FOR EACH ROW EXECUTE FUNCTION public.protect_allocated_cargo_source_v1();
CREATE TRIGGER convoy_assignment_source_guard BEFORE UPDATE ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.protect_allocated_cargo_source_v1();
CREATE FUNCTION public.save_trip_cargo_allocations_v1(p_actor uuid,p_trip uuid,p_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE change jsonb; existing public.trip_cargo_allocations%ROWTYPE; saved public.trip_cargo_allocations%ROWTYPE; result jsonb='[]';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid allocation batch' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Trip not found' USING ERRCODE='P0002'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_changes))<>(SELECT count(DISTINCT (x->>'assignment_id',x->>'trip_line_item_id')) FROM jsonb_array_elements(p_changes)x) THEN RAISE EXCEPTION 'Duplicate allocation targets' USING ERRCODE='22023'; END IF;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  IF jsonb_typeof(change->'expected_version') IS DISTINCT FROM 'number' OR (change->>'expected_version')::numeric NOT BETWEEN 0 AND 9007199254740991 OR (change->>'expected_version')::numeric<>trunc((change->>'expected_version')::numeric) THEN RAISE EXCEPTION 'Expected version required' USING ERRCODE='22023'; END IF;
  SELECT * INTO existing FROM public.trip_cargo_allocations WHERE assignment_id=(change->>'assignment_id')::uuid AND trip_line_item_id=(change->>'trip_line_item_id')::uuid AND trip_id=p_trip FOR UPDATE;
  IF coalesce(existing.collaboration_version,0)<>(change->>'expected_version')::bigint THEN RAISE EXCEPTION 'Allocation changed' USING ERRCODE='40001'; END IF;
  IF coalesce((change->>'remove')::boolean,false) THEN
   IF existing.id IS NULL THEN RAISE EXCEPTION 'Allocation not found' USING ERRCODE='P0002'; END IF;
   DELETE FROM public.trip_cargo_allocations WHERE id=existing.id;result=result||jsonb_build_array(jsonb_build_object('id',existing.id,'deleted',true));
   INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data) VALUES(p_actor,'DELETE','trip_cargo_allocations',existing.id,to_jsonb(existing));
  ELSE
   IF jsonb_typeof(change->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(change->'allocated_cbm') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Numeric allocation required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.trip_cargo_allocations(trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm,created_by,updated_by) VALUES(p_trip,(change->>'assignment_id')::uuid,(change->>'trip_line_item_id')::uuid,(change->>'quantity')::numeric,(change->>'allocated_cbm')::numeric,p_actor,p_actor)
   ON CONFLICT(assignment_id,trip_line_item_id) DO UPDATE SET quantity=EXCLUDED.quantity,allocated_cbm=EXCLUDED.allocated_cbm,updated_by=p_actor RETURNING * INTO saved;
   INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,CASE WHEN existing.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,'trip_cargo_allocations',saved.id,to_jsonb(existing),to_jsonb(saved));result=result||jsonb_build_array(to_jsonb(saved));
  END IF;
 END LOOP;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_trip_cargo_allocations_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_trip_cargo_allocations_v1(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.set_trip_assignment_stops_v1(p_actor uuid,p_trip uuid,p_assignment uuid,p_scope text,p_stop_ids uuid[],p_expected bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE assignment public.trip_truck_assignments%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('ALL','SELECTED') OR p_stop_ids IS NULL OR cardinality(p_stop_ids)>200 OR array_position(p_stop_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid stop scope' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT * INTO assignment FROM public.trip_truck_assignments WHERE id=p_assignment AND trip_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE='P0002'; END IF;
 IF assignment.collaboration_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Assignment changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_stop_ids)s WHERE NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=s AND trip_id=p_trip)) THEN RAISE EXCEPTION 'Stop belongs to another trip' USING ERRCODE='23514'; END IF;
 IF p_scope='SELECTED' AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id WHERE ca.assignment_id=p_assignment AND (li.trip_stop_id IS NULL OR NOT li.trip_stop_id=ANY(p_stop_ids))) THEN RAISE EXCEPTION 'Stop scope excludes allocated cargo' USING ERRCODE='23514'; END IF;
 DELETE FROM public.trip_assignment_stops WHERE assignment_id=p_assignment AND NOT trip_stop_id=ANY(p_stop_ids);
 INSERT INTO public.trip_assignment_stops(trip_id,assignment_id,trip_stop_id) SELECT p_trip,p_assignment,s FROM (SELECT DISTINCT unnest(p_stop_ids)s)u ON CONFLICT(assignment_id,trip_stop_id) DO NOTHING;
 UPDATE public.trip_truck_assignments SET stop_scope=p_scope WHERE id=p_assignment RETURNING * INTO assignment;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES(p_actor,'UPDATE','trip_assignment_stops',p_assignment,jsonb_build_object('trip_id',p_trip,'scope',p_scope,'stop_ids',p_stop_ids));RETURN to_jsonb(assignment);
END $$;
REVOKE ALL ON FUNCTION public.set_trip_assignment_stops_v1(uuid,uuid,uuid,text,uuid[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_assignment_stops_v1(uuid,uuid,uuid,text,uuid[],bigint) TO service_role;
-- Private aggregates: source cargo is counted once, independently of display rows.
CREATE VIEW public.v_trip_cargo_totals AS SELECT t.id trip_id,CASE WHEN coalesce(i.unknown_cbm,0)>0 THEN NULL ELSE coalesce(i.total_cbm,0) END total_cbm,coalesce(a.assigned_cbm,0) assigned_cbm,CASE WHEN coalesce(i.unknown_cbm,0)>0 THEN NULL ELSE coalesce(i.total_cbm,0)-coalesce(a.assigned_cbm,0) END remaining_cbm FROM public.trips t LEFT JOIN (SELECT trip_id,sum(cbm) total_cbm,count(*) FILTER(WHERE cbm IS NULL) unknown_cbm FROM public.trip_line_items GROUP BY trip_id)i ON i.trip_id=t.id LEFT JOIN (SELECT trip_id,sum(allocated_cbm) assigned_cbm FROM public.trip_cargo_allocations GROUP BY trip_id)a ON a.trip_id=t.id;
CREATE VIEW public.v_trip_assignment_totals AS SELECT a.id assignment_id,a.trip_id,coalesce(c.assigned_cbm,0) assigned_cbm,tr.capacity_cbm FROM public.trip_truck_assignments a JOIN public.trucks tr ON tr.id=a.truck_id LEFT JOIN (SELECT assignment_id,sum(allocated_cbm) assigned_cbm FROM public.trip_cargo_allocations GROUP BY assignment_id)c ON c.assignment_id=a.id;
REVOKE ALL ON public.v_trip_cargo_totals,public.v_trip_assignment_totals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_trip_cargo_totals,public.v_trip_assignment_totals TO service_role;
REVOKE ALL ON FUNCTION public.validate_trip_cargo_allocation_v1(),public.protect_allocated_cargo_source_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER admin_change_signal_trg AFTER INSERT OR UPDATE OR DELETE ON public.trip_cargo_allocations FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
CREATE TRIGGER admin_change_signal_trg AFTER INSERT OR UPDATE OR DELETE ON public.trip_assignment_stops FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
DO $$ BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_cargo_allocations,public.trip_assignment_stops; END IF;END $$;
CREATE FUNCTION public.update_assignment_stop_progress_v1(p_actor uuid,p_trip uuid,p_id uuid,p_progress text,p_expected bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row public.trip_assignment_stops%ROWTYPE; saved public.trip_assignment_stops%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 IF p_progress IS NULL OR p_progress NOT IN ('PENDING','IN_PROGRESS','COMPLETED') THEN RAISE EXCEPTION 'Invalid progress' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;SELECT * INTO before_row FROM public.trip_assignment_stops WHERE id=p_id AND trip_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment stop not found' USING ERRCODE='P0002';END IF;
 IF before_row.collaboration_version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Progress changed' USING ERRCODE='40001';END IF;
 UPDATE public.trip_assignment_stops SET progress=p_progress,collaboration_version=collaboration_version+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'UPDATE','trip_assignment_stops',p_id,to_jsonb(before_row),to_jsonb(saved));RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.update_assignment_stop_progress_v1(uuid,uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_assignment_stop_progress_v1(uuid,uuid,uuid,text,bigint) TO service_role;
CREATE FUNCTION public.protect_convoy_truck_capacity_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.trips WHERE id IN (SELECT trip_id FROM public.trip_truck_assignments WHERE truck_id=OLD.id AND unassigned_at IS NULL) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.trip_truck_assignments a JOIN public.trip_cargo_allocations c ON c.assignment_id=a.id WHERE a.truck_id=OLD.id AND a.unassigned_at IS NULL GROUP BY a.id HAVING sum(c.allocated_cbm)>coalesce(NEW.capacity_cbm,0)) THEN RAISE EXCEPTION 'Truck capacity is below allocated cargo' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_convoy_truck_capacity_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER convoy_truck_capacity_guard BEFORE UPDATE OF capacity_cbm ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.protect_convoy_truck_capacity_v1();
COMMIT;
