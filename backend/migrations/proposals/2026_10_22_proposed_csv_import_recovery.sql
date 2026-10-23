-- PREPARED ONLY. DO NOT EXECUTE WITHOUT EXPLICIT DATABASE APPROVAL.
-- Requires the existing source import, workflow completion, recovery and convoy schema.
-- Adds import_trip_source_rows_v3; replaces only allocation diagnostic messages.
-- No tables/columns/policies are added or removed. No historical rows are updated
-- by applying this file. At a later user-confirmed import, an orphaned ledger row
-- can be reclaimed only for the same document/fingerprint/source identity, under
-- the existing import advisory lock. Live products are always skipped/reused.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.import_trip_source_rows_v3(
  p_batch uuid, p_creator uuid, p_group text, p_target jsonb, p_rows jsonb, p_verified boolean DEFAULT false, p_locations jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  r jsonb; v jsonb; previous public.trip_import_rows%ROWTYPE;
  trip_uuid uuid; customer_uuid uuid; store_uuid uuid; stop_uuid uuid; line_uuid uuid;
  saved_target jsonb; matches uuid[]; ref text; prefix text; ordinal bigint;
  results jsonb := '[]'::jsonb; error_text text;
  customer_cache jsonb := '{}'; store_cache jsonb := '{}'; stop_cache jsonb := '{}';
  customer_key text; store_key text; stop_key text;
  location jsonb; master jsonb; product_uuid uuid; warehouse_uuid uuid; resolution_stage text;
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
    IF FOUND AND previous.status='imported' AND EXISTS(SELECT 1 FROM public.trip_line_items li WHERE li.id=previous.line_item_id) THEN
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','skipped','line_item_id',previous.line_item_id,'original_batch_id',previous.batch_id,
        'trip_id',(SELECT trip_id FROM public.trip_line_items WHERE id=previous.line_item_id),
        'trip_created',previous.batch_id=p_batch AND EXISTS(SELECT 1 FROM public.trip_import_groups g WHERE g.batch_id=p_batch AND g.group_key=previous.group_key AND g.target->>'mode'<>'trip')));
      CONTINUE;
    END IF;
    BEGIN
      resolution_stage := 'source history';
      location:=coalesce(p_locations->(r->>'source_identity'),'{}'::jsonb);
      IF previous.status='imported' AND NOT EXISTS(SELECT 1 FROM public.trip_line_items WHERE id=previous.line_item_id) THEN
        IF coalesce((location->>'restore_missing_source')::boolean,false) IS NOT TRUE THEN
          RAISE EXCEPTION 'History has no remaining product. Explicit source-row recovery approval is required';
        END IF;
        IF nullif(location->>'restore_history_version','')::timestamptz IS DISTINCT FROM previous.imported_at THEN RAISE EXCEPTION 'Source history changed after recovery review. Review the missing product again';END IF;
        IF previous.document_hash IS DISTINCT FROM r->>'document_hash' OR previous.fingerprint IS DISTINCT FROM r->>'fingerprint' THEN
          RAISE EXCEPTION 'Recovery source identity differs from the original history. Do not create a replacement';
        END IF;
        -- No live product is changed. This row-level subtransaction rolls back
        -- the ledger transition too if any later identity or capacity step fails.
        UPDATE public.trip_import_rows SET status='failed',error_details='Explicit missing-source recovery requested'
          WHERE source_identity=r->>'source_identity' AND line_item_id IS NULL;
      END IF;
      IF NOT p_verified AND EXISTS(SELECT 1 FROM public.trip_import_rows WHERE fingerprint=r->>'fingerprint' AND status='imported' AND line_item_id IS NOT NULL AND document_hash<>r->>'document_hash') THEN
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
      resolution_stage := 'customer identity';
      IF customer_uuid IS NULL THEN
        master:=public.resolve_trip_master_v1('customers',jsonb_build_object('name',v->>'customer_name','code',location->>'customer_code'),coalesce((p_target->>'allow_create')::boolean,false));customer_uuid:=(master->>'id')::uuid;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=customer_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED')) THEN RAISE EXCEPTION 'Customer unavailable';END IF;
      customer_key:=customer_uuid::text;store_key:=jsonb_build_array(customer_uuid,v->>'ship_to',v->>'province',v->>'city',store_uuid)::text;
      resolution_stage := 'customer-scoped store identity';
      IF store_uuid IS NULL THEN
        master:=public.resolve_trip_master_v1('stores',jsonb_build_object('customer_id',customer_uuid,'name',v->>'ship_to','code',location->>'store_code','province',coalesce(nullif(location->>'province',''),v->>'province'),'city',coalesce(nullif(location->>'city',''),v->>'city')),coalesce((p_target->>'allow_create')::boolean,false));store_uuid:=(master->>'id')::uuid;
      END IF;
      resolution_stage := 'warehouse identity';
      warehouse_uuid:=NULL;product_uuid:=NULL;
      IF nullif(v->>'source_warehouse','') IS NOT NULL THEN
        warehouse_uuid:=nullif(p_target->'warehouse_ids'->>(v->>'source_warehouse'),'')::uuid;
        IF warehouse_uuid IS NOT NULL THEN IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED')) THEN RAISE EXCEPTION 'Selected warehouse is unavailable';END IF;
        ELSE master:=public.resolve_trip_master_v1('warehouses',jsonb_build_object('code',v->>'source_warehouse'),coalesce((p_target->>'allow_create')::boolean,false));warehouse_uuid:=(master->>'id')::uuid;END IF;
      END IF;
      resolution_stage := 'product model identity';
      product_uuid:=nullif(location->>'product_id','')::uuid;
      IF product_uuid IS NOT NULL THEN
        IF coalesce((location->>'product_match_confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Explicit product match must be confirmed';END IF;
        IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=product_uuid AND coalesce(status::text,'ACTIVE') NOT IN ('INACTIVE','DISABLED','RETIRED')) THEN
          RAISE EXCEPTION 'Selected product is no longer active';
        END IF;
      ELSIF nullif(v->>'customer_model','') IS NOT NULL THEN
        master:=public.resolve_trip_master_v1('products',jsonb_build_object('model_code',v->>'customer_model','category',v->>'product_category','unit_cbm',v->>'unit_cbm'),coalesce((p_target->>'allow_create')::boolean,false));product_uuid:=(master->>'id')::uuid;
      END IF;
      resolution_stage := 'reviewed destination coordinates';
      IF coalesce((location->>'verified')::boolean,false) THEN
        IF nullif(location->>'address','') IS NULL OR nullif(location->>'province','') IS NULL OR nullif(location->>'city','') IS NULL OR nullif(location->>'latitude','') IS NULL OR nullif(location->>'longitude','') IS NULL THEN RAISE EXCEPTION 'Complete the proposed address/geography/pin before confirming';END IF;
        IF EXISTS(SELECT 1 FROM public.customer_stores WHERE id=store_uuid AND location_verified AND (latitude,longitude,province,city) IS DISTINCT FROM ((location->>'latitude')::numeric,(location->>'longitude')::numeric,location->>'province',location->>'city')) AND NOT coalesce((location->>'replace_verified')::boolean,false) THEN RAISE EXCEPTION 'Existing verified location conflicts. Explicit administrator review is required';END IF;
        UPDATE public.customer_stores SET address=location->>'address',province=location->>'province',city=location->>'city',latitude=(location->>'latitude')::numeric,longitude=(location->>'longitude')::numeric,location_verified=true,location_verified_at=clock_timestamp(),location_verified_by=p_creator WHERE id=store_uuid;
      END IF;
      resolution_stage := 'trip and dispatch identity';
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
      resolution_stage := 'source product insertion';
      INSERT INTO public.trip_line_items(trip_id,trip_stop_id,product_id,source_warehouse_id,customer_model,quantity,cbm,dr_number,sap_so_number,customer_po_number,internal_po_number,
        sp_reference,ph_truck_reference,dn_reference,order_item_number,so_number,stock_quantity,unit_cbm,so_approval_date,item_status,
        source_warehouse,source_product_category,source_province,source_city)
      VALUES(trip_uuid,stop_uuid,product_uuid,warehouse_uuid,v->>'customer_model',(v->>'quantity')::numeric,(v->>'cbm')::numeric,v->>'dr_number',v->>'sap_so_number',v->>'customer_po_number',v->>'internal_po_number',
        v->>'sp_reference',v->>'ph_truck_reference',v->>'dn_reference',v->>'order_item_number',v->>'so_number',(v->>'stock_quantity')::numeric,(v->>'unit_cbm')::numeric,
        (v->>'so_approval_date')::timestamp,v->>'item_status',v->>'source_warehouse',v->>'product_category',v->>'province',v->>'city') RETURNING id INTO line_uuid;
      INSERT INTO public.trip_import_rows(source_identity,document_hash,fingerprint,batch_id,filename,source_row,group_key,source_values,status,line_item_id)
        VALUES(r->>'source_identity',r->>'document_hash',r->>'fingerprint',p_batch,r->>'filename',(r->>'line')::integer,p_group,v||jsonb_build_object('__unmapped_columns',coalesce(r->'unmapped','{}'::jsonb),'__original_cells',coalesce(r->'original_values','{}'::jsonb),'__reviewed_product_id',location->>'product_id','__product_match_confirmed',coalesce((location->>'product_match_confirmed')::boolean,false))||CASE WHEN previous.status='imported' AND previous.line_item_id IS NULL THEN jsonb_build_object('__recovery_previous_history',jsonb_build_object('batch_id',previous.batch_id,'filename',previous.filename,'source_row',previous.source_row,'imported_at',previous.imported_at,'source_values',previous.source_values)) ELSE '{}'::jsonb END,'imported',line_uuid)
        ON CONFLICT(source_identity) DO UPDATE SET status='imported',line_item_id=excluded.line_item_id,error_details=NULL,source_values=excluded.source_values,
          batch_id=excluded.batch_id,group_key=excluded.group_key,imported_at=now();
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','imported','line_item_id',line_uuid,'trip_id',trip_uuid,'trip_created',p_target->>'mode'<>'trip'));
      customer_cache := customer_cache||jsonb_build_object(customer_key,customer_uuid);
      store_cache := store_cache||jsonb_build_object(store_key,store_uuid);
      stop_cache := stop_cache||jsonb_build_object(stop_key,stop_uuid);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_text=MESSAGE_TEXT;
      error_text:=format('CSV row %s, model %s, PH %s: expected Qty %s, Total CBM %s; %s failed: %s',r->>'line',r->'values'->>'customer_model',r->'values'->>'ph_truck_reference',r->'values'->>'quantity',r->'values'->>'cbm',resolution_stage,error_text);
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
REVOKE ALL ON FUNCTION public.import_trip_source_rows_v3(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_source_rows_v3(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) TO service_role;

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
  FOR line IN SELECT li.*,x.key AS source_key,provenance.filename AS source_filename,provenance.source_row AS csv_row FROM jsonb_each_text(p_lines)x JOIN public.trip_line_items li ON li.id=x.value::uuid AND li.trip_id=p_trip LEFT JOIN public.trip_import_rows provenance ON provenance.source_identity=x.key AND provenance.line_item_id=li.id LOOP
    SELECT coalesce(sum((x->>'quantity')::numeric),0),coalesce(sum((x->>'allocated_cbm')::numeric),0) INTO qty,cbm FROM jsonb_array_elements(p_plan->'placements')x WHERE x->>'line_key'=line.source_key;
    IF line.quantity IS NULL OR line.cbm IS NULL OR qty<>line.quantity OR cbm<>line.cbm THEN RAISE EXCEPTION 'File %, CSV row %, product % (line %): expected Qty %, Total CBM %; allocated Qty %, CBM %. Allocation must equal the original source totals',line.source_filename,line.csv_row,line.customer_model,line.id,line.quantity,line.cbm,qty,cbm;END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(p_plan->'placements') WHERE value->>'line_key'=line.source_key LOOP
      IF (a->>'quantity')::numeric=0 AND (a->>'allocated_cbm')::numeric=0 AND (line.quantity>0 OR line.cbm>0) THEN RAISE EXCEPTION 'Complete or remove empty cargo splits before confirming';END IF;
      IF (a->>'quantity')::numeric<0 OR (a->>'allocated_cbm')::numeric<0 OR (a->>'quantity')::numeric*line.cbm<>(a->>'allocated_cbm')::numeric*line.quantity THEN RAISE EXCEPTION 'File %, CSV row %, product % (line %): expected Qty %, CBM %; split Qty %, CBM %. Source proportion is invalid',line.source_filename,line.csv_row,line.customer_model,line.id,line.quantity,line.cbm,a->>'quantity',a->>'allocated_cbm';END IF;
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
NOTIFY pgrst,'reload schema';
COMMIT;
