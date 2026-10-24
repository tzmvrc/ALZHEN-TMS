-- PREPARED ONLY. Requires explicit approval before application to the connected database.
-- Minimal prerequisites for the existing source-CSV save contracts.
-- Adds two missing functions and one nullable column. Does not replace the
-- installed importer, allocator, policies, triggers or existing records.
-- Stops atomically if either function was installed since the read-only check;
-- review that definition before proceeding instead of overwriting it.
-- Based on the already prepared source recovery and trip-details proposals.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  IF to_regprocedure('public.resolve_trip_master_v1(text,jsonb,boolean)') IS NULL
     OR to_regclass('public.trip_import_rows') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trip_import_batches' AND column_name='workflow_outcomes')
  THEN RAISE EXCEPTION 'Existing source import/workflow prerequisites are missing'; END IF;
END $$;
ALTER TABLE public.trip_stops ADD COLUMN IF NOT EXISTS delivery_location jsonb;
COMMENT ON COLUMN public.trip_stops.delivery_location IS 'Trip-specific verified delivery address and coordinates; independent of the shared store location.';

CREATE FUNCTION public.import_trip_source_rows_v3(
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

CREATE FUNCTION public.import_trip_source_rows_with_details_v1(
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

NOTIFY pgrst, 'reload schema';
COMMIT;
