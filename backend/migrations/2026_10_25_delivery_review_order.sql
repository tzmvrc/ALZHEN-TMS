begin;
create or replace function public.review_delivery_event_v1(p_actor uuid,p_event uuid,p_version integer,p_action text,p_reason text,p_time timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.trip_events%rowtype; original jsonb; sequence text[]; rank integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='ADMIN' and deactivated_at is null) then raise exception 'Only an active Admin may correct or verify delivery evidence.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 2000 or p_action not in ('CORRECT_TIME','CONFIRM_EVIDENCE','FLAG_EVIDENCE') then raise exception 'Enter a review reason.' using errcode='22023'; end if;
 perform 1 from public.trips where id=(select trip_id from public.trip_events where id=p_event) for update;
 select * into e from public.trip_events where id=p_event and assignment_id is not null for update;
 if e.id is null or e.delivery_version<>p_version then raise exception 'This event changed. Reload before reviewing.' using errcode='40001'; end if;
 perform set_config('alzhen.delivery_event_write','on',true);
 original:=jsonb_build_object('event_time',e.event_time,'verification_method',e.verification_method,'delivery_version',e.delivery_version);
 if p_action='CORRECT_TIME' then
  if p_time is null or p_time>clock_timestamp()+interval '2 minutes' or p_time<e.created_at-interval '30 days' then raise exception 'Choose a valid recorded time within 30 days of submission.' using errcode='22023'; end if;
  sequence:=case when e.trip_stop_id is null then array['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ASSIGNMENT_COMPLETED'] else array['ARRIVED','UNLOADING_STARTED','PARTIAL_UNLOAD','UNLOADING_FINISHED','STOP_DEPARTURE'] end;
  rank:=array_position(sequence,e.event_type);
  if rank is not null and exists(select 1 from public.trip_events other where other.assignment_id=e.assignment_id and other.id<>e.id and other.trip_stop_id is not distinct from e.trip_stop_id and ((array_position(sequence,other.event_type)<rank and other.event_time>p_time) or (array_position(sequence,other.event_type)>rank and other.event_time<p_time))) then raise exception 'The corrected time must preserve the saved milestone order.' using errcode='23514'; end if;
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
create or replace function public.set_delivery_geofence_v1(p_actor uuid,p_kind text,p_location uuid,p_radius integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='ADMIN' and deactivated_at is null) then raise exception 'Only Admin may configure arrival areas.' using errcode='42501'; end if;
 if p_radius is null or p_radius<100 or p_radius>5000 or p_kind not in ('warehouses','customer_stores') then raise exception 'Choose an arrival radius between 100 and 5000 meters.' using errcode='22023'; end if;
 if p_kind='warehouses' then
  select arrival_radius_meters into previous from public.warehouses where id=p_location for update;
  if not found then raise exception 'Warehouse not found.' using errcode='22023'; end if;
  update public.warehouses set arrival_radius_meters=p_radius where id=p_location;
 else
  select arrival_radius_meters into previous from public.customer_stores where id=p_location for update;
  if not found then raise exception 'Destination not found.' using errcode='22023'; end if;
  update public.customer_stores set arrival_radius_meters=p_radius where id=p_location;
 end if;
 if previous<>p_radius then insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) values(p_actor,'DELIVERY_GEOFENCE_CHANGED',p_kind,p_location,jsonb_build_object('arrival_radius_meters',previous),jsonb_build_object('arrival_radius_meters',p_radius)); end if;
 return jsonb_build_object('arrival_radius_meters',p_radius);
end $$;
revoke all on function public.set_delivery_geofence_v1(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.set_delivery_geofence_v1(uuid,text,uuid,integer) to service_role;
commit;
