BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.trip_for_source_binding_v1(p_kind text,p_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE relation_name text; parent_id uuid;
BEGIN
 relation_name=CASE upper(p_kind) WHEN 'TRIP' THEN 'trips' WHEN 'STOP' THEN 'trip_stops' WHEN 'LINE' THEN 'trip_line_items' WHEN 'LINE_ITEM' THEN 'trip_line_items' WHEN 'ASSIGNMENT' THEN 'trip_truck_assignments' WHEN 'STORE_CALL' THEN 'store_calls' WHEN 'STORE-CALL' THEN 'store_calls' WHEN 'BILLING' THEN 'billings' WHEN 'POD' THEN 'pod_records' WHEN 'INCIDENT' THEN 'incidents' WHEN 'OFFLOAD' THEN 'offloads' WHEN 'BACKLOAD' THEN 'backloads' WHEN 'DEMURRAGE' THEN 'demurrages' WHEN 'LOADING' THEN 'loading_reports' WHEN 'UNLOADING' THEN 'unloading_reports' END;
 IF relation_name IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT %I FROM public.%I WHERE id=$1',CASE WHEN relation_name='trips' THEN 'id' ELSE 'trip_id' END,relation_name) INTO parent_id USING p_id;RETURN parent_id;
END $$;
REVOKE ALL ON FUNCTION public.trip_for_source_binding_v1(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.trip_for_formula_target_v1(p_table text,p_identity text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parts text[]=string_to_array(p_identity,':'); parent_id uuid; found_id uuid; index integer; kind text;
BEGIN
 IF p_table='transmittal-tracker' AND p_identity~*'^[0-9a-f]{8}-[0-9a-f-]{27}$' THEN RETURN public.trip_for_source_binding_v1('STOP',p_identity::uuid); END IF;
 IF parts[1]='event' THEN RETURN public.trip_for_source_binding_v1(parts[2],parts[3]::uuid); END IF;
 IF cardinality(parts)%2<>0 OR cardinality(parts)=0 THEN RETURN NULL; END IF;
 FOR index IN 1..cardinality(parts) BY 2 LOOP
  kind=parts[index];found_id=public.trip_for_source_binding_v1(kind,parts[index+1]::uuid);
  IF found_id IS NULL OR parent_id IS NOT NULL AND found_id<>parent_id THEN RETURN NULL; END IF;parent_id=found_id;
 END LOOP;RETURN parent_id;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.trip_for_formula_target_v1(text,text) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.spreadsheet_cell_formulas ADD COLUMN source_trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.flex_rows ADD COLUMN source_trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.admin_notifications ADD COLUMN trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,ADD COLUMN store_call_id uuid REFERENCES public.store_calls(id) ON DELETE CASCADE;
CREATE INDEX notification_call_idx ON public.admin_notifications(store_call_id) WHERE store_call_id IS NOT NULL;
CREATE INDEX formula_source_trip_idx ON public.spreadsheet_cell_formulas(source_trip_id) WHERE source_trip_id IS NOT NULL;
CREATE INDEX flex_source_trip_idx ON public.flex_rows(source_trip_id) WHERE source_trip_id IS NOT NULL;
CREATE INDEX notification_trip_idx ON public.admin_notifications(trip_id) WHERE trip_id IS NOT NULL;
-- Presentation metadata only. Historical unresolved bindings are retained with NULL ownership.
UPDATE public.spreadsheet_cell_formulas SET source_trip_id=public.trip_for_formula_target_v1(table_key,row_identity);
UPDATE public.flex_rows SET source_trip_id=public.trip_for_source_binding_v1(source_entity_type,source_entity_id) WHERE row_kind='SOURCE';
UPDATE public.admin_notifications SET trip_id=public.trip_for_source_binding_v1(reference_type,reference_id),store_call_id=CASE WHEN reference_type='store_call' AND EXISTS(SELECT 1 FROM public.store_calls WHERE id=reference_id) THEN reference_id END;
CREATE FUNCTION public.guard_trip_presentation_source_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parent_id uuid; parts text[]; kind text; record_id uuid; relation_name text; bound_id uuid; position integer;
BEGIN
 IF TG_TABLE_NAME='admin_notifications' THEN
  NEW.trip_id=public.trip_for_source_binding_v1(NEW.reference_type,NEW.reference_id);NEW.store_call_id=CASE WHEN NEW.reference_type='store_call' THEN NEW.reference_id END;IF NEW.trip_id IS NULL THEN RAISE EXCEPTION 'Notification source no longer exists' USING ERRCODE='23503'; END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='flex_rows' THEN
  NEW.source_trip_id=NULL;IF NEW.row_kind<>'SOURCE' THEN RETURN NEW; END IF;
  parent_id=public.trip_for_source_binding_v1(NEW.source_entity_type,NEW.source_entity_id);parts=ARRAY[NEW.source_entity_type,NEW.source_entity_id::text];
 ELSE
  parent_id=public.trip_for_formula_target_v1(NEW.table_key,NEW.row_identity);parts=string_to_array(NEW.row_identity,':');
  IF NEW.table_key='transmittal-tracker' AND cardinality(parts)=1 THEN parts=ARRAY['STOP',NEW.row_identity];END IF;
  IF parts[1]='event' THEN parts=parts[2:3];END IF;
 END IF;
 IF parent_id IS NULL THEN RAISE EXCEPTION 'Spreadsheet source is missing or ambiguous' USING ERRCODE='23503'; END IF;
 -- Lock both physical parent and exact children, like a polymorphic foreign key.
 -- A concurrent delete cannot leave a newly created source row or formula orphaned.
 PERFORM 1 FROM public.trips WHERE id=parent_id FOR KEY SHARE;
 FOR position IN 1..cardinality(parts) BY 2 LOOP
  kind=upper(parts[position]);record_id=parts[position+1]::uuid;
  relation_name=CASE kind WHEN 'TRIP' THEN 'trips' WHEN 'STOP' THEN 'trip_stops' WHEN 'LINE' THEN 'trip_line_items' WHEN 'LINE_ITEM' THEN 'trip_line_items' WHEN 'ASSIGNMENT' THEN 'trip_truck_assignments' WHEN 'STORE_CALL' THEN 'store_calls' WHEN 'STORE-CALL' THEN 'store_calls' WHEN 'BILLING' THEN 'billings' WHEN 'POD' THEN 'pod_records' WHEN 'INCIDENT' THEN 'incidents' WHEN 'OFFLOAD' THEN 'offloads' WHEN 'BACKLOAD' THEN 'backloads' WHEN 'DEMURRAGE' THEN 'demurrages' WHEN 'LOADING' THEN 'loading_reports' WHEN 'UNLOADING' THEN 'unloading_reports' END;
  IF relation_name IS NULL THEN RAISE EXCEPTION 'Unknown spreadsheet source' USING ERRCODE='23503'; END IF;
  EXECUTE format('SELECT %I FROM public.%I WHERE id=$1 FOR SHARE',CASE WHEN relation_name='trips' THEN 'id' ELSE 'trip_id' END,relation_name) INTO bound_id USING record_id;
  IF bound_id IS DISTINCT FROM parent_id THEN RAISE EXCEPTION 'Spreadsheet source was removed' USING ERRCODE='23503'; END IF;
 END LOOP;
 NEW.source_trip_id=parent_id;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_trip_presentation_source_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER formula_source_guard BEFORE INSERT OR UPDATE OF table_key,row_identity ON public.spreadsheet_cell_formulas FOR EACH ROW EXECUTE FUNCTION public.guard_trip_presentation_source_v1();
CREATE TRIGGER flexible_source_guard BEFORE INSERT OR UPDATE OF row_kind,source_entity_type,source_entity_id ON public.flex_rows FOR EACH ROW EXECUTE FUNCTION public.guard_trip_presentation_source_v1();
CREATE TRIGGER notification_source_guard BEFORE INSERT OR UPDATE OF reference_type,reference_id ON public.admin_notifications FOR EACH ROW EXECUTE FUNCTION public.guard_trip_presentation_source_v1();
CREATE FUNCTION public.guard_narrow_record_dependencies_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding text; prefix text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trips WHERE id=OLD.trip_id) THEN RETURN OLD; END IF;
 binding=CASE TG_TABLE_NAME WHEN 'trip_stops' THEN 'STOP' WHEN 'trip_line_items' THEN 'LINE_ITEM' WHEN 'trip_truck_assignments' THEN 'ASSIGNMENT' WHEN 'store_calls' THEN 'STORE_CALL' END;
 prefix=CASE TG_TABLE_NAME WHEN 'trip_stops' THEN 'stop' WHEN 'trip_line_items' THEN 'line' WHEN 'trip_truck_assignments' THEN 'assignment' WHEN 'store_calls' THEN 'store-call' END;
 IF EXISTS(SELECT 1 FROM public.flex_rows WHERE row_kind='SOURCE' AND source_entity_type=binding AND source_entity_id=OLD.id) OR EXISTS(SELECT 1 FROM public.spreadsheet_cell_formulas WHERE NOT is_deleted AND (strpos(':'||row_identity||':',':'||prefix||':'||OLD.id||':')>0 OR TG_TABLE_NAME='trip_stops' AND table_key='transmittal-tracker' AND row_identity=OLD.id::text)) THEN RAISE EXCEPTION 'Clear source-bound spreadsheet records before deleting this child record' USING ERRCODE='23503'; END IF;
 IF TG_TABLE_NAME='trip_line_items' AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations WHERE trip_line_item_id=OLD.id) OR TG_TABLE_NAME='trip_truck_assignments' AND EXISTS(SELECT 1 FROM public.trip_cargo_allocations WHERE assignment_id=OLD.id) THEN RAISE EXCEPTION 'Remove cargo allocations before deleting this child record' USING ERRCODE='23503'; END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.guard_narrow_record_dependencies_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER narrow_dependency_guard BEFORE DELETE ON public.trip_stops FOR EACH ROW EXECUTE FUNCTION public.guard_narrow_record_dependencies_v1();
CREATE TRIGGER narrow_dependency_guard BEFORE DELETE ON public.trip_line_items FOR EACH ROW EXECUTE FUNCTION public.guard_narrow_record_dependencies_v1();
CREATE TRIGGER narrow_dependency_guard BEFORE DELETE ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_narrow_record_dependencies_v1();
CREATE TRIGGER narrow_dependency_guard BEFORE DELETE ON public.store_calls FOR EACH ROW EXECUTE FUNCTION public.guard_narrow_record_dependencies_v1();
COMMIT;
