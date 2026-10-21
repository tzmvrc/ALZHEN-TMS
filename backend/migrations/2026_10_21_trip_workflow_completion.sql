-- PREPARED ONLY. DO NOT EXECUTE WITHOUT DATABASE APPROVAL.
-- Apply after generated references, trip_source_import and trip_convoy_integrity.
BEGIN;
ALTER TABLE public.trip_line_items ADD COLUMN IF NOT EXISTS source_warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS creation_request_id uuid;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS creation_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS trips_creation_request_unique ON public.trips(creation_request_id) WHERE creation_request_id IS NOT NULL;
ALTER TABLE public.trip_import_groups ADD COLUMN IF NOT EXISTS allocation_plan jsonb;
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS workflow_outcomes jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.trip_import_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_stores ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS location_verified_at timestamptz;
ALTER TABLE public.customer_stores ADD COLUMN IF NOT EXISTS location_verified_at timestamptz;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS location_verified_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.customer_stores ADD COLUMN IF NOT EXISTS location_verified_by uuid REFERENCES public.profiles(id);
-- Existing coordinates remain intact and unverified until an administrator reviews them.
CREATE OR REPLACE FUNCTION public.workflow_location_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.location_verified AND (NEW.latitude IS NULL OR NEW.longitude IS NULL OR NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180 OR NEW.location_verified_by IS NULL) THEN
    RAISE EXCEPTION 'Confirmed coordinates and a reviewer are required' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.address,NEW.province,NEW.city,NEW.latitude,NEW.longitude) IS DISTINCT FROM (OLD.address,OLD.province,OLD.city,OLD.latitude,OLD.longitude)
    AND NEW.location_verified_at IS NOT DISTINCT FROM OLD.location_verified_at THEN NEW.location_verified=false; END IF;
  IF NOT NEW.location_verified THEN NEW.location_verified_at=NULL;NEW.location_verified_by=NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_location_guard ON public.customer_stores;
