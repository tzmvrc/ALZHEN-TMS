-- PREPARED ONLY. Apply after approval. Requires generated trip references migration.
-- Adds source snapshots to individual cargo lines. Existing normalized fields and allocations are retained.
BEGIN;
ALTER TABLE public.trip_line_items
  ADD COLUMN IF NOT EXISTS sp_reference text,
  ADD COLUMN IF NOT EXISTS ph_truck_reference text,
  ADD COLUMN IF NOT EXISTS dn_reference text,
  ADD COLUMN IF NOT EXISTS order_item_number text,
  ADD COLUMN IF NOT EXISTS so_number text,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_cbm numeric,
  ADD COLUMN IF NOT EXISTS so_approval_date timestamp without time zone,
  ADD COLUMN IF NOT EXISTS item_status text,
  ADD COLUMN IF NOT EXISTS source_warehouse text,
  ADD COLUMN IF NOT EXISTS source_product_category text,
  ADD COLUMN IF NOT EXISTS source_province text,
  ADD COLUMN IF NOT EXISTS source_city text;
-- Source geography/category/warehouse snapshots belong to each imported line, not shared master data.
CREATE TABLE IF NOT EXISTS public.trip_import_batches (
  id uuid PRIMARY KEY, created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.trip_import_groups (
  batch_id uuid NOT NULL REFERENCES public.trip_import_batches(id), group_key text NOT NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL, target jsonb NOT NULL,
  PRIMARY KEY(batch_id, group_key)
);
CREATE TABLE IF NOT EXISTS public.trip_import_rows (
  source_identity text PRIMARY KEY, document_hash text NOT NULL, fingerprint text NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.trip_import_batches(id), filename text NOT NULL,
  source_row integer NOT NULL CHECK(source_row > 0), group_key text NOT NULL,
  source_values jsonb NOT NULL, status text NOT NULL CHECK(status IN ('imported','failed')),
  line_item_id uuid REFERENCES public.trip_line_items(id) ON DELETE SET NULL,
  error_details text, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_import_rows_fingerprint_idx ON public.trip_import_rows(fingerprint);
CREATE INDEX IF NOT EXISTS trip_import_rows_batch_group_idx ON public.trip_import_rows(batch_id,group_key,status);
CREATE INDEX IF NOT EXISTS trip_line_items_import_business_idx ON public.trip_line_items(dr_number,customer_model);
ALTER TABLE public.trip_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_import_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_import_batches, public.trip_import_groups, public.trip_import_rows FROM anon, authenticated;
GRANT ALL ON public.trip_import_batches, public.trip_import_groups, public.trip_import_rows TO service_role;

CREATE OR REPLACE FUNCTION public.import_trip_source_rows(
  p_batch uuid, p_creator uuid, p_group text, p_target jsonb, p_rows jsonb, p_verified boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  r jsonb; v jsonb; previous public.trip_import_rows%ROWTYPE;
  trip_uuid uuid; customer_uuid uuid; store_uuid uuid; stop_uuid uuid; line_uuid uuid;
  saved_target jsonb; matches uuid[]; ref text; prefix text; ordinal bigint;
  results jsonb := '[]'::jsonb; error_text text;
  customer_cache jsonb := '{}'; store_cache jsonb := '{}'; stop_cache jsonb := '{}';
  customer_key text; store_key text; stop_key text;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
    OR p_target->>'mode' NOT IN ('new','dispatch','trip') OR nullif(btrim(p_group),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid source import chunk';
  END IF;
  -- Import only: serializes idempotency checks, missing master creation and generated dispatch numbers.
  -- No truck assignments or existing operational values are updated by this function.
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
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','skipped','line_item_id',previous.line_item_id,'original_batch_id',previous.batch_id));
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
      -- Exact names only. Ambiguous matches must be corrected in the preview/master data.
      customer_key := lower(btrim(v->>'customer_name'));
      customer_uuid := (customer_cache->>customer_key)::uuid;
      IF customer_uuid IS NULL THEN
      SELECT array_agg(id) INTO matches FROM public.customers WHERE lower(btrim(name))=customer_key;
      IF coalesce(array_length(matches,1),0)>1 THEN RAISE EXCEPTION 'Customer Name matches multiple records'; END IF;
      customer_uuid := matches[1];
      IF customer_uuid IS NULL THEN
        IF NOT coalesce((p_target->>'allow_create')::boolean,false) THEN RAISE EXCEPTION 'Customer Name has no exact match. Confirm creation or correct the mapping'; END IF;
        INSERT INTO public.customers(name,status) VALUES(v->>'customer_name','ACTIVE') RETURNING id INTO customer_uuid;
      END IF;
      END IF;
      store_key := customer_uuid::text||':'||lower(btrim(v->>'ship_to'));
      store_uuid := (store_cache->>store_key)::uuid;
      IF store_uuid IS NULL THEN
      SELECT array_agg(id) INTO matches FROM public.customer_stores WHERE customer_id=customer_uuid AND lower(btrim(name))=lower(btrim(v->>'ship_to'));
      IF coalesce(array_length(matches,1),0)>1 THEN RAISE EXCEPTION 'Ship To matches multiple destinations for this customer'; END IF;
      store_uuid := matches[1];
      IF store_uuid IS NULL THEN
        IF NOT coalesce((p_target->>'allow_create')::boolean,false) THEN RAISE EXCEPTION 'Ship To has no exact match. Confirm creation or correct the mapping'; END IF;
        INSERT INTO public.customer_stores(customer_id,name,province,city,status)
          VALUES(customer_uuid,v->>'ship_to',v->>'province',v->>'city','ACTIVE') RETURNING id INTO store_uuid;
      END IF;
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
          INSERT INTO public.trips(dispatch_number,trip_number,status,created_by,remarks)
            VALUES(ref,ordinal,'PLANNED',p_creator,'Source import: '||p_group) RETURNING id INTO trip_uuid;
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
      INSERT INTO public.trip_line_items(trip_id,trip_stop_id,customer_model,quantity,cbm,dr_number,sap_so_number,customer_po_number,internal_po_number,
        sp_reference,ph_truck_reference,dn_reference,order_item_number,so_number,stock_quantity,unit_cbm,so_approval_date,item_status,
        source_warehouse,source_product_category,source_province,source_city)
      VALUES(trip_uuid,stop_uuid,v->>'customer_model',(v->>'quantity')::numeric,(v->>'cbm')::numeric,v->>'dr_number',v->>'sap_so_number',v->>'customer_po_number',v->>'internal_po_number',
        v->>'sp_reference',v->>'ph_truck_reference',v->>'dn_reference',v->>'order_item_number',v->>'so_number',(v->>'stock_quantity')::numeric,(v->>'unit_cbm')::numeric,
        (v->>'so_approval_date')::timestamp,v->>'item_status',v->>'source_warehouse',v->>'product_category',v->>'province',v->>'city') RETURNING id INTO line_uuid;
      INSERT INTO public.trip_import_rows(source_identity,document_hash,fingerprint,batch_id,filename,source_row,group_key,source_values,status,line_item_id)
        VALUES(r->>'source_identity',r->>'document_hash',r->>'fingerprint',p_batch,r->>'filename',(r->>'line')::integer,p_group,v||jsonb_build_object('__unmapped_columns',coalesce(r->'unmapped','{}'::jsonb)),'imported',line_uuid)
        ON CONFLICT(source_identity) DO UPDATE SET status='imported',line_item_id=excluded.line_item_id,error_details=NULL,
          batch_id=excluded.batch_id,group_key=excluded.group_key,imported_at=now();
      results := results || jsonb_build_array(jsonb_build_object('source_identity',r->>'source_identity','status','imported','line_item_id',line_uuid,'trip_id',trip_uuid));
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
  RETURN jsonb_build_object('batch_id',p_batch,'rows',results);
END; $$;
REVOKE ALL ON FUNCTION public.import_trip_source_rows(uuid,uuid,text,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_source_rows(uuid,uuid,text,jsonb,jsonb,boolean) TO service_role;

-- Extend line-granularity views by appending source fields. No joins to assignments are changed.
-- Preserve the view's complete current definition, column order, grants and dependencies.
DO $$
DECLARE view_name text; definition text; identity_column text; projections text; field text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['v_trip_booking','vw_trip_booking','v_dispatch_report','vw_dispatch_report','v_tms_combined','vw_combined_report'] LOOP
    IF to_regclass('public.'||view_name) IS NULL THEN CONTINUE; END IF;
    SELECT column_name INTO identity_column FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name AND column_name IN ('_trip_line_item_id','trip_line_item_id','line_item_id') ORDER BY CASE column_name WHEN '_trip_line_item_id' THEN 1 WHEN 'trip_line_item_id' THEN 2 ELSE 3 END LIMIT 1;
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name AND column_name=identity_column) THEN CONTINUE; END IF;
    projections := '';
    FOREACH field IN ARRAY ARRAY['sp_reference','ph_truck_reference','dn_reference','order_item_number','so_number','stock_quantity','unit_cbm','so_approval_date','item_status','source_warehouse','source_product_category','source_province','source_city'] LOOP
      IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name AND column_name=field) THEN
        projections := projections||format(', source_item.%I',field);
      END IF;
    END LOOP;
    IF projections='' THEN CONTINUE; END IF;
    SELECT rtrim(pg_get_viewdef(to_regclass('public.'||view_name),true), E';\n ') INTO definition;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT original.* %s FROM (%s) original LEFT JOIN public.trip_line_items source_item ON source_item.id=original.%I',view_name,projections,definition,identity_column);
  END LOOP;
END; $$;
-- Expand only the Master List by physical cargo line; Dispatch Monitoring retains stop rows.
CREATE OR REPLACE VIEW public.v_trip_source_master AS
SELECT master.*, li.id AS _trip_line_item_id, li.product_id AS _product_id,
  li.dr_number, li.sap_so_number, li.customer_po_number, li.internal_po_number,
  li.customer_model, li.quantity, li.cbm,
  li.sp_reference, li.ph_truck_reference, li.dn_reference, li.order_item_number, li.so_number,
  li.stock_quantity, li.unit_cbm, li.so_approval_date, li.item_status, li.source_warehouse,
  li.source_product_category, li.source_province, li.source_city
FROM public.v_dispatch_monitoring master
LEFT JOIN public.trip_line_items li ON li.trip_id=master.trip_id AND li.trip_stop_id=master._trip_stop_id;
REVOKE ALL ON public.v_trip_source_master FROM anon,authenticated;
GRANT SELECT ON public.v_trip_source_master TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
