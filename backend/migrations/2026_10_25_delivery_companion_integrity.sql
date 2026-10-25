-- Forward-only refinement: assignment-scoped report cargo and audited legacy projections.
begin;
alter table public.trip_events add column if not exists backload_id uuid references public.backloads(id) on delete restrict;
alter table public.trip_events add column if not exists offload_id uuid references public.offloads(id) on delete restrict;
create index if not exists delivery_event_backload on public.trip_events(backload_id) where backload_id is not null;
create index if not exists delivery_event_offload on public.trip_events(offload_id) where offload_id is not null;
create or replace function public.delivery_evidence_guard_v1() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.delivery_event_id is not null then
  if tg_op='DELETE' or new.delivery_event_id is distinct from old.delivery_event_id or new.assignment_id is distinct from old.assignment_id or new.storage_path is distinct from old.storage_path or new.file_sha256 is distinct from old.file_sha256 then
   raise exception 'Saved delivery evidence must be retained with its event.' using errcode='23514'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger delivery_evidence_guard before update or delete on public.trip_images for each row execute function public.delivery_evidence_guard_v1();
revoke all on function public.delivery_evidence_guard_v1() from public,anon,authenticated;
create or replace function public.submit_delivery_event_v1(p_actor uuid,p_assignment uuid,p_key uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
 if k is null or k not in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','IN_TRANSIT','ARRIVED','UNLOADING_STARTED','PARTIAL_UNLOAD','UNLOADING_FINISHED','POD_SUBMITTED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED','CUSTOM_STATUS','PHOTO_UPLOADED','BACKLOAD_REPORTED','OFFLOAD_REPORTED') then raise exception 'Unsupported delivery event.' using errcode='22023'; end if;
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
  if k='WAREHOUSE_ARRIVAL' then select latitude,longitude,arrival_radius_meters,location_verified into dest_lat,dest_lng,radius,verified from public.warehouses where id=t.warehouse_id;
  else select latitude,longitude,arrival_radius_meters,location_verified into dest_lat,dest_lng,radius,verified from public.customer_stores where id=s.store_id; end if;
  if lat is not null and lng is not null and dest_lat is not null and dest_lng is not null and verified and accuracy<=200 and captured>=ts-interval '2 minutes' then
   distance_m:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(dest_lat-lat)/2),2)+cos(radians(lat))*cos(radians(dest_lat))*power(sin(radians(dest_lng-lng)/2),2))));
  end if;
  if distance_m is not null and distance_m<=radius+least(accuracy,100) then method:='GPS_VERIFIED';
  else
   if jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Take or upload an arrival photo to continue. GPS could not verify this location.' using errcode='P0001'; end if;
   method:='PHOTO_PENDING_REVIEW';
  end if;
  meta:=jsonb_build_object('distance_meters',distance_m,'geofence_meters',radius,'gps_captured_at',captured);
 end if;
 predecessor:=case k when 'LOADING_STARTED' then 'WAREHOUSE_ARRIVAL' when 'LOADING_FINISHED' then 'LOADING_STARTED' when 'WAREHOUSE_DEPARTURE' then 'LOADING_FINISHED' when 'ARRIVED' then 'WAREHOUSE_DEPARTURE' when 'UNLOADING_STARTED' then 'ARRIVED' when 'PARTIAL_UNLOAD' then 'UNLOADING_STARTED' when 'UNLOADING_FINISHED' then 'UNLOADING_STARTED' when 'STOP_DEPARTURE' then 'UNLOADING_FINISHED' end;
 if predecessor is not null and not exists(select 1 from public.trip_events where assignment_id=a.id and event_type=predecessor and trip_stop_id is not distinct from case when k='ARRIVED' then null else sid end) then raise exception 'Record the preceding delivery milestone first.' using errcode='23514'; end if;
 if k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED') or (k='CUSTOM_STATUS' and p_input->>'title' in ('Accident','Vehicle breakdown')) then
  if length(trim(coalesce(p_input->>'remarks','')))<5 or jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Add a reason and photo evidence for this report.' using errcode='23514'; end if;
 end if;
 if k='CUSTOM_STATUS' and length(trim(coalesce(p_input->>'title','')))=0 then raise exception 'Enter a status title.' using errcode='23514'; end if;
 if k='POD_SUBMITTED' then
  if length(trim(coalesce(p_input->>'dr_number','')))=0 or jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Choose a POD image and DR number.' using errcode='23514'; end if;
 end if;
 insert into public.trip_events(trip_id,trip_stop_id,assignment_id,event_type,event_time,recorded_by,latitude,longitude,notes,device_time,accuracy_meters,verification_method,delivery_request_id,delivery_payload,delivery_metadata)
 values(a.trip_id,sid,a.id,k,ts,p_actor,lat,lng,nullif(trim(p_input->>'remarks'),''),device_at,accuracy,method,p_key,p_input,meta||jsonb_build_object('title',p_input->>'title','gps_captured_at',captured,'dr_number',p_input->>'dr_number')) returning * into e;
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
 if k in ('POD_SUBMITTED','BACKLOAD_REPORTED','OFFLOAD_REPORTED') and nullif(trim(p_input->>'dr_number'),'') is not null and not exists(select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id where ca.assignment_id=a.id and (sid is null or li.trip_stop_id=sid) and li.dr_number=trim(p_input->>'dr_number')) then
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
 if report_id is not null then
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
 if report_id is not null then update public.trip_events set backload_id=case when k='BACKLOAD_REPORTED' then report_id end,offload_id=case when k='OFFLOAD_REPORTED' then report_id end,delivery_metadata=delivery_metadata||jsonb_build_object('report_id',report_id,'report_type',case when k='BACKLOAD_REPORTED' then 'BACKLOAD' else 'OFFLOAD' end) where id=e.id returning * into e; end if;
 if k='ASSIGNMENT_COMPLETED' and not exists(select 1 from public.trip_truck_assignments ta where ta.trip_id=a.trip_id and ta.unassigned_at is null and not exists(select 1 from public.trip_events ev where ev.assignment_id=ta.id and ev.event_type='ASSIGNMENT_COMPLETED')) then update public.trips set status='COMPLETED' where id=a.trip_id; end if;
 return to_jsonb(e);
