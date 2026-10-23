-- PREPARED ONLY: requires approval before execution.
-- Prerequisites: trip_source_import, trip_workflow_completion, and trip_import_recovery.
-- Adds one nullable cargo-row page reference; reuses all other fields/tables.
-- No new tables, backfills, or deletions.
BEGIN;
ALTER TABLE public.trip_line_items ADD COLUMN IF NOT EXISTS source_page_no text;

-- Keep every existing operational/identity column, replacing only CSV projections.
-- Introspection avoids duplicate names if an earlier view already exposes an alias.
DO $migration$
DECLARE projection text;
BEGIN
  SELECT string_agg(format('m.%I', attname), ', ' ORDER BY attnum) INTO projection
  FROM pg_attribute WHERE attrelid='public.v_trip_source_master'::regclass AND attnum>0 AND NOT attisdropped
    AND attname <> ALL(ARRAY['page_no','request_received_at','created_by','added_by_name','trip_type',
      'source_product_category','source_province','source_city','incident_date','ir_status','ir_submitted_date',
      'backload_reason','backload_number_of_boxes','backload_comments','offload_number_of_boxes','offload_reason',
      'pod_status','pod_remarks','invoice_number','delivery_completed_date']);
  EXECUTE 'CREATE OR REPLACE VIEW public.v_trip_master_csv AS SELECT ' || projection || $view$,
    coalesce(cargo.source_page_no,t.page_no::text) AS page_no, t.request_received_at, t.created_by,
    m.finish_unloading_time AS delivery_completed_date,
    nullif(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS added_by_name,
    tt.name AS trip_type,
    coalesce(m.source_product_category, product.category) AS source_product_category,
    coalesce(m.source_province, destination.province) AS source_province,
    coalesce(m.source_city, destination.city) AS source_city,
    inc.incident_date, inc.status AS ir_status, inc.submitted_date AS ir_submitted_date,
    bl.reason AS backload_reason, bl.number_of_boxes AS backload_number_of_boxes, bl.comments AS backload_comments,
    offl.number_of_boxes AS offload_number_of_boxes, offl.reason AS offload_reason,
    pod.pod_status, pod.remarks AS pod_remarks, billing.invoice_number
  FROM public.v_trip_source_master m
  JOIN public.trips t ON t.id=m.trip_id
  LEFT JOIN public.trip_line_items cargo ON cargo.id=m._trip_line_item_id
  LEFT JOIN public.profiles creator ON creator.id=t.created_by
  LEFT JOIN public.trip_types tt ON tt.id=t.trip_type_id
  LEFT JOIN public.products product ON product.id=m._product_id
  LEFT JOIN public.customer_stores destination ON destination.id=m._store_id
  -- A single related record is projected. Multiple records remain in their existing
  -- workflows; joining them directly would multiply cargo rows and corrupt totals.
  LEFT JOIN LATERAL (SELECT i.* FROM public.incidents i WHERE i.trip_id=m.trip_id
    AND i.trip_stop_id IS NOT DISTINCT FROM m._trip_stop_id
    AND (SELECT count(*) FROM public.incidents x WHERE x.trip_id=i.trip_id AND x.trip_stop_id IS NOT DISTINCT FROM i.trip_stop_id)=1) inc ON true
  LEFT JOIN LATERAL (SELECT b.* FROM public.backloads b WHERE b.trip_id=m.trip_id
    AND b.trip_stop_id IS NOT DISTINCT FROM m._trip_stop_id
    AND (SELECT count(*) FROM public.backloads x WHERE x.trip_id=b.trip_id AND x.trip_stop_id IS NOT DISTINCT FROM b.trip_stop_id)=1) bl ON true
  LEFT JOIN LATERAL (SELECT o.* FROM public.offloads o WHERE o.trip_id=m.trip_id
    AND o.trip_stop_id IS NOT DISTINCT FROM m._trip_stop_id
    AND (SELECT count(*) FROM public.offloads x WHERE x.trip_id=o.trip_id AND x.trip_stop_id IS NOT DISTINCT FROM o.trip_stop_id)=1) offl ON true
  LEFT JOIN LATERAL (SELECT p.* FROM public.pod_records p WHERE p.trip_id=m.trip_id AND p.trip_stop_id=m._trip_stop_id
    AND p.dr_number IS NOT DISTINCT FROM m.dr_number
    AND (SELECT count(*) FROM public.pod_records x WHERE x.trip_id=p.trip_id AND x.trip_stop_id=p.trip_stop_id AND x.dr_number IS NOT DISTINCT FROM p.dr_number)=1) pod ON true
  LEFT JOIN LATERAL (SELECT b.* FROM public.billings b WHERE b.trip_id=m.trip_id
    AND (SELECT count(*) FROM public.billings x WHERE x.trip_id=b.trip_id)=1) billing ON true
  $view$;
END $migration$;
REVOKE ALL ON public.v_trip_master_csv FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_trip_master_csv TO service_role;

-- One locked write, including creation of an absent related record. All identifiers
-- and destination columns come from this allowlist, never from caller SQL text.
CREATE OR REPLACE FUNCTION public.save_master_list_cell_v1(
  p_actor uuid, p_trip uuid, p_stop uuid, p_line uuid, p_field text, p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
  target_table text; target_field text; ids uuid[]; target_id uuid; scope_sql text;
  saved jsonb; payload jsonb; dr text; text_value text := nullif(p_value #>> '{}','');
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.trips WHERE id=p_trip AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip is unavailable'; END IF;
  IF p_stop IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=p_stop AND trip_id=p_trip AND archived_at IS NULL) THEN RAISE EXCEPTION 'Stop does not belong to this trip'; END IF;
  IF p_line IS NOT NULL THEN
    SELECT dr_number INTO dr FROM public.trip_line_items WHERE id=p_line AND trip_id=p_trip AND trip_stop_id IS NOT DISTINCT FROM p_stop;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cargo does not belong to this row'; END IF;
  END IF;
  IF p_value IS NOT NULL AND jsonb_typeof(p_value) NOT IN ('string','number','boolean','null') THEN RAISE EXCEPTION 'Invalid cell value'; END IF;
  CASE p_field
    WHEN 'incident_date' THEN target_table:='incidents'; target_field:='incident_date';
    WHEN 'ir_status' THEN target_table:='incidents'; target_field:='status';
    WHEN 'ir_submitted_date' THEN target_table:='incidents'; target_field:='submitted_date';
    WHEN 'backload_reason' THEN target_table:='backloads'; target_field:='reason';
    WHEN 'backload_number_of_boxes' THEN target_table:='backloads'; target_field:='number_of_boxes';
    WHEN 'backload_comments' THEN target_table:='backloads'; target_field:='comments';
    WHEN 'offload_reason' THEN target_table:='offloads'; target_field:='reason';
    WHEN 'offload_number_of_boxes' THEN target_table:='offloads'; target_field:='number_of_boxes';
    WHEN 'pod_status' THEN target_table:='pod_records'; target_field:='pod_status';
    WHEN 'pod_remarks' THEN target_table:='pod_records'; target_field:='remarks';
    WHEN 'invoice_number' THEN target_table:='billings'; target_field:='invoice_number';
    WHEN 'created_by' THEN target_table:='trips'; target_field:='created_by';
    -- Import-only fields: the HTTP endpoint exposes only the related-field subset.
    WHEN 'page_no' THEN
      IF p_line IS NOT NULL THEN target_table:='trip_line_items'; target_field:='source_page_no';
      ELSE target_table:='trips'; target_field:='page_no'; END IF;
    WHEN 'remarks' THEN target_table:='trips'; target_field:='remarks';
    WHEN 'request_received_at' THEN target_table:='trips'; target_field:='request_received_at';
    WHEN 'added_to_report' THEN target_table:='trips'; target_field:='added_to_report';
    WHEN 'letter_status' THEN target_table:='trips'; target_field:='letter_status';
    WHEN 'trip_type_id' THEN target_table:='trips'; target_field:='trip_type_id';
    WHEN 'warehouse_id' THEN target_table:='trips'; target_field:='warehouse_id';
    WHEN 'signed_dr_upload_date' THEN target_table:='trips'; target_field:='signed_dr_upload_date';
    WHEN 'transmittal_date' THEN target_table:='trips'; target_field:='transmittal_date';
    WHEN 'tms_date' THEN target_table:='trips'; target_field:='tms_date';
    WHEN 'tms_done_by' THEN target_table:='trips'; target_field:='tms_done_by';
    WHEN 'pod_ac_shipping_date' THEN target_table:='trips'; target_field:='pod_ac_shipping_date';
    WHEN 'lbc_tracking_number' THEN target_table:='trips'; target_field:='lbc_tracking_number';
    WHEN 'delivery_status' THEN target_table:='trip_stops'; target_field:='delivery_status';
    WHEN 'finish_unloading_time' THEN target_table:='trip_stops'; target_field:='finish_unloading_time';
    ELSE RAISE EXCEPTION 'Unsupported Master List field';
  END CASE;
  IF target_field='number_of_boxes' AND text_value IS NOT NULL AND text_value::numeric<0 THEN RAISE EXCEPTION 'Boxes must be non-negative'; END IF;
  IF target_table='trips' THEN
    target_id:=p_trip;
  ELSIF target_table='trip_line_items' THEN
    target_id:=p_line;
  ELSIF target_table='trip_stops' THEN
    IF p_stop IS NULL THEN RAISE EXCEPTION 'Choose a delivery stop first'; END IF;
    target_id:=p_stop;
  ELSE
    IF target_table<>'billings' AND p_stop IS NULL THEN RAISE EXCEPTION 'Choose a delivery stop first'; END IF;
    scope_sql:='trip_id=$1';
    IF target_table<>'billings' THEN scope_sql:=scope_sql||' AND trip_stop_id IS NOT DISTINCT FROM $2'; END IF;
    IF target_table='pod_records' THEN scope_sql:=scope_sql||' AND dr_number IS NOT DISTINCT FROM $3'; END IF;
    EXECUTE format('SELECT array_agg(id) FROM public.%I WHERE %s',target_table,scope_sql) INTO ids USING p_trip,p_stop,dr;
    IF coalesce(cardinality(ids),0)>1 THEN RAISE EXCEPTION 'Multiple % records match this row. Edit the specific record in its existing workflow.',target_table USING ERRCODE='40001'; END IF;
    target_id:=ids[1];
    IF target_id IS NULL THEN
      -- Clearing an empty field must never create an otherwise empty report.
      IF text_value IS NULL THEN RETURN jsonb_build_object('id',p_trip,'trip_id',p_trip,'trip_stop_id',p_stop,'trip_line_item_id',p_line,p_field,NULL); END IF;
      payload:=jsonb_build_object('trip_id',p_trip);
      IF target_table<>'billings' THEN payload:=payload||jsonb_build_object('trip_stop_id',p_stop); END IF;
      IF target_table='pod_records' THEN payload:=payload||jsonb_build_object('dr_number',dr);
      ELSE payload:=payload||jsonb_build_object('created_by',p_actor); END IF;
      -- Insert the edited value at creation, retaining defaults for all other fields.
      payload:=payload||jsonb_build_object(target_field,p_value);
      SELECT string_agg(format('%I',key),',') INTO scope_sql FROM jsonb_object_keys(payload) key;
      EXECUTE format('INSERT INTO public.%1$I(%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) RETURNING id',target_table,scope_sql) INTO target_id USING payload;
    END IF;
  END IF;
  IF target_table='trips' AND target_field IN ('created_by','tms_done_by') AND text_value IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=text_value::uuid) THEN RAISE EXCEPTION 'Unknown profile'; END IF;
  payload:=jsonb_build_object(target_field,CASE WHEN text_value IS NULL THEN 'null'::jsonb ELSE p_value END);
  EXECUTE format('UPDATE public.%1$I t SET %2$I=r.%2$I FROM jsonb_populate_record(NULL::public.%1$I,$1) r WHERE t.id=$2 RETURNING to_jsonb(t)',target_table,target_field)
    INTO saved USING payload,target_id;
  RETURN jsonb_build_object('id',p_trip,'trip_id',p_trip,'trip_stop_id',p_stop,'trip_line_item_id',p_line,p_field,saved->target_field);
END $function$;
REVOKE ALL ON FUNCTION public.save_master_list_cell_v1(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_master_list_cell_v1(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;

-- Wrap the existing import in the same transaction so cargo and Master List
-- values commit together. Retrying a completed row never reapplies its metadata.
CREATE OR REPLACE FUNCTION public.import_trip_master_rows_v1(
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
  outcome:=public.import_trip_source_rows_v2(p_batch,p_creator,p_group,p_target,p_rows,p_verified,p_locations);
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
REVOKE ALL ON FUNCTION public.import_trip_master_rows_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_trip_master_rows_v1(uuid,uuid,text,jsonb,jsonb,boolean,jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