CREATE TRIGGER workflow_location_guard BEFORE INSERT OR UPDATE ON public.customer_stores FOR EACH ROW EXECUTE FUNCTION public.workflow_location_guard_v1();
DROP TRIGGER IF EXISTS workflow_location_guard ON public.warehouses;
CREATE TRIGGER workflow_location_guard BEFORE INSERT OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.workflow_location_guard_v1();
CREATE OR REPLACE FUNCTION public.workflow_identity(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(coalesce(value,'')),'\s+',' ','g')) $$;
-- All callers (manual form, importer, master editor) share the same lock and identity rules.
-- No existing master is updated by this resolver. Ambiguity requires an explicit selection.
CREATE OR REPLACE FUNCTION public.resolve_trip_master_v1(p_kind text,p_values jsonb,p_create boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE ids uuid[]; saved jsonb; code text; model text; customer uuid; identity text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('trip-workflow-master-resolution-v1',0));
  IF p_kind='warehouses' THEN
    code:=nullif(btrim(p_values->>'code'),'');IF code IS NULL THEN RAISE EXCEPTION 'Warehouse code is required';END IF;
    SELECT array_agg(id) INTO ids FROM public.warehouses WHERE public.workflow_identity(warehouses.code)=public.workflow_identity(code);
    IF ids IS NULL AND EXISTS(SELECT 1 FROM public.warehouses WHERE public.workflow_identity(name)=public.workflow_identity(code)) THEN RAISE EXCEPTION 'Warehouse name matches an existing record. Select its warehouse identity in the preview';END IF;
  ELSIF p_kind='trucks' THEN
    code:=nullif(btrim(p_values->>'plate_number'),'');IF code IS NULL THEN RAISE EXCEPTION 'A verified plate number is required; truck name alone cannot identify a truck';END IF;
    SELECT array_agg(id) INTO ids FROM public.trucks WHERE regexp_replace(upper(plate_number),'[^A-Z0-9]','','g')=regexp_replace(upper(code),'[^A-Z0-9]','','g');
  ELSIF p_kind='customers' THEN
    code:=nullif(btrim(p_values->>'code'),'');identity:=nullif(btrim(p_values->>'name'),'');
    IF code IS NOT NULL THEN SELECT array_agg(id) INTO ids FROM public.customers WHERE public.workflow_identity(customers.code)=public.workflow_identity(code);
    ELSE SELECT array_agg(id) INTO ids FROM public.customers WHERE public.workflow_identity(name)=public.workflow_identity(identity); END IF;
  ELSIF p_kind='stores' THEN
    customer:=(p_values->>'customer_id')::uuid;code:=nullif(btrim(p_values->>'code'),'');identity:=nullif(btrim(p_values->>'name'),'');
    IF customer IS NULL OR identity IS NULL THEN RAISE EXCEPTION 'Select the customer and identify the destination';END IF;
    IF code IS NOT NULL THEN SELECT array_agg(id) INTO ids FROM public.customer_stores WHERE customer_id=customer AND public.workflow_identity(customer_stores.code)=public.workflow_identity(code);
    ELSE
      SELECT array_agg(id) INTO ids FROM public.customer_stores WHERE customer_id=customer AND public.workflow_identity(name)=public.workflow_identity(identity)
        AND (nullif(p_values->>'province','') IS NULL OR public.workflow_identity(province)=public.workflow_identity(p_values->>'province'))
        AND (nullif(p_values->>'city','') IS NULL OR public.workflow_identity(city)=public.workflow_identity(p_values->>'city'));
      IF ids IS NULL AND EXISTS(SELECT 1 FROM public.customer_stores WHERE customer_id=customer AND public.workflow_identity(name)=public.workflow_identity(identity)) THEN
        RAISE EXCEPTION 'Destination name exists with different geography. Select the correct store explicitly';
      END IF;
    END IF;
  ELSIF p_kind='products' THEN
    code:=nullif(btrim(p_values->>'sku'),'');model:=nullif(btrim(p_values->>'model_code'),'');
    IF code IS NULL AND model IS NULL THEN RAISE EXCEPTION 'SKU or a model/category identity is required';END IF;
    IF code IS NOT NULL THEN SELECT array_agg(id) INTO ids FROM public.products WHERE public.workflow_identity(sku)=public.workflow_identity(code); END IF;
    IF ids IS NULL AND model IS NOT NULL THEN SELECT array_agg(id) INTO ids FROM public.products WHERE public.workflow_identity(model_code)=public.workflow_identity(model)
      AND (nullif(p_values->>'category','') IS NULL OR public.workflow_identity(category)=public.workflow_identity(p_values->>'category')); END IF;
  ELSE RAISE EXCEPTION 'Unsupported workflow master';END IF;
  IF coalesce(array_length(ids,1),0)>1 THEN RAISE EXCEPTION 'Multiple master records match. Resolve the identity before saving';END IF;
  IF ids[1] IS NOT NULL THEN
    IF p_kind='warehouses' THEN SELECT to_jsonb(t) INTO saved FROM public.warehouses t WHERE id=ids[1];
    ELSIF p_kind='trucks' THEN SELECT to_jsonb(t) INTO saved FROM public.trucks t WHERE id=ids[1];
    ELSIF p_kind='customers' THEN SELECT to_jsonb(t) INTO saved FROM public.customers t WHERE id=ids[1];
    ELSIF p_kind='stores' THEN SELECT to_jsonb(t) INTO saved FROM public.customer_stores t WHERE id=ids[1];
    ELSE SELECT to_jsonb(t) INTO saved FROM public.products t WHERE id=ids[1];END IF;
    IF coalesce(saved->>'status','ACTIVE') IN ('INACTIVE','DISABLED','RETIRED') THEN RAISE EXCEPTION 'The matched master record is inactive'; END IF;
    RETURN saved;
  END IF;
  IF NOT p_create THEN RAISE EXCEPTION 'No verified master match. Select an existing record or allow creation';END IF;
  IF p_kind='warehouses' THEN
    INSERT INTO public.warehouses(code,name,address,province,city,latitude,longitude,status,warehouse_type,notes,region,location_verified,location_verified_at,location_verified_by) VALUES(code,coalesce(nullif(p_values->>'name',''),code),nullif(p_values->>'address',''),nullif(p_values->>'province',''),nullif(p_values->>'city',''),nullif(p_values->>'latitude','')::numeric,nullif(p_values->>'longitude','')::numeric,coalesce(nullif(p_values->>'status',''),'ACTIVE'),nullif(p_values->>'warehouse_type',''),nullif(p_values->>'notes',''),nullif(p_values->>'region',''),coalesce((p_values->>'location_verified')::boolean,false),nullif(p_values->>'location_verified_at','')::timestamptz,nullif(p_values->>'location_verified_by','')::uuid) RETURNING to_jsonb(warehouses.*) INTO saved;
  ELSIF p_kind='trucks' THEN
    INSERT INTO public.trucks(plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES(code,nullif(p_values->>'trucking_company_id','')::uuid,nullif(p_values->>'truck_type',''),nullif(p_values->>'capacity_cbm','')::numeric,coalesce(nullif(p_values->>'status',''),'ACTIVE'),nullif(p_values->>'notes','')) RETURNING to_jsonb(trucks.*) INTO saved;
  ELSIF p_kind='customers' THEN
    IF code IS NULL THEN RAISE EXCEPTION 'A customer code is needed to create a customer. Select the customer in the preview';END IF;
    INSERT INTO public.customers(code,name,status,contact_person,contact_number,email) VALUES(code,identity,coalesce(nullif(p_values->>'status',''),'ACTIVE'),nullif(p_values->>'contact_person',''),nullif(p_values->>'contact_number',''),nullif(p_values->>'email','')) RETURNING to_jsonb(customers.*) INTO saved;
  ELSIF p_kind='stores' THEN
    IF code IS NULL AND (nullif(p_values->>'province','') IS NULL OR nullif(p_values->>'city','') IS NULL) THEN RAISE EXCEPTION 'Store code or customer/name/province/city identity is required to create a destination';END IF;
    INSERT INTO public.customer_stores(customer_id,code,name,address,province,city,status,postal_code,notes,region,latitude,longitude,location_verified,location_verified_at,location_verified_by) VALUES(customer,code,identity,nullif(p_values->>'address',''),nullif(p_values->>'province',''),nullif(p_values->>'city',''),coalesce(nullif(p_values->>'status',''),'ACTIVE'),nullif(p_values->>'postal_code',''),nullif(p_values->>'notes',''),nullif(p_values->>'region',''),nullif(p_values->>'latitude','')::numeric,nullif(p_values->>'longitude','')::numeric,coalesce((p_values->>'location_verified')::boolean,false),nullif(p_values->>'location_verified_at','')::timestamptz,nullif(p_values->>'location_verified_by','')::uuid) RETURNING to_jsonb(customer_stores.*) INTO saved;
  ELSE
    INSERT INTO public.products(sku,model_code,name,category,unit_cbm,status,description,notes) VALUES(code,model,coalesce(nullif(p_values->>'name',''),model,code),nullif(p_values->>'category',''),nullif(p_values->>'unit_cbm','')::numeric,coalesce(nullif(p_values->>'status',''),'ACTIVE'),nullif(p_values->>'description',''),nullif(p_values->>'notes','')) RETURNING to_jsonb(products.*) INTO saved;
  END IF;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.resolve_trip_master_v1(text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_trip_master_v1(text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_trip_cargo_plan_v1(p_actor uuid,p_trip uuid,p_plan jsonb,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t jsonb; a jsonb; line record; assignment uuid; assignments jsonb:='{}'; qty numeric; cbm numeric; capacity numeric; driver uuid; existing_driver uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
  PERFORM 1 FROM public.trips WHERE id=p_trip AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Target trip unavailable';END IF;
  IF coalesce((p_plan->>'confirmed')::boolean,false) IS NOT TRUE OR jsonb_typeof(p_plan->'trucks') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'placements') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Confirm the cargo proposal';END IF;
  IF jsonb_array_length(p_plan->'trucks')<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_plan->'trucks')x) THEN RAISE EXCEPTION 'Duplicate truck';END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_plan->'trucks')x WHERE nullif(x->>'driverId','') IS NOT NULL)<>(SELECT count(DISTINCT x->>'driverId') FROM jsonb_array_elements(p_plan->'trucks')x WHERE nullif(x->>'driverId','') IS NOT NULL) THEN RAISE EXCEPTION 'Choose different drivers';END IF;
  IF jsonb_array_length(p_plan->'trucks')>1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'trucks')x WHERE nullif(x->>'driverId','') IS NULL) THEN RAISE EXCEPTION 'Multi-truck cargo requires a driver for every truck';END IF;
  IF jsonb_array_length(p_plan->'placements')<>(SELECT count(DISTINCT (x->>'truck_id',x->>'line_key')) FROM jsonb_array_elements(p_plan->'placements')x) THEN RAISE EXCEPTION 'Duplicate cargo placement';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_lines)x LEFT JOIN public.trip_line_items li ON li.id=x.value::uuid AND li.trip_id=p_trip WHERE li.id IS NULL) THEN RAISE EXCEPTION 'Cargo source no longer belongs to this trip';END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_plan->'trucks') LOOP
    SELECT capacity_cbm INTO capacity FROM public.trucks WHERE id=(t->>'id')::uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED','RETIRED') FOR SHARE;
    IF capacity IS NULL OR capacity<=0 THEN RAISE EXCEPTION 'Configure the selected truck maximum CBM';END IF;
    driver:=nullif(t->>'driverId','')::uuid;
    IF driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=driver AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED','RETIRED')) THEN RAISE EXCEPTION 'Selected driver is inactive';END IF;
    SELECT id,driver_id INTO assignment,existing_driver FROM public.trip_truck_assignments WHERE trip_id=p_trip AND truck_id=(t->>'id')::uuid AND unassigned_at IS NULL;
    IF assignment IS NOT NULL AND existing_driver IS DISTINCT FROM driver THEN RAISE EXCEPTION 'Truck already has a different driver in this trip';END IF;
    IF driver IS NOT NULL AND EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE trip_id=p_trip AND driver_id=driver AND unassigned_at IS NULL AND id IS DISTINCT FROM assignment) THEN RAISE EXCEPTION 'Driver already assigned to another truck in this trip';END IF;
    IF assignment IS NULL THEN
      INSERT INTO public.trip_truck_assignments(trip_id,truck_id,driver_id,assignment_type,stop_scope)
        VALUES(p_trip,(t->>'id')::uuid,driver,CASE WHEN EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE trip_id=p_trip AND unassigned_at IS NULL AND assignment_type='PRIMARY') THEN 'ADDITIONAL' ELSE 'PRIMARY' END,'SELECTED') RETURNING id INTO assignment;
    END IF;
    assignments:=assignments||jsonb_build_object(t->>'id',assignment);
  END LOOP;
  FOR line IN SELECT li.*,x.key AS source_key FROM jsonb_each_text(p_lines)x JOIN public.trip_line_items li ON li.id=x.value::uuid AND li.trip_id=p_trip LOOP
    SELECT coalesce(sum((x->>'quantity')::numeric),0),coalesce(sum((x->>'allocated_cbm')::numeric),0) INTO qty,cbm FROM jsonb_array_elements(p_plan->'placements')x WHERE x->>'line_key'=line.source_key;
    IF line.quantity IS NULL OR line.cbm IS NULL OR qty<>line.quantity OR cbm<>line.cbm THEN RAISE EXCEPTION 'Cargo allocation must equal original quantity and Total CBM';END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(p_plan->'placements') WHERE value->>'line_key'=line.source_key LOOP
      IF (a->>'quantity')::numeric=0 AND (a->>'allocated_cbm')::numeric=0 AND (line.quantity>0 OR line.cbm>0) THEN RAISE EXCEPTION 'Complete or remove empty cargo splits before confirming';END IF;
      IF (a->>'quantity')::numeric<0 OR (a->>'allocated_cbm')::numeric<0 OR (a->>'quantity')::numeric*line.cbm<>(a->>'allocated_cbm')::numeric*line.quantity THEN RAISE EXCEPTION 'Cargo quantity/CBM proportion is invalid';END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(p_plan->'placements')x WHERE x->>'line_key'=line.source_key)>1 AND (a->>'quantity')::numeric<>trunc((a->>'quantity')::numeric) THEN RAISE EXCEPTION 'Indivisible product units cannot be split';END IF;
      assignment:=(assignments->>(a->>'truck_id'))::uuid;IF assignment IS NULL THEN RAISE EXCEPTION 'Cargo truck is not selected';END IF;
      INSERT INTO public.trip_assignment_stops(trip_id,assignment_id,trip_stop_id) VALUES(p_trip,assignment,line.trip_stop_id) ON CONFLICT(assignment_id,trip_stop_id) DO NOTHING;
      -- Existing allocation triggers enforce current truck capacity and per-line totals.
      INSERT INTO public.trip_cargo_allocations(trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm,created_by,updated_by)
        VALUES(p_trip,assignment,line.id,(a->>'quantity')::numeric,(a->>'allocated_cbm')::numeric,p_actor,p_actor);
    END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'placements')x WHERE NOT (p_lines ? (x->>'line_key'))) THEN RAISE EXCEPTION 'Cargo belongs to another import or trip';END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_trip_cargo_plan_v1(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_trip_cargo_plan_v1(uuid,uuid,jsonb,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.create_trip_bundle_v2(p_actor uuid,p_request uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE details jsonb:=p_payload->'trip'; saved public.trips%ROWTYPE; trip_uuid uuid; stop_uuid uuid; product_uuid uuid;
  stop jsonb; item jsonb; truck jsonb; master jsonb; destination jsonb; customer uuid; warehouse uuid; type_id uuid;
  ref text; prefix text; ordinal bigint; line_uuid uuid; lines jsonb:='{}'; driver uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
  IF p_request IS NULL OR p_payload->>'dispatch_mode' NOT IN ('new','existing') OR jsonb_typeof(p_payload->'stops') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'assignments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid trip bundle';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('create-trip:'||p_request::text,0));
  SELECT * INTO saved FROM public.trips WHERE creation_request_id=p_request;
  IF FOUND THEN
    IF saved.created_by<>p_actor OR saved.creation_payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'This creation request has different contents. Reload the saved trip before creating another';END IF;
    RETURN to_jsonb(saved)-'creation_payload';
  END IF;
  ref:=nullif(btrim(details->>'dispatch_number'),'');
  IF p_payload->>'dispatch_mode'='existing' THEN
    IF ref IS NULL OR NOT EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number=ref AND archived_at IS NULL) THEN RAISE EXCEPTION 'Select an existing dispatch';END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
    SELECT coalesce(max(trip_number),0)+1 INTO ordinal FROM public.trips WHERE dispatch_number=ref;
  ELSE
    prefix:='DISPATCH'||to_char(coalesce(nullif(details->>'loading_date','')::date,(now() AT TIME ZONE 'Asia/Manila')::date),'YYMMDD');
    PERFORM pg_advisory_xact_lock(hashtextextended(prefix,0));
    IF ref IS NULL THEN
      SELECT coalesce(max(substring(dispatch_number FROM '^DISPATCH[0-9]{6}-([0-9]+)$')::bigint),0)+1 INTO ordinal FROM public.trips WHERE dispatch_number LIKE prefix||'-%';
      ref:=prefix||'-'||ordinal;
    ELSE PERFORM pg_advisory_xact_lock(hashtextextended(ref,0)); END IF;
    IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number=ref) THEN RAISE EXCEPTION 'Dispatch already exists. Choose Add to existing dispatch';END IF;
    ordinal:=1;
  END IF;
  warehouse:=nullif(details->>'warehouse_id','')::uuid;
  IF warehouse IS NULL AND nullif(details->>'new_warehouse_code','') IS NOT NULL THEN master:=public.resolve_trip_master_v1('warehouses',jsonb_build_object('code',details->>'new_warehouse_code'),true);warehouse:=(master->>'id')::uuid;END IF;
  type_id:=nullif(details->>'trip_type_id','')::uuid;
  IF type_id IS NULL AND nullif(btrim(details->>'trip_type_name'),'') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('trip-workflow-master-resolution-v1',0));
    IF (SELECT count(*) FROM public.trip_types WHERE public.workflow_identity(name)=public.workflow_identity(details->>'trip_type_name'))>1 THEN RAISE EXCEPTION 'Trip type name is ambiguous';END IF;
    SELECT id INTO type_id FROM public.trip_types WHERE public.workflow_identity(name)=public.workflow_identity(details->>'trip_type_name');
    IF type_id IS NULL THEN INSERT INTO public.trip_types(code,name) VALUES(upper(regexp_replace(btrim(details->>'trip_type_name'),'\s+','_','g')),btrim(details->>'trip_type_name')) RETURNING id INTO type_id;END IF;
  END IF;
  INSERT INTO public.trips(dispatch_number,trip_number,warehouse_id,trip_type_id,loading_date,estimated_delivery_date,status,created_by,remarks,creation_request_id,creation_payload)
    VALUES(ref,ordinal,warehouse,type_id,nullif(details->>'loading_date','')::date,nullif(details->>'estimated_delivery_date','')::date,coalesce(nullif(details->>'status',''),'PLANNED'),p_actor,nullif(details->>'remarks',''),p_request,p_payload) RETURNING id INTO trip_uuid;
  FOR stop IN SELECT value FROM jsonb_array_elements(p_payload->'stops') LOOP
    customer:=nullif(stop->>'customer_id','')::uuid;
    destination:=stop->'destination';
    IF nullif(stop->>'store_id','') IS NOT NULL THEN
      SELECT customer_id INTO customer FROM public.customer_stores WHERE id=(stop->>'store_id')::uuid;
      IF NOT FOUND OR (nullif(stop->>'customer_id','') IS NOT NULL AND customer<>(stop->>'customer_id')::uuid) THEN RAISE EXCEPTION 'Store belongs to another customer';END IF;
      master:=jsonb_build_object('id',stop->>'store_id');
    ELSIF destination IS NOT NULL AND destination<>'null'::jsonb THEN
      IF customer IS NULL THEN master:=public.resolve_trip_master_v1('customers',jsonb_build_object('name',destination->>'customer_name','code',destination->>'customer_code'),false);customer:=(master->>'id')::uuid;END IF;
      master:=public.resolve_trip_master_v1('stores',destination||jsonb_build_object('customer_id',customer),true);
    ELSE master:='{}';END IF;
    INSERT INTO public.trip_stops(trip_id,stop_sequence,store_id,customer_id,remarks,delivery_status)
      VALUES(trip_uuid,(stop->>'stop_sequence')::integer,(master->>'id')::uuid,customer,nullif(stop->>'remarks',''),'PENDING') RETURNING id INTO stop_uuid;
    FOR item IN SELECT value FROM jsonb_array_elements(stop->'line_items') LOOP
      IF nullif(item->>'client_key','') IS NULL OR lines ? (item->>'client_key') THEN RAISE EXCEPTION 'Distinct cargo row identities required';END IF;
      product_uuid:=nullif(item->>'product_id','')::uuid;
      IF product_uuid IS NULL AND nullif(item->>'new_product_code','') IS NOT NULL THEN
        master:=public.resolve_trip_master_v1('products',jsonb_build_object('sku',item->>'new_product_code','model_code',item->>'new_product_code','category',item->>'new_product_category','unit_cbm',item->>'unit_cbm'),true);product_uuid:=(master->>'id')::uuid;
      END IF;
      warehouse:=NULL;
      IF nullif(item->>'source_warehouse','') IS NOT NULL THEN
        SELECT id INTO warehouse FROM public.warehouses WHERE id=nullif(details->>'warehouse_id','')::uuid AND (public.workflow_identity(code)=public.workflow_identity(item->>'source_warehouse') OR public.workflow_identity(name)=public.workflow_identity(item->>'source_warehouse'));
        IF warehouse IS NULL THEN master:=public.resolve_trip_master_v1('warehouses',jsonb_build_object('code',item->>'source_warehouse'),true);warehouse:=(master->>'id')::uuid;END IF;
      END IF;
      INSERT INTO public.trip_line_items(trip_id,trip_stop_id,product_id,customer_model,quantity,cbm,dr_number,sap_so_number,customer_po_number,internal_po_number,remarks,
        sp_reference,ph_truck_reference,dn_reference,order_item_number,so_number,stock_quantity,unit_cbm,so_approval_date,item_status,source_warehouse,source_product_category,source_province,source_city,source_warehouse_id)
      VALUES(trip_uuid,stop_uuid,product_uuid,nullif(item->>'customer_model',''),nullif(item->>'quantity','')::numeric,nullif(item->>'cbm','')::numeric,nullif(item->>'dr_number',''),nullif(item->>'sap_so_number',''),nullif(item->>'customer_po_number',''),nullif(item->>'internal_po_number',''),nullif(item->>'remarks',''),
        nullif(item->>'sp_reference',''),nullif(item->>'ph_truck_reference',''),nullif(item->>'dn_reference',''),nullif(item->>'order_item_number',''),nullif(item->>'so_number',''),nullif(item->>'stock_quantity','')::numeric,nullif(item->>'unit_cbm','')::numeric,nullif(item->>'so_approval_date','')::timestamp,nullif(item->>'item_status',''),nullif(item->>'source_warehouse',''),nullif(item->>'source_product_category',''),nullif(item->>'source_province',''),nullif(item->>'source_city',''),warehouse) RETURNING id INTO line_uuid;
      lines:=lines||jsonb_build_object(item->>'client_key',line_uuid);
    END LOOP;
  END LOOP;
  IF p_payload->'cargo_plan' IS NOT NULL AND p_payload->'cargo_plan'<>'null'::jsonb THEN
    IF (SELECT jsonb_agg(x->>'truck_id' ORDER BY x->>'truck_id') FROM jsonb_array_elements(p_payload->'assignments')x)
      IS DISTINCT FROM (SELECT jsonb_agg(x->>'id' ORDER BY x->>'id') FROM jsonb_array_elements(p_payload->'cargo_plan'->'trucks')x) THEN RAISE EXCEPTION 'Cargo trucks differ from selected assignments';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'assignments')a JOIN jsonb_array_elements(p_payload->'cargo_plan'->'trucks')t ON t->>'id'=a->>'truck_id' WHERE nullif(a->>'driver_id','') IS DISTINCT FROM nullif(t->>'driverId','')) THEN RAISE EXCEPTION 'Cargo drivers differ from selected drivers';END IF;
    PERFORM public.apply_trip_cargo_plan_v1(p_actor,trip_uuid,p_payload->'cargo_plan',lines);
  ELSE
    FOR truck IN SELECT value FROM jsonb_array_elements(p_payload->'assignments') LOOP
      driver:=nullif(truck->>'driver_id','')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.trucks WHERE id=(truck->>'truck_id')::uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED','RETIRED')) THEN RAISE EXCEPTION 'Selected truck unavailable';END IF;
      IF driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=driver AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED','RETIRED')) THEN RAISE EXCEPTION 'Selected driver unavailable';END IF;
      INSERT INTO public.trip_truck_assignments(trip_id,truck_id,driver_id,assignment_type) VALUES(trip_uuid,(truck->>'truck_id')::uuid,driver,truck->>'assignment_type');
    END LOOP;
  END IF;
  SELECT * INTO saved FROM public.trips WHERE id=trip_uuid;RETURN to_jsonb(saved)-'creation_payload';