end $$;
revoke all on function public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.review_delivery_event_v1(p_actor uuid,p_event uuid,p_version integer,p_action text,p_reason text,p_time timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.trip_events%rowtype; original jsonb; next_time timestamptz;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='ADMIN' and deactivated_at is null) then raise exception 'Only an active Admin may correct or verify delivery evidence.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 2000 or p_action not in ('CORRECT_TIME','CONFIRM_EVIDENCE','FLAG_EVIDENCE') then raise exception 'Enter a review reason.' using errcode='22023'; end if;
 select * into e from public.trip_events where id=p_event and assignment_id is not null for update;
 if e.id is null or e.delivery_version<>p_version then raise exception 'This event changed. Reload before reviewing.' using errcode='40001'; end if;
 perform set_config('alzhen.delivery_event_write','on',true);
 original:=jsonb_build_object('event_time',e.event_time,'verification_method',e.verification_method,'delivery_version',e.delivery_version);
 if p_action='CORRECT_TIME' then
  if p_time is null or p_time>clock_timestamp()+interval '2 minutes' or p_time<e.created_at-interval '30 days' then raise exception 'Choose a valid recorded time within 30 days of submission.' using errcode='22023'; end if;
  if e.event_type in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED') then
   if not exists(select 1 from public.loading_reports lr join public.operations_report_conversions c on c.source_id=lr.id and c.source_type='LOADING' where lr.trip_id=e.trip_id) then
    update public.loading_reports set warehouse_arrival_at=case when e.event_type='WAREHOUSE_ARRIVAL' and warehouse_arrival_at=e.event_time then p_time else warehouse_arrival_at end, loading_start_at=case when e.event_type='LOADING_STARTED' and loading_start_at=e.event_time then p_time else loading_start_at end,loading_finished_at=case when e.event_type='LOADING_FINISHED' and loading_finished_at=e.event_time then p_time else loading_finished_at end where trip_id=e.trip_id;
   end if;
  elsif e.event_type='WAREHOUSE_DEPARTURE' then
   update public.trips set departure_from_warehouse_at=p_time where id=e.trip_id and departure_from_warehouse_at=e.event_time;
  elsif e.trip_stop_id is not null and not exists(select 1 from public.unloading_reports ur join public.operations_report_conversions c on c.source_id=ur.id and c.source_type='UNLOADING' where ur.trip_stop_id=e.trip_stop_id) then
   update public.trip_stops set arrival_time=case when e.event_type='ARRIVED' and arrival_time=e.event_time then p_time else arrival_time end,start_unloading_time=case when e.event_type='UNLOADING_STARTED' and start_unloading_time=e.event_time then p_time else start_unloading_time end,finish_unloading_time=case when e.event_type='UNLOADING_FINISHED' and finish_unloading_time=e.event_time then p_time else finish_unloading_time end,departure_time=case when e.event_type='STOP_DEPARTURE' and departure_time=e.event_time then p_time else departure_time end where id=e.trip_stop_id;
  end if;
  update public.trip_events set event_time=p_time,delivery_version=delivery_version+1 where id=e.id returning * into e;
 else
  if e.verification_method not in ('PHOTO_PENDING_REVIEW','PHOTO_CONFIRMED','PHOTO_FLAGGED') then raise exception 'This event has no photo-supported arrival to review.' using errcode='23514'; end if;
  update public.trip_events set verification_method=case when p_action='CONFIRM_EVIDENCE' then 'PHOTO_CONFIRMED' else 'PHOTO_FLAGGED' end,delivery_version=delivery_version+1 where id=e.id returning * into e;
 end if;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
 values(p_actor,'DELIVERY_'||p_action,'trip_events',e.id,original,jsonb_build_object('event_time',e.event_time,'verification_method',e.verification_method,'delivery_version',e.delivery_version,'reason',trim(p_reason)));
 return to_jsonb(e);
