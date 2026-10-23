-- PREPARED ONLY. Requires explicit approval; do not execute automatically.
-- Source RPC prerequisites: existing source-import, workflow completion and recovery schema.
-- Master RPC additionally requires the previously proposed Master List schema/functions.
-- Adds two versioned RPCs; no existing function is replaced, no data is backfilled,
-- and no table, column, view, policy or record is deleted.
-- Trip details are written inside the first successful product-row subtransaction,
-- before generated trip references and schedule triggers run. Retried chunks keep
-- the original group target and never overwrite a previously created trip.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.import_trip_source_rows_with_details_v1(
  p_batch uuid, p_creator uuid, p_group text, p_target jsonb, p_rows jsonb, p_verified boolean DEFAULT false, p_locations jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  r jsonb; v jsonb; previous public.trip_import_rows%ROWTYPE;
  trip_uuid uuid; customer_uuid uuid; store_uuid uuid; stop_uuid uuid; line_uuid uuid;
  saved_target jsonb; matches uuid[]; ref text; prefix text; ordinal bigint;
  results jsonb := '[]'::jsonb; error_text text;
  customer_cache jsonb := '{}'; store_cache jsonb := '{}'; stop_cache jsonb := '{}';
  customer_key text; store_key text; stop_key text;
  location jsonb; master jsonb; product_uuid uuid; warehouse_uuid uuid; resolution_stage text; trip_details jsonb:=p_target->'trip_details'; trip_type_uuid uuid; trip_type_name text; type_matches uuid[];
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
    OR p_target->>'mode' NOT IN ('new','dispatch','trip') OR nullif(btrim(p_group),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid source import chunk';
  END IF;
  IF trip_details IS NULL OR jsonb_typeof(trip_details)<>'object' THEN RAISE EXCEPTION 'Trip details are required for this import endpoint';END IF;
  IF p_target->>'mode'='trip' THEN RAISE EXCEPTION 'Existing trip details are read-only during append';END IF;
  IF nullif(trip_details->>'loading_date','')::date > nullif(trip_details->>'estimated_delivery_date','')::date THEN RAISE EXCEPTION 'Estimated delivery cannot precede loading';END IF;
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
        'trip_reference',(SELECT to_jsonb(t)->>'trip_reference' FROM public.trips t JOIN public.trip_line_items li ON li.trip_id=t.id WHERE li.id=previous.line_item_id),
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
        trip_type_uuid:=nullif(trip_details->>'trip_type_id','')::uuid;
        trip_type_name:=nullif(btrim(trip_details->>'trip_type_name'),'');
        IF trip_type_uuid IS NOT NULL THEN
          IF NOT EXISTS(SELECT 1 FROM public.trip_types WHERE id=trip_type_uuid AND coalesce(active,true)) THEN RAISE EXCEPTION 'Choose an active trip type';END IF;
        ELSIF trip_type_name IS NOT NULL THEN
          PERFORM pg_advisory_xact_lock(hashtextextended('trip-workflow-master-resolution-v1',0));
          SELECT array_agg(id) INTO type_matches FROM public.trip_types WHERE public.workflow_identity(name)=public.workflow_identity(trip_type_name);
          IF coalesce(array_length(type_matches,1),0)>1 THEN RAISE EXCEPTION 'Trip type name is ambiguous. Select its existing identity';END IF;
          trip_type_uuid:=type_matches[1];
          IF trip_type_uuid IS NULL THEN
            INSERT INTO public.trip_types(code,name,active) VALUES(nullif(left(trim(both '_' from regexp_replace(upper(trip_type_name),'[^A-Z0-9]+','_','g')),50),''),trip_type_name,true) RETURNING id INTO trip_type_uuid;
          ELSIF NOT EXISTS(SELECT 1 FROM public.trip_types WHERE id=trip_type_uuid AND coalesce(active,true)) THEN RAISE EXCEPTION 'Trip type is inactive';END IF;
        END IF;
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
            prefix := 'DISPATCH'||to_char(coalesce(nullif(trip_details->>'loading_date','')::date,(now() AT TIME ZONE 'Asia/Manila')::date),'YYMMDD');
            PERFORM pg_advisory_xact_lock(hashtextextended(prefix,0));
            SELECT coalesce(max(substring(dispatch_number FROM '^DISPATCH[0-9]{6}-([0-9]+)$')::bigint),0)+1 INTO ordinal
              FROM public.trips WHERE dispatch_number LIKE prefix||'-%';
            ref := prefix||'-'||ordinal; ordinal := 1;
          END IF;
          INSERT INTO public.trips(dispatch_number,trip_number,status,created_by,remarks,warehouse_id,trip_type_id,loading_date,estimated_delivery_date)
            VALUES(ref,ordinal,coalesce(nullif(trip_details->>'status',''),'PLANNED'),p_creator,coalesce(nullif(trip_details->>'remarks',''),'Source import: '||p_group),coalesce(nullif(trip_details->>'origin_warehouse_id','')::uuid,nullif(p_target->>'origin_warehouse_id','')::uuid,warehouse_uuid),trip_type_uuid,nullif(trip_details->>'loading_date','')::date,nullif(trip_details->>'estimated_delivery_date','')::date) RETURNING id INTO trip_uuid;
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
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','imported','line_item_id',line_uuid,'trip_id',trip_uuid,'trip_reference',(SELECT to_jsonb(t)->>'trip_reference' FROM public.trips t WHERE t.id=trip_uuid),'trip_created',p_target->>'mode'<>'trip'));
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
REVOKE ALL ON FUNCTION public.import_trip_source_rows_with_details_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_source_rows_with_details_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.import_trip_master_rows_with_details_v1(
  p_batch uuid, p_creator uuid, p_group text, p_target jsonb, p_rows jsonb,
  p_verified boolean DEFAULT false, p_locations jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $import$
DECLARE
  outcome jsonb; acknowledgement jsonb; source_row jsonb; metadata jsonb; pair record;
  trip_uuid uuid; stop_uuid uuid; line_uuid uuid; resolved uuid; matches uuid[];
  field_name text; field_value jsonb; lookup_value text; scope_key text; seen jsonb:='{}';
  truck_uuid uuid; company_uuid uuid; assignment_uuid uuid; assignment_ids uuid[]; current_row jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_creator AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  outcome:=public.import_trip_source_rows_with_details_v1(p_batch,p_creator,p_group,p_target,p_rows,p_verified,p_locations);
  FOR acknowledgement IN SELECT value FROM jsonb_array_elements(outcome->'rows') LOOP
    IF acknowledgement->>'status'<>'imported' THEN CONTINUE; END IF;
    SELECT value INTO source_row FROM jsonb_array_elements(p_rows) WHERE value->>'source_identity'=acknowledgement->>'source_identity';
    metadata:=coalesce(source_row->'master_values','{}'::jsonb);
    line_uuid:=(acknowledgement->>'line_item_id')::uuid;
    SELECT trip_id,trip_stop_id INTO trip_uuid,stop_uuid FROM public.trip_line_items WHERE id=line_uuid;
    PERFORM 1 FROM public.trips WHERE id=trip_uuid FOR UPDATE;
    FOR pair IN SELECT key,value FROM jsonb_each(metadata) LOOP
      field_name:=pair.key; field_value:=pair.value; resolved:=NULL;
      -- Generated references remain authoritative and the originals stay in provenance.
      IF field_name IN ('dispatch_number','trip_number','plate_number','trucking_company') THEN CONTINUE; END IF;
      lookup_value:=nullif(field_value #>> '{}','');
      IF lookup_value IS NULL THEN CONTINUE; END IF;
      IF field_name='trip_type' THEN
        SELECT array_agg(id) INTO matches FROM public.trip_types WHERE lower(name)=lower(lookup_value) AND active=true;
        field_name:='trip_type_id';
      ELSIF field_name IN ('added_by_name','tms_done_by_name') THEN
        SELECT array_agg(id) INTO matches FROM public.profiles WHERE lower(trim(concat_ws(' ',first_name,last_name)))=lower(lookup_value);
        field_name:=CASE WHEN field_name='added_by_name' THEN 'created_by' ELSE 'tms_done_by' END;
      ELSIF field_name IN ('warehouse_code','ship_from') THEN
        -- WH CODE identifies the normalized warehouse; Ship From remains its label.
        IF field_name='ship_from' AND nullif(metadata->>'warehouse_code','') IS NOT NULL THEN CONTINUE; END IF;
        SELECT array_agg(id) INTO matches FROM public.warehouses WHERE (lower(code)=lower(lookup_value) OR lower(name)=lower(lookup_value)) AND upper(status::text)='ACTIVE';
        field_name:='warehouse_id';
      ELSE matches:=NULL;
      END IF;
      IF field_name IN ('trip_type_id','created_by','tms_done_by','warehouse_id') THEN
        IF coalesce(cardinality(matches),0)<>1 THEN RAISE EXCEPTION 'Master List % must match exactly one existing record: %',pair.key,lookup_value; END IF;
        resolved:=matches[1]; field_value:=to_jsonb(resolved);
      END IF;
      scope_key:=trip_uuid::text||':'||CASE
        WHEN field_name='page_no' THEN line_uuid::text
        WHEN field_name IN ('incident_date','ir_status','ir_submitted_date','backload_reason','backload_number_of_boxes','backload_comments','offload_reason','offload_number_of_boxes','finish_unloading_time','delivery_status') THEN stop_uuid::text
        WHEN field_name IN ('pod_status','pod_remarks') THEN stop_uuid::text||':'||coalesce(source_row->'values'->>'dr_number','') ELSE '' END||':'||field_name;
      IF seen ? scope_key AND seen->scope_key IS DISTINCT FROM field_value THEN RAISE EXCEPTION 'Conflicting % values share one saved record. Split the import group or correct its source rows.',pair.key; END IF;
      IF seen ? scope_key THEN CONTINUE; END IF;
      seen:=seen||jsonb_build_object(scope_key,field_value);
      -- Repeated chunks of the same batch must agree on shared metadata too.
      IF pair.key NOT IN ('page_no','dispatch_number','trip_number') AND EXISTS(
        SELECT 1 FROM public.trip_import_rows prior JOIN public.trip_line_items previous_line ON previous_line.id=prior.line_item_id
        WHERE prior.batch_id=p_batch AND prior.status='imported' AND previous_line.trip_id=trip_uuid
          AND prior.source_identity<>source_row->>'source_identity'
          AND prior.source_values->'__master_list' ? pair.key
          AND prior.source_values->'__master_list'->pair.key IS DISTINCT FROM pair.value
          AND (field_name NOT IN ('incident_date','ir_status','ir_submitted_date','backload_reason','backload_number_of_boxes','backload_comments','offload_reason','offload_number_of_boxes','finish_unloading_time','delivery_status','pod_status','pod_remarks')
            OR previous_line.trip_stop_id IS NOT DISTINCT FROM stop_uuid)
          AND (field_name NOT IN ('pod_status','pod_remarks') OR previous_line.dr_number IS NOT DISTINCT FROM source_row->'values'->>'dr_number')
      ) THEN RAISE EXCEPTION 'Conflicting % values in earlier import chunks. Review the shared record.',pair.key; END IF;
      -- Do not replace existing trip metadata when importing into an existing trip.
      IF p_target->>'mode'='trip' AND field_name IN ('remarks','request_received_at','added_to_report','letter_status','trip_type_id','warehouse_id','created_by','signed_dr_upload_date','transmittal_date','tms_date','tms_done_by','pod_ac_shipping_date','lbc_tracking_number') THEN
        SELECT to_jsonb(t) INTO current_row FROM public.trips t WHERE id=trip_uuid;
        IF nullif(current_row->>field_name,'') IS NOT NULL AND current_row->>field_name IS DISTINCT FROM field_value #>> '{}' THEN
          RAISE EXCEPTION 'Import would replace existing %. Review the trip before importing.',pair.key;
        END IF;
      END IF;
      PERFORM public.save_master_list_cell_v1(p_creator,trip_uuid,stop_uuid,line_uuid,field_name,field_value);
    END LOOP;
    -- Reuse an exact truck/company and primary assignment; never create master data
    -- or silently replace an assignment selected by another workflow.
    IF nullif(metadata->>'plate_number','') IS NOT NULL OR nullif(metadata->>'trucking_company','') IS NOT NULL THEN
      truck_uuid:=NULL; company_uuid:=NULL;
      SELECT array_agg(id) INTO assignment_ids FROM public.trip_truck_assignments WHERE trip_id=trip_uuid AND assignment_type='PRIMARY' AND unassigned_at IS NULL;
      IF coalesce(cardinality(assignment_ids),0)>1 THEN RAISE EXCEPTION 'Multiple active primary assignments need review'; END IF;
      assignment_uuid:=assignment_ids[1];
      IF assignment_uuid IS NOT NULL THEN SELECT truck_id,trucking_company_id INTO truck_uuid,company_uuid FROM public.trip_truck_assignments WHERE id=assignment_uuid; END IF;
      IF nullif(metadata->>'plate_number','') IS NOT NULL THEN
        SELECT array_agg(id) INTO matches FROM public.trucks WHERE lower(plate_number)=lower(metadata->>'plate_number');
        IF coalesce(cardinality(matches),0)<>1 THEN RAISE EXCEPTION 'Plate no. must match exactly one existing truck'; END IF;
        IF truck_uuid IS NOT NULL AND truck_uuid<>matches[1] THEN RAISE EXCEPTION 'Import would replace the assigned truck'; END IF;
        truck_uuid:=matches[1];
      END IF;
      IF nullif(metadata->>'trucking_company','') IS NOT NULL THEN
        SELECT array_agg(id) INTO matches FROM public.trucking_companies WHERE lower(name)=lower(metadata->>'trucking_company');
        IF coalesce(cardinality(matches),0)<>1 THEN RAISE EXCEPTION 'Trucker GC Name must match exactly one existing trucking company'; END IF;
        IF company_uuid IS NOT NULL AND company_uuid<>matches[1] THEN RAISE EXCEPTION 'Import would replace the assigned trucking company'; END IF;
        company_uuid:=matches[1];
      END IF;
      IF truck_uuid IS NULL THEN RAISE EXCEPTION 'Select an existing truck to import Trucker GC Name'; END IF;
      IF assignment_uuid IS NULL THEN
        INSERT INTO public.trip_truck_assignments(trip_id,truck_id,trucking_company_id,assignment_type,assigned_at)
          VALUES(trip_uuid,truck_uuid,company_uuid,'PRIMARY',now());
      ELSE UPDATE public.trip_truck_assignments SET trucking_company_id=coalesce(trucking_company_id,company_uuid) WHERE id=assignment_uuid;
      END IF;
    END IF;
    UPDATE public.trip_import_rows SET source_values=source_values||jsonb_build_object('__master_list',metadata) WHERE source_identity=source_row->>'source_identity';
  END LOOP;
  RETURN outcome;
END $import$;
REVOKE ALL ON FUNCTION public.import_trip_master_rows_with_details_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_master_rows_with_details_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
