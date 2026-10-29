CREATE OR REPLACE FUNCTION public.review_pod_receipt_v1(p_actor_id uuid, p_request_id uuid, p_trip_id uuid, p_stop_id uuid, p_receipt_id uuid, p_expected_review_version bigint, p_expected_ocr_version integer, p_decision text, p_reason text, p_reviewed_fields jsonb, p_pod_record_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 r public.trip_images%ROWTYPE; s public.trip_stops%ROWTYPE;
 actor public.profiles%ROWTYPE; prior public.pod_review_events%ROWTYPE;
 pod public.pod_records%ROWTYPE; pod_id uuid; recipient uuid;
 event_id uuid:=gen_random_uuid(); notice_id uuid:=gen_random_uuid();
 result jsonb; dr text; ids uuid[]; field_key text;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=p_actor_id FOR SHARE;
 IF NOT FOUND OR actor.role NOT IN ('ADMIN','STAFF') THEN RAISE EXCEPTION 'POD review requires Admin or Staff.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_review_version IS NULL OR p_expected_ocr_version IS NULL OR p_expected_review_version<0 OR p_expected_ocr_version<0
  OR p_decision IS NULL OR p_decision NOT IN ('APPROVED','REJECTED')
  OR p_reviewed_fields IS NULL OR jsonb_typeof(p_reviewed_fields)<>'object' OR octet_length(p_reviewed_fields::text)>16000
  OR length(coalesce(p_reason,''))>2000 OR (p_decision='REJECTED' AND btrim(coalesce(p_reason,''))='')
 THEN RAISE EXCEPTION 'Invalid POD decision, reason or review version.' USING ERRCODE='22023'; END IF;
 FOR field_key IN SELECT jsonb_object_keys(p_reviewed_fields) LOOP
  IF field_key NOT IN ('dr_number','dispatch_number','so_number','customer_name','store_name','delivery_date','receiving_date','receiver_name','quantity','product_information','document_references') THEN
   RAISE EXCEPTION 'Unsupported review field.' USING ERRCODE='22023';
  END IF;
 END LOOP;
 -- Serializes request-key reuse across receipts, then serializes physical review.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':'||p_request_id::text,0));
 SELECT * INTO prior FROM public.pod_review_events WHERE actor_profile_id=p_actor_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.receipt_id<>p_receipt_id OR prior.trip_id<>p_trip_id OR prior.trip_stop_id<>p_stop_id OR prior.decision<>p_decision
   OR prior.expected_review_version<>p_expected_review_version OR prior.expected_ocr_version<>p_expected_ocr_version
   OR prior.reason IS DISTINCT FROM nullif(btrim(coalesce(p_reason,'')),'') OR prior.reviewed_fields<>p_reviewed_fields
   OR (prior.outcome->>'requested_pod_record_id') IS DISTINCT FROM p_pod_record_id::text THEN
   RAISE EXCEPTION 'Request ID already belongs to a different decision.' USING ERRCODE='40001';
  END IF;
  RETURN prior.outcome;
 END IF;
 SELECT * INTO r FROM public.trip_images WHERE id=p_receipt_id AND trip_id=p_trip_id AND trip_stop_id=p_stop_id AND kind='receipt' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt does not belong to this transaction.' USING ERRCODE='P0002'; END IF;
 IF r.pod_review_version<>p_expected_review_version OR r.ocr_version<>p_expected_ocr_version THEN RAISE EXCEPTION 'Receipt changed. Reload before deciding.' USING ERRCODE='40001'; END IF;
 IF r.pod_review_status='APPROVED' THEN RAISE EXCEPTION 'An approved document cannot be decided again.' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='trip-images' AND public=false) THEN
  RAISE EXCEPTION 'The original receipt bucket must be private.' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='trip-images' AND name=r.storage_path) THEN
  RAISE EXCEPTION 'The original receipt object is missing. Restore a verified document association before review.' USING ERRCODE='55000';
 END IF;
 SELECT * INTO s FROM public.trip_stops WHERE id=p_stop_id AND trip_id=p_trip_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active delivery transaction not found.' USING ERRCODE='P0002'; END IF;
 -- The uploader is the historical submitter; never trust a client recipient ID.
 SELECT id INTO recipient FROM public.profiles WHERE id=r.uploaded_by AND role='TRUCKER';
 IF recipient IS NULL THEN
  SELECT array_agg(d.profile_id) INTO ids FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id
   JOIN public.profiles p ON p.id=d.profile_id AND p.role='TRUCKER'
   WHERE a.trip_id=p_trip_id AND a.assignment_type='PRIMARY' AND a.unassigned_at IS NULL;
  IF cardinality(ids)=1 THEN recipient:=ids[1]; END IF;
 END IF;
 IF recipient IS NULL THEN RAISE EXCEPTION 'Responsible trucker is missing or ambiguous. Correct the assignment before review.' USING ERRCODE='55000'; END IF;
 IF p_decision='APPROVED' THEN
  dr:=coalesce(nullif(btrim(s.dr_number),''),nullif(btrim(r.dr_number),''));
  IF dr IS NULL THEN RAISE EXCEPTION 'Confirm the transaction DR number before approval.' USING ERRCODE='55000'; END IF;
  IF nullif(btrim(r.dr_number),'') IS NOT NULL AND regexp_replace(lower(r.dr_number),'[^a-z0-9]','','g')<>regexp_replace(lower(dr),'[^a-z0-9]','','g') THEN
   RAISE EXCEPTION 'Receipt DR differs from the saved transaction. Review the association.' USING ERRCODE='55000';
  END IF;
  IF nullif(btrim(p_reviewed_fields->>'dr_number'),'') IS NOT NULL AND regexp_replace(lower(p_reviewed_fields->>'dr_number'),'[^a-z0-9]','','g')<>regexp_replace(lower(dr),'[^a-z0-9]','','g') THEN
   RAISE EXCEPTION 'Reviewed DR differs from the saved transaction.' USING ERRCODE='55000';
  END IF;
  IF p_pod_record_id IS NOT NULL THEN
   SELECT * INTO pod FROM public.pod_records WHERE id=p_pod_record_id AND trip_id=p_trip_id AND trip_stop_id=p_stop_id FOR UPDATE;
   IF NOT FOUND OR regexp_replace(lower(coalesce(pod.dr_number,'')),'[^a-z0-9]','','g')<>regexp_replace(lower(dr),'[^a-z0-9]','','g') THEN
    RAISE EXCEPTION 'Selected POD does not match this transaction and DR.' USING ERRCODE='55000';
   END IF;
  ELSE
   SELECT array_agg(id) INTO ids FROM public.pod_records WHERE trip_id=p_trip_id AND trip_stop_id=p_stop_id;
   IF cardinality(ids)>1 THEN RAISE EXCEPTION 'Multiple historical POD records require an explicit matching POD ID.' USING ERRCODE='55000'; END IF;
   IF cardinality(ids)=1 THEN
    SELECT * INTO pod FROM public.pod_records WHERE id=ids[1] FOR UPDATE;
    IF regexp_replace(lower(coalesce(pod.dr_number,'')),'[^a-z0-9]','','g')<>regexp_replace(lower(dr),'[^a-z0-9]','','g') THEN
     RAISE EXCEPTION 'Historical POD DR differs. Review the record before approval.' USING ERRCODE='55000';
    END IF;
   END IF;
  END IF;
  IF pod.id IS NULL THEN
   INSERT INTO public.pod_records(trip_id,trip_stop_id,dr_number,pod_status,pod_received_at)
    VALUES(p_trip_id,p_stop_id,dr,'RECEIVED',clock_timestamp()) RETURNING id INTO pod_id;
  ELSE
   pod_id:=pod.id;
   UPDATE public.pod_records SET pod_status=CASE WHEN pod_status='PENDING_TRUCKER_CONFIRMATION' THEN 'RECEIVED' ELSE pod_status END,
    pod_received_at=coalesce(pod_received_at,clock_timestamp()) WHERE id=pod_id;
  END IF;
 END IF;
 UPDATE public.trip_images SET pod_review_status=p_decision,pod_review_version=pod_review_version+1,
  pod_reviewed_by=p_actor_id,pod_reviewed_at=clock_timestamp(),pod_rejection_reason=CASE WHEN p_decision='REJECTED' THEN btrim(p_reason) END,
  pod_record_id=coalesce(pod_id,pod_record_id),updated_at=clock_timestamp() WHERE id=r.id;
 result:=jsonb_build_object('event_id',event_id,'request_id',p_request_id,'receipt_id',r.id,'trip_id',p_trip_id,'trip_stop_id',p_stop_id,
  'status',p_decision,'review_version',r.pod_review_version+1,'pod_record_id',pod_id,'notification_id',notice_id,'requested_pod_record_id',p_pod_record_id);
 INSERT INTO public.admin_notifications(id,recipient_profile_id,actor_profile_id,notification_type,reference_type,reference_id,message,metadata,event_key)
  VALUES(notice_id,recipient,p_actor_id,CASE WHEN p_decision='APPROVED' THEN 'pod_approved' ELSE 'pod_rejected' END,'trip',p_trip_id,
   CASE WHEN p_decision='APPROVED' THEN 'Your POD was approved.' ELSE 'Your POD was rejected: '||btrim(p_reason) END,
   jsonb_build_object('trip_id',p_trip_id,'trip_stop_id',p_stop_id,'receipt_id',r.id,'review_status',p_decision),event_id);
 INSERT INTO public.pod_review_events(id,request_id,actor_profile_id,actor_snapshot,receipt_id,trip_id,trip_stop_id,decision,reason,reviewed_fields,expected_review_version,expected_ocr_version,outcome)
  VALUES(event_id,p_request_id,p_actor_id,concat_ws(' ',actor.first_name,actor.last_name),r.id,p_trip_id,p_stop_id,p_decision,nullif(btrim(coalesce(p_reason,'')),''),p_reviewed_fields,p_expected_review_version,p_expected_ocr_version,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION public.submit_delivery_event_v1(p_actor uuid, p_assignment uuid, p_key uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 a public.trip_truck_assignments%rowtype; t public.trips%rowtype; s public.trip_stops%rowtype;
 saved public.trip_events%rowtype; e public.trip_events%rowtype; asset public.trip_images%rowtype;
 k text:=p_input->>'type'; sid uuid:=nullif(p_input->>'stop_id','')::uuid;
 device_at timestamptz:=nullif(p_input->>'device_time','')::timestamptz; ts timestamptz:=clock_timestamp();
 lat double precision:=nullif(p_input#>>'{gps,latitude}','')::double precision;
 lng double precision:=nullif(p_input#>>'{gps,longitude}','')::double precision;
 accuracy double precision:=nullif(p_input#>>'{gps,accuracy_meters}','')::double precision;
 captured timestamptz:=nullif(p_input#>>'{gps,captured_at}','')::timestamptz;
 dest_lat double precision; dest_lng double precision; radius integer; verified boolean; distance_m double precision;
 method text:='RECORDED'; meta jsonb:='{}'; attachment uuid; predecessor text; active_count integer;
 q jsonb; allocation public.trip_cargo_allocations%rowtype; item public.trip_line_items%rowtype; used numeric; qty numeric; report_id uuid;
begin
 if p_key is null or jsonb_typeof(p_input)<>'object' or not exists(select 1 from public.profiles where id=p_actor and role='TRUCKER' and deactivated_at is null) then
  raise exception 'An active trucker account is required.' using errcode='42501'; end if;
 perform set_config('alzhen.delivery_event_write','on',true);
 -- Lock physical trip before assignment/stop/cargo: all convoy operations use this order.
 select tr.* into t from public.trips tr join public.trip_truck_assignments ta on ta.trip_id=tr.id where ta.id=p_assignment for update of tr;
 select * into a from public.trip_truck_assignments where id=p_assignment for update;
 if a.id is null or not exists(select 1 from public.drivers where id=a.driver_id and profile_id=p_actor) then
  raise exception 'This truck assignment is not available to your account.' using errcode='42501'; end if;
 -- A committed retry is returned even after the assignment has subsequently ended.
 select * into saved from public.trip_events where recorded_by=p_actor and delivery_request_id=p_key;
 if found then
  if saved.assignment_id<>p_assignment or saved.delivery_payload is distinct from p_input then raise exception 'Submission identifier was reused with different content.' using errcode='23505'; end if;
  return to_jsonb(saved); end if;
 if a.unassigned_at is not null or t.archived_at is not null or t.status='CANCELLED' then raise exception 'This assignment is no longer active.' using errcode='42501'; end if;
 if k is null or k not in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','IN_TRANSIT','ARRIVED','UNLOADING_STARTED','PARTIAL_UNLOAD','UNLOADING_FINISHED','POD_SUBMITTED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED','CUSTOM_STATUS','PHOTO_UPLOADED','BACKLOAD_REPORTED','OFFLOAD_REPORTED','DEMURRAGE_REPORTED') then raise exception 'Unsupported delivery event.' using errcode='22023'; end if;
 if length(coalesce(p_input->>'remarks',''))>4000 or length(coalesce(p_input->>'title',''))>120 or device_at>ts+interval '2 minutes' then raise exception 'Check the event text and device clock.' using errcode='22023'; end if;
 if sid is not null then
  select * into s from public.trip_stops where id=sid and trip_id=a.trip_id and archived_at is null for update;
  if s.id is null or (a.stop_scope<>'ALL' and not exists(select 1 from public.trip_assignment_stops where assignment_id=a.id and trip_stop_id=sid)) then raise exception 'This stop is not assigned to your truck.' using errcode='42501'; end if;
 end if;
 if k in ('ARRIVED','UNLOADING_STARTED','PARTIAL_UNLOAD','UNLOADING_FINISHED','POD_SUBMITTED','STOP_DEPARTURE') and sid is null then raise exception 'Choose an assigned delivery stop.' using errcode='22023'; end if;
 if k in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ASSIGNMENT_COMPLETED') and sid is not null then raise exception 'This event belongs to the assignment, not a delivery stop.' using errcode='22023'; end if;
 if lat is not null or lng is not null then
  if lat is null or lng is null or not(lat between -90 and 90) or not(lng between -180 and 180) or accuracy is null or not(accuracy between 0 and 10000) or captured is null or captured>ts+interval '2 minutes' then raise exception 'Invalid location capture.' using errcode='22023'; end if;
 end if;
 if jsonb_typeof(coalesce(p_input->'attachments','[]'))<>'array' or jsonb_array_length(coalesce(p_input->'attachments','[]'))>6 then raise exception 'Choose up to six attachments.' using errcode='22023'; end if;
 for attachment in select value::text::uuid from jsonb_array_elements_text(coalesce(p_input->'attachments','[]')) loop
  select * into asset from public.trip_images where id=attachment for update;
  if asset.id is null or asset.trip_id<>a.trip_id or asset.assignment_id is distinct from a.id or asset.uploaded_by<>p_actor or asset.delivery_event_id is not null or asset.delivery_upload_state<>'READY' or asset.trip_stop_id is distinct from sid then raise exception 'Evidence must be uploaded successfully for this assignment and stop.' using errcode='42501'; end if;
 end loop;
 if k in ('WAREHOUSE_ARRIVAL','ARRIVED') then
  -- Capture is required at the action time, including a retained offline arrival.
  if lat is null or lng is null or captured is null or accuracy is null
     or abs(extract(epoch from (captured-coalesce(device_at,ts))))>120 then
   raise exception 'GPS is required for arrival. Enable location permission and retry.' using errcode='P0400';
  end if;
  if k='WAREHOUSE_ARRIVAL' then select latitude,longitude,arrival_radius_meters,location_verified into dest_lat,dest_lng,radius,verified from public.warehouses where id=t.warehouse_id;
  else select latitude,longitude,arrival_radius_meters,location_verified into dest_lat,dest_lng,radius,verified from public.customer_stores where id=s.store_id; end if;
  if dest_lat is not null and dest_lng is not null and verified and accuracy<=200 then
   distance_m:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(dest_lat-lat)/2),2)+cos(radians(lat))*cos(radians(dest_lat))*power(sin(radians(dest_lng-lng)/2),2))));
  end if;
  if distance_m is not null and distance_m<=radius+least(accuracy,100) then method:='GPS_VERIFIED';end if;
  -- An unverified geofence does not make optional photos compulsory.
  meta:=jsonb_build_object('distance_meters',distance_m,'geofence_meters',radius,'gps_captured_at',captured,'arrival_location_review',method<>'GPS_VERIFIED');
 end if;
 if k in ('ARRIVED','IN_TRANSIT') and sid is not null and exists(
  select 1 from public.trip_stops prior where prior.trip_id=a.trip_id and prior.archived_at is null
   and (prior.stop_sequence,prior.id)<(s.stop_sequence,s.id)
   and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops scope where scope.assignment_id=a.id and scope.trip_stop_id=prior.id))
   and not exists(select 1 from public.trip_events ev where ev.assignment_id=a.id and ev.trip_stop_id=prior.id and ev.event_type='STOP_DEPARTURE')
 ) then raise exception 'Depart the preceding assigned stop first.' using errcode='23514';end if;
 if k='IN_TRANSIT' and not exists(select 1 from public.trip_events where assignment_id=a.id and event_type='WAREHOUSE_DEPARTURE') then
  raise exception 'Depart the warehouse before traveling.' using errcode='23514';end if;
 predecessor:=case k when 'LOADING_STARTED' then 'WAREHOUSE_ARRIVAL' when 'LOADING_FINISHED' then 'LOADING_STARTED' when 'WAREHOUSE_DEPARTURE' then 'LOADING_FINISHED' when 'ARRIVED' then 'WAREHOUSE_DEPARTURE' when 'UNLOADING_STARTED' then 'ARRIVED' when 'PARTIAL_UNLOAD' then 'UNLOADING_STARTED' when 'UNLOADING_FINISHED' then 'UNLOADING_STARTED' when 'STOP_DEPARTURE' then 'UNLOADING_FINISHED' end;
 if predecessor is not null and not exists(select 1 from public.trip_events where assignment_id=a.id and event_type=predecessor and trip_stop_id is not distinct from case when k='ARRIVED' then null else sid end) then raise exception 'Record the preceding delivery milestone first.' using errcode='23514'; end if;
 -- Validate related report receipts against this exact assignment, inside the transaction.
 if k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED','DEMURRAGE_REPORTED') then
  if length(trim(coalesce(p_input->>'remarks','')))=0 then raise exception 'Describe what happened before submitting the report.' using errcode='23514';end if;
  meta := meta || jsonb_build_object('related_dr_numbers',coalesce(p_input->'related_dr_numbers',case when nullif(trim(p_input->>'dr_number'),'') is not null then jsonb_build_array(trim(p_input->>'dr_number')) else '[]'::jsonb end));
  if jsonb_typeof(meta->'related_dr_numbers') is distinct from 'array' then raise exception 'Choose related DR numbers as a list.' using errcode='22023';end if;
  if jsonb_array_length(meta->'related_dr_numbers')>100 then raise exception 'Choose at most 100 related DR numbers.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(meta->'related_dr_numbers') dr where jsonb_typeof(dr)<>'string' or length(trim(dr#>>'{}')) not between 1 and 100)
     or (select count(*) from jsonb_array_elements_text(meta->'related_dr_numbers'))<>(select count(distinct trim(value)) from jsonb_array_elements_text(meta->'related_dr_numbers')) then
   raise exception 'Choose distinct valid DR numbers.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(meta->'related_dr_numbers') dr where not exists(
   select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id join public.trip_stops st on st.id=li.trip_stop_id
   where ca.assignment_id=a.id and ca.trip_id=a.trip_id and li.trip_id=a.trip_id and st.trip_id=a.trip_id and st.archived_at is null
    and coalesce(nullif(trim(li.dr_number),''),nullif(trim(st.dr_number),''))=trim(dr.value) and (sid is null or li.trip_stop_id=sid)
    and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops scope where scope.assignment_id=a.id and scope.trip_stop_id=st.id))
  )) then raise exception 'Choose DR numbers belonging to this truck assignment.' using errcode='42501';end if;
  meta := meta || jsonb_build_object('dr_number',(select string_agg(trim(value),', ' order by ordinal) from jsonb_array_elements_text(meta->'related_dr_numbers') with ordinality as dr(value,ordinal)));
 elsif k='CUSTOM_STATUS' and p_input->>'title' in ('Accident','Vehicle breakdown') then
  if length(trim(coalesce(p_input->>'remarks','')))<5 or jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Add a reason and photo evidence for this report.' using errcode='23514';end if;
 end if;
 if k='CUSTOM_STATUS' and length(trim(coalesce(p_input->>'title','')))=0 then raise exception 'Enter a status title.' using errcode='23514'; end if;
 if k='POD_SUBMITTED' then
  if length(trim(coalesce(p_input->>'dr_number','')))=0 or jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Choose a POD image and DR number.' using errcode='23514'; end if;
 end if;
 insert into public.trip_events(trip_id,trip_stop_id,assignment_id,event_type,event_time,recorded_by,latitude,longitude,notes,device_time,accuracy_meters,verification_method,delivery_request_id,delivery_payload,delivery_metadata)
 values(a.trip_id,sid,a.id,k,ts,p_actor,lat,lng,nullif(trim(p_input->>'remarks'),''),device_at,accuracy,method,p_key,p_input,meta||jsonb_build_object('title',p_input->>'title','gps_captured_at',captured,'dr_number',case when k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED','DEMURRAGE_REPORTED') then meta->>'dr_number' else p_input->>'dr_number' end)) returning * into e;
 if k='PARTIAL_UNLOAD' then
  if jsonb_typeof(p_input->'quantities') is distinct from 'array' or jsonb_array_length(p_input->'quantities') not between 1 and 100 then raise exception 'Select one to one hundred cargo items.' using errcode='23514'; end if;
  for q in select value from jsonb_array_elements(p_input->'quantities') order by value->>'allocation_id' loop
   select * into allocation from public.trip_cargo_allocations where id=(q->>'allocation_id')::uuid and assignment_id=a.id for update;
   select * into item from public.trip_line_items where id=allocation.trip_line_item_id and trip_id=a.trip_id and trip_stop_id=sid;
   if allocation.id is null or item.id is null then raise exception 'Cargo does not belong to this truck and stop.' using errcode='42501'; end if;
   qty:=(q->>'quantity')::numeric;
   select coalesce(sum(quantity),0) into used from public.trip_delivery_quantities where allocation_id=allocation.id;
   if qty is null or not(qty>0 and qty<=allocation.quantity-used) then raise exception 'Quantity exceeds remaining assigned cargo or is not positive.' using errcode='23514'; end if;
   insert into public.trip_delivery_quantities(event_id,allocation_id,quantity) values(e.id,allocation.id,qty);
  end loop;
 end if;
 if k='UNLOADING_FINISHED' and exists(select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id where ca.assignment_id=a.id and li.trip_stop_id=sid and ca.quantity>coalesce((select sum(quantity) from public.trip_delivery_quantities where allocation_id=ca.id),0)) then raise exception 'Record the remaining unloaded quantities before finishing this stop.' using errcode='23514'; end if;
 if k='ASSIGNMENT_COMPLETED' and (not exists(select 1 from public.trip_stops st where st.trip_id=a.trip_id and st.archived_at is null and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops x where x.assignment_id=a.id and x.trip_stop_id=st.id))) or exists(select 1 from public.trip_stops st where st.trip_id=a.trip_id and st.archived_at is null and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops x where x.assignment_id=a.id and x.trip_stop_id=st.id)) and not exists(select 1 from public.trip_events ev where ev.assignment_id=a.id and ev.trip_stop_id=st.id and ev.event_type='STOP_DEPARTURE'))) then raise exception 'Complete and depart all assigned stops first.' using errcode='23514'; end if;
 update public.trip_images set delivery_event_id=e.id,kind=case when k='POD_SUBMITTED' then 'receipt' else kind end,dr_number=case when k='POD_SUBMITTED' then p_input->>'dr_number' else dr_number end,
  ocr_text=case when k='POD_SUBMITTED' then nullif(p_input->>'ocr_text','') else ocr_text end,
  ocr_confidence=case when k='POD_SUBMITTED' then nullif(p_input->>'ocr_confidence','')::double precision else ocr_confidence end
 where id in(select value::uuid from jsonb_array_elements_text(coalesce(p_input->'attachments','[]')));
 if k<>'POD_SUBMITTED' and exists(select 1 from public.trip_images im where im.delivery_event_id=e.id and im.mime_type='application/pdf') then raise exception 'Arrival and incident evidence must be a photo.' using errcode='23514'; end if;
 if k='POD_SUBMITTED' and nullif(trim(p_input->>'dr_number'),'') is not null and not exists(select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id where ca.assignment_id=a.id and (sid is null or li.trip_stop_id=sid) and li.dr_number=trim(p_input->>'dr_number')) then
  raise exception 'Choose a DR belonging to this truck and delivery stop.' using errcode='23514'; end if;
 -- Existing reports remain trip/stop-wide aggregates. Never overwrite earlier history.
 if k in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED') and not exists(select 1 from public.loading_reports lr join public.operations_report_conversions c on c.source_id=lr.id and c.source_type='LOADING' where lr.trip_id=a.trip_id) then
  insert into public.loading_reports(trip_id,created_by,status,warehouse_arrival_at,loading_start_at,loading_finished_at)
  values(a.trip_id,p_actor,'DRAFT',case when k='WAREHOUSE_ARRIVAL' then ts end,case when k='LOADING_STARTED' then ts end,case when k='LOADING_FINISHED' then ts end)
  on conflict(trip_id) do update set warehouse_arrival_at=coalesce(public.loading_reports.warehouse_arrival_at,excluded.warehouse_arrival_at),loading_start_at=coalesce(public.loading_reports.loading_start_at,excluded.loading_start_at),loading_finished_at=coalesce(public.loading_reports.loading_finished_at,excluded.loading_finished_at);
 end if;
 if k='WAREHOUSE_DEPARTURE' then update public.trips set status=case when status='PLANNED' then 'IN_PROGRESS' else status end,departure_from_warehouse_at=coalesce(departure_from_warehouse_at,ts) where id=a.trip_id; end if;
 if k in ('ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE') then
  insert into public.trip_assignment_stops(trip_id,assignment_id,trip_stop_id,progress) values(a.trip_id,a.id,sid,case when k in ('UNLOADING_FINISHED','STOP_DEPARTURE') then 'COMPLETED' else 'IN_PROGRESS' end)
  on conflict(assignment_id,trip_stop_id) do update set progress=excluded.progress,collaboration_version=public.trip_assignment_stops.collaboration_version+1,updated_at=ts;
  if not exists(select 1 from public.unloading_reports ur join public.operations_report_conversions c on c.source_id=ur.id and c.source_type='UNLOADING' where ur.trip_stop_id=sid) then
   insert into public.unloading_reports(trip_id,trip_stop_id,created_by,status) values(a.trip_id,sid,p_actor,'DRAFT') on conflict(trip_stop_id) do nothing;
   select count(*) into active_count from public.trip_truck_assignments ta where ta.trip_id=a.trip_id and ta.unassigned_at is null and (ta.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops x where x.assignment_id=ta.id and x.trip_stop_id=sid));
   update public.trip_stops set arrival_time=coalesce(arrival_time,case when k='ARRIVED' then ts end),start_unloading_time=coalesce(start_unloading_time,case when k='UNLOADING_STARTED' then ts end),
    finish_unloading_time=coalesce(finish_unloading_time,case when k='UNLOADING_FINISHED' and active_count=(select count(*) from public.trip_assignment_stops x join public.trip_truck_assignments ta on ta.id=x.assignment_id where x.trip_stop_id=sid and x.progress='COMPLETED' and ta.unassigned_at is null) then ts end),
    departure_time=coalesce(departure_time,case when k='STOP_DEPARTURE' and active_count=(select count(distinct ev.assignment_id) from public.trip_events ev join public.trip_truck_assignments ta on ta.id=ev.assignment_id where ev.trip_stop_id=sid and ev.event_type='STOP_DEPARTURE' and ta.unassigned_at is null) then ts end),
    delivery_status=case when k='UNLOADING_FINISHED' and active_count=(select count(*) from public.trip_assignment_stops x join public.trip_truck_assignments ta on ta.id=x.assignment_id where x.trip_stop_id=sid and x.progress='COMPLETED' and ta.unassigned_at is null) then 'COMPLETED' when delivery_status='PENDING' then 'IN_PROGRESS' else delivery_status end where id=sid;
  end if;
 end if;
 if k='BACKLOAD_REPORTED' then
  insert into public.backloads(trip_id,trip_stop_id,reason,comments,narrative,created_by,submitted_by,submitted_at,status,dispatch_number_snapshot,driver_name_snapshot,plate_number_snapshot)
  select a.trip_id,sid,p_input->>'remarks',p_input->>'remarks',p_input->>'remarks',p_actor,p_actor,ts,'SUBMITTED',t.dispatch_number,concat_ws(' ',d.first_name,d.last_name),tr.plate_number from public.drivers d left join public.trucks tr on tr.id=a.truck_id where d.id=a.driver_id returning id into report_id;
 elsif k='OFFLOAD_REPORTED' then
  insert into public.offloads(trip_id,trip_stop_id,reason,comments,created_by,submitted_by,submitted_at,status,driver_name_snapshot,plate_number_snapshot,dr_number,reported_by,reported_at)
  select a.trip_id,sid,p_input->>'remarks',p_input->>'remarks',p_actor,p_actor,ts,'SUBMITTED',concat_ws(' ',d.first_name,d.last_name),tr.plate_number,p_input->>'dr_number',p_actor,ts from public.drivers d left join public.trucks tr on tr.id=a.truck_id where d.id=a.driver_id returning id into report_id;
 end if;
 if k='DEMURRAGE_REPORTED' then
  if p_input->>'waiting_minutes' is not null and (p_input->>'waiting_minutes') !~ '^[0-9]{1,6}$' then raise exception 'Enter valid waiting minutes.' using errcode='22023';end if;
  insert into public.demurrages(trip_id,trip_stop_id,reason,remarks,created_by,status,waiting_minutes)
  values(a.trip_id,sid,p_input->>'remarks',p_input->>'remarks',p_actor,'SUBMITTED',nullif(p_input->>'waiting_minutes','')::integer) returning id into report_id;
 end if;
 if report_id is not null and k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED') then
  if jsonb_typeof(coalesce(p_input->'quantities','[]'))<>'array' or jsonb_array_length(coalesce(p_input->'quantities','[]'))>100 then raise exception 'Choose at most 100 cargo lines.' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(coalesce(p_input->'quantities','[]')) loop
   select * into allocation from public.trip_cargo_allocations where id=(q->>'allocation_id')::uuid and assignment_id=a.id for update;
   select * into item from public.trip_line_items where id=allocation.trip_line_item_id;
   qty:=(q->>'quantity')::numeric;
   if allocation.id is null or (sid is not null and item.trip_stop_id<>sid) or qty is null or qty<=0 or qty>allocation.quantity or qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Report cargo must belong to this truck and cannot exceed its allocation.' using errcode='23514'; end if;
   if (select count(*) from jsonb_array_elements(p_input->'quantities') v where v->>'allocation_id'=q->>'allocation_id')>1 then raise exception 'Choose each cargo line once.' using errcode='23514'; end if;
   if k='BACKLOAD_REPORTED' then
    insert into public.backload_items(backload_id,trip_line_item_id,dr_number,customer_model,quantity,total_cbm,remarks) values(report_id,item.id,item.dr_number,item.customer_model,qty,case when allocation.quantity>0 then allocation.allocated_cbm*qty/allocation.quantity else 0 end,p_input->>'remarks');
   else
    insert into public.offload_items(offload_id,trip_line_item_id,dr_number,customer_model,quantity,total_cbm,remarks,reason) values(report_id,item.id,item.dr_number,item.customer_model,qty,case when allocation.quantity>0 then allocation.allocated_cbm*qty/allocation.quantity else 0 end,p_input->>'remarks',p_input->>'remarks');
   end if;
  end loop;
 end if;
 if report_id is not null then update public.trip_events set backload_id=case when k='BACKLOAD_REPORTED' then report_id end,offload_id=case when k='OFFLOAD_REPORTED' then report_id end,demurrage_id=case when k='DEMURRAGE_REPORTED' then report_id end,delivery_metadata=delivery_metadata||jsonb_build_object('report_id',report_id,'report_type',case when k='BACKLOAD_REPORTED' then 'BACKLOAD' when k='DEMURRAGE_REPORTED' then 'DEMURRAGE' else 'OFFLOAD' end) where id=e.id returning * into e; end if;
 perform public.refresh_confirmed_delivery_state_v1(a.trip_id);
 return to_jsonb(e);
end $function$
;
