-- Keep plate and trucking-company edits within the existing assignment relationship.
BEGIN;
CREATE OR REPLACE FUNCTION public.master_list_save_batch_v1(p_actor uuid,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE change jsonb; scope text; field_name text; item_id text; new_text text; old_value jsonb;
  target_id uuid; trip_id uuid; lookup_id uuid; store_customer uuid; new_cbm numeric; saved_count integer:=0;
  trip_row record; stop_row record; line_row record; assignment_row record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='ADMIN') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>200 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    scope:=change->>'scope'; field_name:=change->>'field'; item_id:=change->>'id'; new_text:=nullif(trim(change->>'value'),'');
    IF length(coalesce(new_text,''))>10000 THEN RAISE EXCEPTION 'Value too long' USING ERRCODE='22023'; END IF;
    IF scope='dispatch' AND field_name IN ('remarks','plate_number','trucking_company') THEN
      IF item_id IS NULL THEN RAISE EXCEPTION 'Dispatch is required'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.trips WHERE coalesce(nullif(dispatch_number,''),id::text)=item_id AND archived_at IS NULL) THEN
        RAISE EXCEPTION 'Dispatch is unavailable';
      END IF;
      FOR trip_row IN SELECT * FROM public.trips WHERE coalesce(nullif(dispatch_number,''),id::text)=item_id AND archived_at IS NULL FOR UPDATE LOOP
        IF field_name='remarks' THEN
          old_value:=to_jsonb(trip_row.remarks);
          IF old_value IS DISTINCT FROM to_jsonb(new_text) THEN
            UPDATE public.trips SET remarks=new_text WHERE id=trip_row.id;
            INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
              VALUES(p_actor,'MASTER_LIST_EDIT','trips',trip_row.id,jsonb_build_object('field',field_name,'value',old_value),jsonb_build_object('field',field_name,'value',new_text));
            saved_count:=saved_count+1;
          END IF;
        ELSE
          IF new_text IS NOT NULL THEN
            IF field_name='plate_number' THEN
              IF (SELECT count(*) FROM public.trucks WHERE lower(plate_number)=lower(new_text))<>1 THEN RAISE EXCEPTION 'Plate no. must match exactly one existing truck'; END IF;
              SELECT id INTO lookup_id FROM public.trucks WHERE lower(plate_number)=lower(new_text);
            ELSE
              IF (SELECT count(*) FROM public.trucking_companies WHERE lower(name)=lower(new_text))<>1 THEN RAISE EXCEPTION 'Trucker must match exactly one existing company'; END IF;
              SELECT id INTO lookup_id FROM public.trucking_companies WHERE lower(name)=lower(new_text);
            END IF;
            IF lookup_id IS NULL THEN RAISE EXCEPTION 'Choose an existing %',field_name; END IF;
          ELSE lookup_id:=NULL; END IF;
          IF (SELECT count(*) FROM public.trip_truck_assignments WHERE trip_id=trip_row.id AND assignment_type='PRIMARY' AND unassigned_at IS NULL)<>1 THEN
            RAISE EXCEPTION 'Edit this trip assignment in the trip workflow';
          END IF;
          FOR assignment_row IN SELECT * FROM public.trip_truck_assignments WHERE trip_id=trip_row.id AND assignment_type='PRIMARY' AND unassigned_at IS NULL FOR UPDATE LOOP
            IF field_name='plate_number' AND lookup_id IS NOT NULL AND assignment_row.trucking_company_id IS NOT NULL
               AND EXISTS(SELECT 1 FROM public.trucks WHERE id=lookup_id AND trucking_company_id IS NOT NULL AND trucking_company_id<>assignment_row.trucking_company_id) THEN
              RAISE EXCEPTION 'Truck belongs to a different trucking company; edit the assignment in Trip details';
            END IF;
            IF field_name='trucking_company' AND lookup_id IS NOT NULL AND assignment_row.truck_id IS NOT NULL
               AND EXISTS(SELECT 1 FROM public.trucks WHERE id=assignment_row.truck_id AND trucking_company_id IS NOT NULL AND trucking_company_id<>lookup_id) THEN
              RAISE EXCEPTION 'Truck belongs to a different trucking company; edit the assignment in Trip details';
            END IF;
            old_value:=to_jsonb(CASE WHEN field_name='plate_number' THEN assignment_row.truck_id ELSE assignment_row.trucking_company_id END);
            IF field_name='plate_number' AND lookup_id IS NULL THEN RAISE EXCEPTION 'An assigned truck cannot be cleared'; END IF;
            IF old_value IS DISTINCT FROM to_jsonb(lookup_id) THEN
              IF field_name='plate_number' THEN UPDATE public.trip_truck_assignments SET truck_id=lookup_id WHERE id=assignment_row.id;
              ELSE UPDATE public.trip_truck_assignments SET trucking_company_id=lookup_id WHERE id=assignment_row.id; END IF;
              INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
                VALUES(p_actor,'MASTER_LIST_EDIT','trip_truck_assignments',assignment_row.id,jsonb_build_object('field',field_name,'value',old_value),jsonb_build_object('field',field_name,'value',lookup_id));
              saved_count:=saved_count+1;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    ELSIF scope='dr' AND field_name IN ('store_name','customer_name','delivery_status') THEN
      target_id:=item_id::uuid;
      SELECT * INTO stop_row FROM public.trip_stops WHERE id=target_id AND archived_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'DR is unavailable'; END IF;
      trip_id:=stop_row.trip_id;
      IF field_name='delivery_status' THEN
        IF new_text IS NULL OR NOT EXISTS(SELECT 1 FROM public.tms_dropdown_options WHERE field_key='delivery_status' AND option_value=new_text AND active) THEN
          RAISE EXCEPTION 'Choose an active delivery status';
        END IF;
        old_value:=to_jsonb(stop_row.delivery_status);
        IF old_value IS DISTINCT FROM to_jsonb(new_text) THEN
          UPDATE public.trip_stops SET delivery_status=new_text WHERE id=target_id;
        END IF;
      ELSIF field_name='store_name' THEN
        IF (SELECT count(*) FROM public.customer_stores WHERE lower(name)=lower(new_text) AND upper(status::text)='ACTIVE')<>1 THEN RAISE EXCEPTION 'Store name must match exactly one active store'; END IF;
        SELECT id,customer_id INTO lookup_id,store_customer FROM public.customer_stores WHERE lower(name)=lower(new_text) AND upper(status::text)='ACTIVE';
        IF lookup_id IS NULL THEN RAISE EXCEPTION 'Choose an existing store'; END IF;
        IF stop_row.customer_id IS NOT NULL AND store_customer IS DISTINCT FROM stop_row.customer_id THEN RAISE EXCEPTION 'Store belongs to a different customer'; END IF;
        old_value:=to_jsonb(stop_row.store_id);
        IF old_value IS DISTINCT FROM to_jsonb(lookup_id) THEN
          UPDATE public.trip_stops SET store_id=lookup_id,customer_id=coalesce(customer_id,store_customer) WHERE id=target_id;
        END IF;
      ELSE
        IF (SELECT count(*) FROM public.customers WHERE lower(name)=lower(new_text) AND upper(status::text)='ACTIVE')<>1 THEN RAISE EXCEPTION 'Customer name must match exactly one active customer'; END IF;
        SELECT id INTO lookup_id FROM public.customers WHERE lower(name)=lower(new_text) AND upper(status::text)='ACTIVE';
        IF lookup_id IS NULL THEN RAISE EXCEPTION 'Choose an existing customer'; END IF;
        IF stop_row.store_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_stores WHERE id=stop_row.store_id AND customer_id=lookup_id) THEN RAISE EXCEPTION 'Store belongs to a different customer'; END IF;
        old_value:=to_jsonb(stop_row.customer_id);
        IF old_value IS DISTINCT FROM to_jsonb(lookup_id) THEN UPDATE public.trip_stops SET customer_id=lookup_id WHERE id=target_id; END IF;
      END IF;
      IF old_value IS DISTINCT FROM to_jsonb(CASE WHEN field_name='delivery_status' THEN new_text ELSE lookup_id::text END) THEN
        INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
          VALUES(p_actor,'MASTER_LIST_EDIT','trip_stops',target_id,jsonb_build_object('field',field_name,'value',old_value),jsonb_build_object('field',field_name,'value',CASE WHEN field_name='delivery_status' THEN new_text ELSE lookup_id::text END));
        saved_count:=saved_count+1;
      END IF;
    ELSIF scope='line' AND field_name='quantity' THEN
      target_id:=item_id::uuid;
      SELECT * INTO line_row FROM public.trip_line_items WHERE id=target_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Line is unavailable'; END IF;
      IF new_text IS NULL OR new_text::numeric<0 THEN RAISE EXCEPTION 'Quantity must be non-negative'; END IF;
      old_value:=to_jsonb(line_row.quantity);
      IF old_value IS DISTINCT FROM to_jsonb(new_text::numeric) THEN
        IF coalesce(line_row.quantity,0)=0 AND coalesce(line_row.cbm,0)<>0 THEN
          RAISE EXCEPTION 'Cannot recalculate CBM from a zero-quantity line';
        END IF;
        new_cbm:=CASE WHEN line_row.quantity>0 AND line_row.cbm IS NOT NULL THEN round(line_row.cbm/line_row.quantity*new_text::numeric,8) ELSE line_row.cbm END;
        UPDATE public.trip_line_items SET quantity=new_text::numeric,
          cbm=new_cbm WHERE id=target_id;
        INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
          VALUES(p_actor,'MASTER_LIST_EDIT','trip_line_items',target_id,jsonb_build_object('field',field_name,'value',old_value,'cbm',line_row.cbm),jsonb_build_object('field',field_name,'value',new_text::numeric,'cbm',new_cbm));
        saved_count:=saved_count+1;
      END IF;
    ELSE RAISE EXCEPTION 'Unsupported Master List edit' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN jsonb_build_object('saved',saved_count);
END $fn$;
NOTIFY pgrst,'reload schema';
COMMIT;