END $$;
REVOKE ALL ON FUNCTION public.create_trip_bundle_v2(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_bundle_v2(uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_trip_import_cargo_v1(p_actor uuid,p_batch uuid,p_group text,p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.trip_import_groups%ROWTYPE; lines jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.trip_import_batches WHERE id=p_batch AND created_by=p_actor) THEN RAISE EXCEPTION 'Import batch unavailable';END IF;
  SELECT * INTO target FROM public.trip_import_groups WHERE batch_id=p_batch AND group_key=p_group FOR UPDATE;
  IF NOT FOUND OR target.trip_id IS NULL THEN RAISE EXCEPTION 'Import product rows before assigning their cargo';END IF;
  IF target.allocation_plan IS NOT NULL THEN
    IF target.allocation_plan IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'Cargo already confirmed. Edit it in Trip details instead';END IF;
    RETURN jsonb_build_object('trip_id',target.trip_id,'already_confirmed',true);
  END IF;
  SELECT coalesce(jsonb_object_agg(r.source_identity,r.line_item_id),'{}'::jsonb) INTO lines FROM public.trip_import_rows r
    JOIN public.trip_line_items li ON li.id=r.line_item_id AND li.trip_id=target.trip_id
    WHERE r.batch_id=p_batch AND r.group_key=p_group AND r.status='imported';
  IF EXISTS(SELECT 1 FROM public.trip_import_rows WHERE batch_id=p_batch AND group_key=p_group AND status='failed') THEN RAISE EXCEPTION 'Resolve failed product rows before confirming group cargo';END IF;
  IF target.target->>'mode'='trip' THEN
    IF EXISTS(SELECT 1 FROM public.trips t WHERE t.id=target.trip_id AND
      ((nullif(p_plan->'schedule'->>'loading_date','') IS NOT NULL AND t.loading_date IS DISTINCT FROM (p_plan->'schedule'->>'loading_date')::date)
      OR (nullif(p_plan->'schedule'->>'estimated_delivery_date','') IS NOT NULL AND t.estimated_delivery_date IS DISTINCT FROM (p_plan->'schedule'->>'estimated_delivery_date')::date))) THEN
      RAISE EXCEPTION 'Existing trip schedule differs. Edit its dates in Trip details before resuming allocation';END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.trips t WHERE t.id=target.trip_id AND
      ((t.loading_date IS NOT NULL AND t.loading_date IS DISTINCT FROM nullif(p_plan->'schedule'->>'loading_date','')::date)
      OR (t.estimated_delivery_date IS NOT NULL AND t.estimated_delivery_date IS DISTINCT FROM nullif(p_plan->'schedule'->>'estimated_delivery_date','')::date))) THEN
      RAISE EXCEPTION 'Trip dates changed after import. Review its current schedule before resuming';END IF;
    UPDATE public.trips SET loading_date=nullif(p_plan->'schedule'->>'loading_date','')::date,estimated_delivery_date=nullif(p_plan->'schedule'->>'estimated_delivery_date','')::date WHERE id=target.trip_id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.trips WHERE id=target.trip_id AND (loading_date IS NULL OR estimated_delivery_date IS NULL)) AND NOT coalesce((p_plan->'schedule'->>'unreserved_confirmed')::boolean,false) THEN RAISE EXCEPTION 'Confirm an unreserved planned assignment or complete the trip schedule';END IF;
  PERFORM public.apply_trip_cargo_plan_v1(p_actor,target.trip_id,p_plan,lines);
  UPDATE public.trip_import_groups SET allocation_plan=p_plan WHERE batch_id=p_batch AND group_key=p_group;
  RETURN jsonb_build_object('trip_id',target.trip_id,'already_confirmed',false);