end $$;
revoke all on function public.review_delivery_event_v1(uuid,uuid,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.review_delivery_event_v1(uuid,uuid,integer,text,text,timestamptz) to service_role;
-- Event-backed times can only be updated by the audited workflow above.
create or replace function public.delivery_time_guard_v1() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if current_setting('alzhen.delivery_event_write',true)='on' then return new; end if;
 if tg_table_name='loading_reports' then
  if row(new.warehouse_arrival_at,new.loading_start_at,new.loading_finished_at) is distinct from row(old.warehouse_arrival_at,old.loading_start_at,old.loading_finished_at) and exists(select 1 from public.trip_events where trip_id=old.trip_id and assignment_id is not null and event_type in ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED')) then raise exception 'Correct saved milestone times through the Admin delivery timeline with a reason.' using errcode='23514'; end if;
 elsif tg_table_name='trip_stops' then
  if row(new.arrival_time,new.start_unloading_time,new.finish_unloading_time,new.departure_time) is distinct from row(old.arrival_time,old.start_unloading_time,old.finish_unloading_time,old.departure_time) and exists(select 1 from public.trip_events where trip_stop_id=old.id and assignment_id is not null and event_type in ('ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE')) then raise exception 'Correct saved milestone times through the Admin delivery timeline with a reason.' using errcode='23514'; end if;
 elsif new.departure_from_warehouse_at is distinct from old.departure_from_warehouse_at and exists(select 1 from public.trip_events where trip_id=old.id and assignment_id is not null and event_type='WAREHOUSE_DEPARTURE') then raise exception 'Correct saved departure time through the Admin delivery timeline with a reason.' using errcode='23514'; end if;
 return new;
end $$;
create trigger delivery_loading_time_guard before update on public.loading_reports for each row execute function public.delivery_time_guard_v1();
create trigger delivery_stop_time_guard before update on public.trip_stops for each row execute function public.delivery_time_guard_v1();
create trigger delivery_departure_time_guard before update on public.trips for each row execute function public.delivery_time_guard_v1();
revoke all on function public.delivery_time_guard_v1() from public,anon,authenticated;
commit;
