-- RECOVERY REFERENCE ONLY. Do not execute automatically.
-- After user deletions: restore lookup records and audited NULL references first.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.trip_truck_assignments DROP CONSTRAINT trip_truck_assignments_truck_id_fkey;
ALTER TABLE public.trip_truck_assignments ALTER COLUMN truck_id SET NOT NULL;
ALTER TABLE public.trip_truck_assignments ADD CONSTRAINT trip_truck_assignments_truck_id_fkey FOREIGN KEY(truck_id) REFERENCES public.trucks(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.trip_stops DROP CONSTRAINT trip_stops_store_id_fkey;
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_store_id_fkey FOREIGN KEY(store_id) REFERENCES public.customer_stores(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.trip_line_items DROP CONSTRAINT trip_line_items_source_warehouse_id_fkey;
ALTER TABLE public.trip_line_items ADD CONSTRAINT trip_line_items_source_warehouse_id_fkey FOREIGN KEY(source_warehouse_id) REFERENCES public.warehouses(id);
CREATE OR REPLACE FUNCTION public.protect_allocated_cargo_source_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.delete_master_data_record_v1(p_resource text, p_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE target regclass; before_row jsonb; fk record; child_key text; id_att smallint; dependent boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 target:=CASE p_resource WHEN 'warehouses' THEN 'public.warehouses'::regclass
  WHEN 'trucks' THEN 'public.trucks'::regclass WHEN 'drivers' THEN 'public.drivers'::regclass
  WHEN 'trucking-companies' THEN 'public.trucking_companies'::regclass WHEN 'customers' THEN 'public.customers'::regclass
  WHEN 'stores' THEN 'public.customer_stores'::regclass WHEN 'store-contacts' THEN 'public.store_contacts'::regclass
  WHEN 'products' THEN 'public.products'::regclass ELSE NULL END;
 IF target IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Invalid master record' USING ERRCODE='22023'; END IF;
 -- FOR UPDATE prevents a concurrent reference acquiring a key-share lock after the checks.
 EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id=$1 FOR UPDATE',target) INTO before_row USING p_id;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Record not found' USING ERRCODE='P0002'; END IF;
 IF p_resource='products' AND nullif(before_row->>'photo_path','') IS NOT NULL THEN
  RAISE EXCEPTION 'Remove the product photo through Manage photo before deleting this record' USING ERRCODE='55000';
 END IF;
 SELECT attnum INTO STRICT id_att FROM pg_attribute WHERE attrelid=target AND attname='id' AND NOT attisdropped;
 FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid=target ORDER BY conrelid,conname LOOP
  -- Only existing, single-column SET NULL relationships may clear references.
  IF cardinality(fk.conkey)<>1 OR cardinality(fk.confkey)<>1 OR fk.confkey[1]<>id_att THEN
   RAISE EXCEPTION 'An unreviewed relationship prevents deletion' USING ERRCODE='55000';
  END IF;
  SELECT attname INTO STRICT child_key FROM pg_attribute WHERE attrelid=fk.conrelid AND attnum=fk.conkey[1];
  IF fk.confdeltype<>'n' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',fk.conrelid::regclass,child_key) INTO dependent USING p_id;
   IF dependent THEN
    RAISE EXCEPTION 'This record is used by other records or attachments. Clear those relationships first' USING ERRCODE='55000';
   END IF;
  END IF;
 END LOOP;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data)
 VALUES(p_actor,'DELETE_MASTER_RECORD',p_resource,p_id,before_row);
 EXECUTE format('DELETE FROM %s WHERE id=$1',target) USING p_id;
 -- Existing admin change triggers publish the confirmed lookup and reference changes.
 RETURN jsonb_build_object('id',p_id,'resource',p_resource,'deleted',true);
END $function$
;
CREATE OR REPLACE VIEW public.v_trip_assignment_totals AS  SELECT a.id AS assignment_id,
    a.trip_id,
    COALESCE(c.assigned_cbm, (0)::numeric) AS assigned_cbm,
    tr.capacity_cbm
   FROM ((trip_truck_assignments a
     JOIN trucks tr ON ((tr.id = a.truck_id)))
     LEFT JOIN ( SELECT trip_cargo_allocations.assignment_id,
            sum(trip_cargo_allocations.allocated_cbm) AS assigned_cbm
           FROM trip_cargo_allocations
          GROUP BY trip_cargo_allocations.assignment_id) c ON ((c.assignment_id = a.id)));
COMMIT;