END $$;
REVOKE ALL ON FUNCTION public.finalize_trip_import_cargo_v1(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_trip_import_cargo_v1(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.import_trip_source_rows_v2(
  p_batch uuid, p_creator uuid, p_group text, p_target jsonb, p_rows jsonb, p_verified boolean DEFAULT false, p_locations jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  r jsonb; v jsonb; previous public.trip_import_rows%ROWTYPE;
  trip_uuid uuid; customer_uuid uuid; store_uuid uuid; stop_uuid uuid; line_uuid uuid;
  saved_target jsonb; matches uuid[]; ref text; prefix text; ordinal bigint;
  results jsonb := '[]'::jsonb; error_text text;
  customer_cache jsonb := '{}'; store_cache jsonb := '{}'; stop_cache jsonb := '{}';
  customer_key text; store_key text; stop_key text;
  location jsonb; master jsonb; product_uuid uuid; warehouse_uuid uuid;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
    OR p_target->>'mode' NOT IN ('new','dispatch','trip') OR nullif(btrim(p_group),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid source import chunk';
  END IF;
  -- Import only: serializes idempotency checks, missing master creation and generated dispatch numbers.
  -- Cargo is finalized separately after every source chunk succeeds. Existing stop progress is preserved.
  PERFORM pg_advisory_xact_lock(hashtextextended('trip-source-import-v1',0));
  INSERT INTO public.trip_import_batches(id,created_by) VALUES(p_batch,p_creator) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.trip_import_batches WHERE id=p_batch AND created_by=p_creator) THEN
    RAISE EXCEPTION 'Import batch belongs to another user';
  END IF;
  SELECT trip_id,target INTO trip_uuid,saved_target FROM public.trip_import_groups WHERE batch_id=p_batch AND group_key=p_group;
  IF FOUND AND saved_target IS DISTINCT FROM p_target THEN RAISE EXCEPTION 'Do not change the destination of an import group after saving. Start a new batch.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO previous FROM public.trip_import_rows WHERE source_identity=r->>'source_identity';
    IF FOUND AND previous.status='imported' THEN
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','skipped','line_item_id',previous.line_item_id,'original_batch_id',previous.batch_id,
        'trip_id',(SELECT trip_id FROM public.trip_line_items WHERE id=previous.line_item_id),
        'trip_created',previous.batch_id=p_batch AND EXISTS(SELECT 1 FROM public.trip_import_groups g WHERE g.batch_id=p_batch AND g.group_key=previous.group_key AND g.target->>'mode'<>'trip')));
      CONTINUE;
    END IF;
    BEGIN
      IF NOT p_verified AND EXISTS(SELECT 1 FROM public.trip_import_rows WHERE fingerprint=r->>'fingerprint' AND status='imported' AND document_hash<>r->>'document_hash') THEN
        RAISE EXCEPTION 'Potential duplicate in a different file. Verify this match before creating another line.';
      END IF;
      v := r->'values';
      IF NOT p_verified AND v->>'dr_number' IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.trip_line_items li LEFT JOIN public.trip_import_rows old_source ON old_source.line_item_id=li.id
        WHERE li.dr_number=v->>'dr_number' AND li.customer_model=v->>'customer_model'
          AND (li.order_item_number IS NULL OR v->>'order_item_number' IS NULL OR li.order_item_number=v->>'order_item_number')
          AND (li.sp_reference IS NULL OR v->>'sp_reference' IS NULL OR li.sp_reference=v->>'sp_reference')
          AND (li.dn_reference IS NULL OR v->>'dn_reference' IS NULL OR li.dn_reference=v->>'dn_reference')
          AND (old_source.document_hash IS NULL OR old_source.document_hash<>r->>'document_hash')
      ) THEN RAISE EXCEPTION 'Potential match to existing cargo. Verify before creating a separate product line.'; END IF;
      IF nullif(v->>'customer_name','') IS NULL OR nullif(v->>'ship_to','') IS NULL THEN RAISE EXCEPTION 'Customer Name and Ship To require mapping'; END IF;

      location:=coalesce(p_locations->(r->>'source_identity'),'{}'::jsonb);
      customer_uuid:=nullif(location->>'customer_id','')::uuid;
      store_uuid:=nullif(location->>'store_id','')::uuid;
      IF store_uuid IS NOT NULL THEN
        SELECT customer_id INTO customer_uuid FROM public.customer_stores WHERE id=store_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED');
        IF NOT FOUND OR (nullif(location->>'customer_id','') IS NOT NULL AND customer_uuid<>(location->>'customer_id')::uuid) THEN RAISE EXCEPTION 'Selected store/customer identity does not match';END IF;
      END IF;
      IF customer_uuid IS NULL THEN
        master:=public.resolve_trip_master_v1('customers',jsonb_build_object('name',v->>'customer_name','code',location->>'customer_code'),coalesce((p_target->>'allow_create')::boolean,false));customer_uuid:=(master->>'id')::uuid;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=customer_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED')) THEN RAISE EXCEPTION 'Customer unavailable';END IF;
      customer_key:=customer_uuid::text;store_key:=jsonb_build_array(customer_uuid,v->>'ship_to',v->>'province',v->>'city',store_uuid)::text;
      IF store_uuid IS NULL THEN
        master:=public.resolve_trip_master_v1('stores',jsonb_build_object('customer_id',customer_uuid,'name',v->>'ship_to','code',location->>'store_code','province',coalesce(nullif(location->>'province',''),v->>'province'),'city',coalesce(nullif(location->>'city',''),v->>'city')),coalesce((p_target->>'allow_create')::boolean,false));store_uuid:=(master->>'id')::uuid;
      END IF;
      warehouse_uuid:=NULL;product_uuid:=NULL;
      IF nullif(v->>'source_warehouse','') IS NOT NULL THEN
        warehouse_uuid:=nullif(p_target->'warehouse_ids'->>(v->>'source_warehouse'),'')::uuid;
        IF warehouse_uuid IS NOT NULL THEN IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED')) THEN RAISE EXCEPTION 'Selected warehouse is unavailable';END IF;
        ELSE master:=public.resolve_trip_master_v1('warehouses',jsonb_build_object('code',v->>'source_warehouse'),coalesce((p_target->>'allow_create')::boolean,false));warehouse_uuid:=(master->>'id')::uuid;END IF;
      END IF;
      IF nullif(v->>'customer_model','') IS NOT NULL THEN
        master:=public.resolve_trip_master_v1('products',jsonb_build_object('model_code',v->>'customer_model','category',v->>'product_category','unit_cbm',v->>'unit_cbm'),coalesce((p_target->>'allow_create')::boolean,false));product_uuid:=(master->>'id')::uuid;
      END IF;
      IF coalesce((location->>'verified')::boolean,false) THEN
        IF nullif(location->>'address','') IS NULL OR nullif(location->>'province','') IS NULL OR nullif(location->>'city','') IS NULL OR nullif(location->>'latitude','') IS NULL OR nullif(location->>'longitude','') IS NULL THEN RAISE EXCEPTION 'Complete the proposed address/geography/pin before confirming';END IF;
        IF EXISTS(SELECT 1 FROM public.customer_stores WHERE id=store_uuid AND location_verified AND (latitude,longitude,province,city) IS DISTINCT FROM ((location->>'latitude')::numeric,(location->>'longitude')::numeric,location->>'province',location->>'city')) AND NOT coalesce((location->>'replace_verified')::boolean,false) THEN RAISE EXCEPTION 'Existing verified location conflicts. Explicit administrator review is required';END IF;
        UPDATE public.customer_stores SET address=location->>'address',province=location->>'province',city=location->>'city',latitude=(location->>'latitude')::numeric,longitude=(location->>'longitude')::numeric,location_verified=true,location_verified_at=clock_timestamp(),location_verified_by=p_creator WHERE id=store_uuid;
      END IF;
      IF trip_uuid IS NULL THEN
        IF p_target->>'mode'='trip' THEN
          SELECT id INTO trip_uuid FROM public.trips WHERE id=(p_target->>'value')::uuid AND archived_at IS NULL;
          IF trip_uuid IS NULL THEN RAISE EXCEPTION 'Existing trip is unavailable'; END IF;
        ELSE
          IF p_target->>'mode'='dispatch' THEN
            ref := p_target->>'value';
            IF NOT EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number=ref AND archived_at IS NULL) THEN RAISE EXCEPTION 'Existing dispatch is unavailable'; END IF;
            PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
            SELECT coalesce(max(trip_number),0)+1 INTO ordinal FROM public.trips WHERE dispatch_number=ref;
          ELSE
            prefix := 'DISPATCH'||to_char(now() AT TIME ZONE 'Asia/Manila','YYMMDD');
            PERFORM pg_advisory_xact_lock(hashtextextended(prefix,0));
            SELECT coalesce(max(substring(dispatch_number FROM '^DISPATCH[0-9]{6}-([0-9]+)$')::bigint),0)+1 INTO ordinal
              FROM public.trips WHERE dispatch_number LIKE prefix||'-%';
            ref := prefix||'-'||ordinal; ordinal := 1;
          END IF;
          INSERT INTO public.trips(dispatch_number,trip_number,status,created_by,remarks,warehouse_id)
            VALUES(ref,ordinal,'PLANNED',p_creator,'Source import: '||p_group,coalesce(nullif(p_target->>'origin_warehouse_id','')::uuid,warehouse_uuid)) RETURNING id INTO trip_uuid;
        END IF;
        INSERT INTO public.trip_import_groups(batch_id,group_key,trip_id,target) VALUES(p_batch,p_group,trip_uuid,p_target);
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip_uuid AND archived_at IS NULL) THEN RAISE EXCEPTION 'Target trip is unavailable'; END IF;
      -- Only reuse stops created by this same import group; never mutate an existing delivery stop.
      stop_key := jsonb_build_array(customer_uuid,store_uuid,v->>'province',v->>'city')::text;
      stop_uuid := (stop_cache->>stop_key)::uuid;
      IF stop_uuid IS NULL THEN
      SELECT li.trip_stop_id INTO stop_uuid FROM public.trip_import_rows provenance
        JOIN public.trip_line_items li ON li.id=provenance.line_item_id
        JOIN public.trip_stops stop ON stop.id=li.trip_stop_id AND stop.trip_id=trip_uuid
        WHERE provenance.batch_id=p_batch AND provenance.group_key=p_group AND provenance.status='imported'
          AND stop.customer_id=customer_uuid AND stop.store_id=store_uuid
          AND provenance.source_values->>'province' IS NOT DISTINCT FROM v->>'province'
          AND provenance.source_values->>'city' IS NOT DISTINCT FROM v->>'city'
        ORDER BY stop.stop_sequence LIMIT 1;
      IF stop_uuid IS NULL THEN
        INSERT INTO public.trip_stops(trip_id,stop_sequence,customer_id,store_id,delivery_status)
          SELECT trip_uuid,coalesce(max(stop_sequence),0)+1,customer_uuid,store_uuid,'PENDING'
          FROM public.trip_stops WHERE trip_id=trip_uuid RETURNING id INTO stop_uuid;
      END IF;
      END IF;
      INSERT INTO public.trip_line_items(trip_id,trip_stop_id,product_id,source_warehouse_id,customer_model,quantity,cbm,dr_number,sap_so_number,customer_po_number,internal_po_number,
        sp_reference,ph_truck_reference,dn_reference,order_item_number,so_number,stock_quantity,unit_cbm,so_approval_date,item_status,
        source_warehouse,source_product_category,source_province,source_city)
      VALUES(trip_uuid,stop_uuid,product_uuid,warehouse_uuid,v->>'customer_model',(v->>'quantity')::numeric,(v->>'cbm')::numeric,v->>'dr_number',v->>'sap_so_number',v->>'customer_po_number',v->>'internal_po_number',
        v->>'sp_reference',v->>'ph_truck_reference',v->>'dn_reference',v->>'order_item_number',v->>'so_number',(v->>'stock_quantity')::numeric,(v->>'unit_cbm')::numeric,
        (v->>'so_approval_date')::timestamp,v->>'item_status',v->>'source_warehouse',v->>'product_category',v->>'province',v->>'city') RETURNING id INTO line_uuid;
      INSERT INTO public.trip_import_rows(source_identity,document_hash,fingerprint,batch_id,filename,source_row,group_key,source_values,status,line_item_id)
        VALUES(r->>'source_identity',r->>'document_hash',r->>'fingerprint',p_batch,r->>'filename',(r->>'line')::integer,p_group,v||jsonb_build_object('__unmapped_columns',coalesce(r->'unmapped','{}'::jsonb),'__original_cells',coalesce(r->'original_values','{}'::jsonb)),'imported',line_uuid)
        ON CONFLICT(source_identity) DO UPDATE SET status='imported',line_item_id=excluded.line_item_id,error_details=NULL,
          batch_id=excluded.batch_id,group_key=excluded.group_key,imported_at=now();
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','imported','line_item_id',line_uuid,'trip_id',trip_uuid,'trip_created',p_target->>'mode'<>'trip'));
      customer_cache := customer_cache||jsonb_build_object(customer_key,customer_uuid);
      store_cache := store_cache||jsonb_build_object(store_key,store_uuid);
      stop_cache := stop_cache||jsonb_build_object(stop_key,stop_uuid);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_text=MESSAGE_TEXT;
      -- The row subtransaction rolls back its trip, stop and master inserts together.
      SELECT trip_id INTO trip_uuid FROM public.trip_import_groups WHERE batch_id=p_batch AND group_key=p_group;
      customer_cache := '{}'; store_cache := '{}'; stop_cache := '{}';
      INSERT INTO public.trip_import_rows(source_identity,document_hash,fingerprint,batch_id,filename,source_row,group_key,source_values,status,error_details)
        VALUES(r->>'source_identity',r->>'document_hash',r->>'fingerprint',p_batch,r->>'filename',(r->>'line')::integer,p_group,r->'values','failed',error_text)
        ON CONFLICT(source_identity) DO UPDATE SET status='failed',error_details=excluded.error_details WHERE trip_import_rows.status<>'imported';
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','failed','error',error_text));
    END;
    stop_uuid := NULL;
  END LOOP;
  -- Retain acknowledgements (including skipped rows from earlier batches) so a
  -- reopened batch resumes without resubmitting its completed source chunks.
  UPDATE public.trip_import_batches SET workflow_outcomes=workflow_outcomes||coalesce((SELECT jsonb_object_agg(entry->>'source_identity',entry) FROM jsonb_array_elements(results) entry),'{}'::jsonb),updated_at=clock_timestamp() WHERE id=p_batch;
  RETURN jsonb_build_object('batch_id',p_batch,'rows',results);
END; $$;
REVOKE ALL ON FUNCTION public.import_trip_source_rows_v2(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_source_rows_v2(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) TO service_role;



-- Guards future writes without deleting or merging historical assignments.
CREATE OR REPLACE FUNCTION public.workflow_assignment_driver_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.unassigned_at IS NOT NULL OR NEW.driver_id IS NULL THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND (NEW.trip_id,NEW.driver_id,NEW.truck_id,NEW.unassigned_at) IS NOT DISTINCT FROM (OLD.trip_id,OLD.driver_id,OLD.truck_id,OLD.unassigned_at) THEN RETURN NEW;END IF;
  PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE trip_id=NEW.trip_id AND driver_id=NEW.driver_id AND unassigned_at IS NULL AND id<>NEW.id) THEN RAISE EXCEPTION 'Driver already assigned to another active truck in this trip' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workflow_assignment_driver_guard ON public.trip_truck_assignments;
CREATE TRIGGER workflow_assignment_driver_guard BEFORE INSERT OR UPDATE ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.workflow_assignment_driver_guard_v1();
-- Review existing duplicate identifiers before approval; these indexes intentionally do not merge history.
CREATE UNIQUE INDEX IF NOT EXISTS workflow_warehouse_code_unique ON public.warehouses(public.workflow_identity(code)) WHERE nullif(btrim(code),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_customer_code_unique ON public.customers(public.workflow_identity(code)) WHERE nullif(btrim(code),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_product_sku_unique ON public.products(public.workflow_identity(sku)) WHERE nullif(btrim(sku),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_store_code_unique ON public.customer_stores(customer_id,public.workflow_identity(code)) WHERE nullif(btrim(code),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_truck_plate_unique ON public.trucks((regexp_replace(upper(plate_number),'[^A-Z0-9]','','g'))) WHERE nullif(btrim(plate_number),'') IS NOT NULL;

-- Update already-installed routing contexts in place. No route is calculated here.
DO $review_routes$
DECLARE procedure_name text; definition text;
BEGIN
  FOREACH procedure_name IN ARRAY ARRAY['public.tracking_route_context_v1(uuid,boolean)','public.planned_route_context_v1(uuid,boolean)'] LOOP
    IF to_regprocedure(procedure_name) IS NULL THEN CONTINUE;END IF;
    SELECT pg_get_functiondef(to_regprocedure(procedure_name)) INTO definition;
    IF position('location_verified' IN definition)>0 THEN CONTINUE;END IF;
    definition:=replace(definition,'''latitude'',st.latitude,''longitude'',st.longitude','''latitude'',CASE WHEN coalesce((to_jsonb(st)->>''location_verified'')::boolean,false) THEN st.latitude ELSE NULL END,''longitude'',CASE WHEN coalesce((to_jsonb(st)->>''location_verified'')::boolean,false) THEN st.longitude ELSE NULL END');
    definition:=replace(definition,'''latitude'',w.latitude,''longitude'',w.longitude','''latitude'',CASE WHEN coalesce((to_jsonb(w)->>''location_verified'')::boolean,false) THEN w.latitude ELSE NULL END,''longitude'',CASE WHEN coalesce((to_jsonb(w)->>''location_verified'')::boolean,false) THEN w.longitude ELSE NULL END');
    EXECUTE definition;
  END LOOP;
END $review_routes$;
NOTIFY pgrst,'reload schema';

COMMIT;
