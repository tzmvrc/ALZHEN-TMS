-- Keep event identifiers and historical records. No data backfill or deletes.
-- Apply this migration before running the updated delivery workflow.
BEGIN;
CREATE OR REPLACE FUNCTION public.delivery_stop_pod_ready_v1(p_assignment uuid,p_stop uuid,p_require_approved boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $pod$
 WITH scope AS (
  SELECT a.id assignment_id,a.trip_id,s.id trip_stop_id,s.dr_number
  FROM public.trip_truck_assignments a JOIN public.trip_stops s ON s.trip_id=a.trip_id
  WHERE a.id=p_assignment AND s.id=p_stop AND s.archived_at IS NULL
   AND (a.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops r WHERE r.assignment_id=a.id AND r.trip_stop_id=s.id))
 ), cargo_dr AS (
  SELECT DISTINCT coalesce(nullif(btrim(li.dr_number),''),nullif(btrim(s.dr_number),'')) dr
  FROM scope s JOIN public.trip_cargo_allocations ca ON ca.assignment_id=s.assignment_id AND ca.trip_id=s.trip_id
  JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id AND li.trip_id=s.trip_id AND li.trip_stop_id=s.trip_stop_id
 ), expected AS (
  SELECT dr FROM cargo_dr WHERE dr IS NOT NULL
  UNION SELECT nullif(btrim(s.dr_number),'') FROM scope s WHERE NOT EXISTS(SELECT 1 FROM cargo_dr WHERE dr IS NOT NULL) AND nullif(btrim(s.dr_number),'') IS NOT NULL
 ), documents AS (
  SELECT d.* FROM public.v_confirmed_pod_documents d JOIN scope s ON s.assignment_id=d.assignment_id AND s.trip_stop_id=d.trip_stop_id AND s.trip_id=d.trip_id
  WHERE d.pod_submitted_at IS NOT NULL AND CASE WHEN p_require_approved THEN d.approved ELSE d.pod_status<>'REJECTED' END
 ) SELECT EXISTS(SELECT 1 FROM scope) AND CASE WHEN EXISTS(SELECT 1 FROM expected)
  THEN NOT EXISTS(SELECT 1 FROM expected ex WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE btrim(d.dr_number)=ex.dr))
  ELSE EXISTS(SELECT 1 FROM documents) END;
$pod$;
REVOKE ALL ON FUNCTION public.delivery_stop_pod_ready_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_stop_pod_ready_v1(uuid,uuid,boolean) TO service_role;

DO $migration$
DECLARE definition text; old_block text; new_block text;
BEGIN
 definition:=replace(pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure),E'\r\n',E'\n');
 IF position('Simplified confirmed delivery sequence' in definition)=0 THEN
 old_block:=$old$when 'UNLOADING_STARTED' then 'ARRIVED'$old$;
 new_block:=$new$when 'POD_SUBMITTED' then 'ARRIVED' when 'UNLOADING_STARTED' then 'POD_SUBMITTED'$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$ predecessor:=case k$old$;
 new_block:=$new$ -- Simplified confirmed delivery sequence: upload does not mean approval.
 if k in ('UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE') and not public.delivery_stop_pod_ready_v1(a.id,sid,false) then
  raise exception 'Upload the required POD receipts for this stop before unloading.' using errcode='23514';end if;
 if k='STOP_DEPARTURE' then
  if exists(select 1 from unnest(array['ARRIVED','POD_SUBMITTED','UNLOADING_STARTED','UNLOADING_FINISHED']) required(kind) where not exists(
   select 1 from public.trip_events ev where ev.assignment_id=a.id and ev.trip_stop_id=sid and ev.event_type=required.kind
  )) then raise exception 'Confirm arrival, upload POD, start unloading and finish unloading before completing delivery.' using errcode='23514';end if;
  if not public.delivery_stop_pod_ready_v1(a.id,sid,true) then raise exception 'Wait for Admin approval of every required POD receipt before completing delivery.' using errcode='23514';end if;
 end if;
 if k='ASSIGNMENT_COMPLETED' and exists(
  select 1 from public.trip_stops st where st.trip_id=a.trip_id and st.archived_at is null
   and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops r where r.assignment_id=a.id and r.trip_stop_id=st.id))
   and (not public.delivery_stop_pod_ready_v1(a.id,st.id,true) or exists(select 1 from unnest(array['ARRIVED','POD_SUBMITTED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE']) required(kind) where not exists(select 1 from public.trip_events ev where ev.assignment_id=a.id and ev.trip_stop_id=st.id and ev.event_type=required.kind)))
 ) then raise exception 'Complete every assigned stop and obtain the required POD approvals first.' using errcode='23514';end if;
 predecessor:=case k$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$ if k='UNLOADING_FINISHED' and exists(select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id where ca.assignment_id=a.id and li.trip_stop_id=sid and ca.quantity>coalesce((select sum(quantity) from public.trip_delivery_quantities where allocation_id=ca.id),0)) then raise exception 'Record the remaining unloaded quantities before finishing this stop.' using errcode='23514'; end if;$old$;
 new_block:=$new$ -- Finished Unloading confirms remaining assigned quantities in the same transaction.
 -- Retain earlier partial quantity history; never create a redundant partial-unload event.
 if k='UNLOADING_FINISHED' then
  for allocation in select ca.* from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id
   where ca.assignment_id=a.id and ca.trip_id=a.trip_id and li.trip_id=a.trip_id and li.trip_stop_id=sid order by ca.id for update of ca loop
   select coalesce(sum(quantity),0) into used from public.trip_delivery_quantities where allocation_id=allocation.id;
   qty:=allocation.quantity-used;
   if qty<0 then raise exception 'Recorded unloading exceeds assigned cargo. Ask Admin to review the allocation.' using errcode='23514';end if;
   if qty>0 then insert into public.trip_delivery_quantities(event_id,allocation_id,quantity) values(e.id,allocation.id,qty);end if;
  end loop;
 end if;$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$case when k in ('UNLOADING_FINISHED','STOP_DEPARTURE') then 'COMPLETED' else 'IN_PROGRESS' end$old$;
 new_block:=$new$case when k='STOP_DEPARTURE' then 'COMPLETED' else 'IN_PROGRESS' end$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$active_count=(select count(*) from public.trip_assignment_stops x join public.trip_truck_assignments ta on ta.id=x.assignment_id where x.trip_stop_id=sid and x.progress='COMPLETED' and ta.unassigned_at is null)$old$;
 new_block:=$new$active_count=(select count(distinct ev.assignment_id) from public.trip_events ev join public.trip_truck_assignments ta on ta.id=ev.assignment_id where ev.trip_stop_id=sid and ev.event_type='UNLOADING_FINISHED' and ta.unassigned_at is null)$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$ perform public.refresh_confirmed_delivery_state_v1(a.trip_id);$old$;
 new_block:=$new$ -- Last-stop completion also completes the assignment; no extra driver action.
 if k='STOP_DEPARTURE' and not exists(select 1 from public.trip_events where assignment_id=a.id and event_type='ASSIGNMENT_COMPLETED') and not exists(
  select 1 from public.trip_stops st where st.trip_id=a.trip_id and st.archived_at is null
   and (a.stop_scope='ALL' or exists(select 1 from public.trip_assignment_stops r where r.assignment_id=a.id and r.trip_stop_id=st.id))
   and (exists(select 1 from unnest(array['ARRIVED','POD_SUBMITTED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE']) required(kind) where not exists(select 1 from public.trip_events ev where ev.assignment_id=a.id and ev.trip_stop_id=st.id and ev.event_type=required.kind)) or not public.delivery_stop_pod_ready_v1(a.id,st.id,true))
 ) then
  insert into public.trip_events(trip_id,assignment_id,event_type,event_time,recorded_by,verification_method,notes,delivery_metadata)
  values(a.trip_id,a.id,'ASSIGNMENT_COMPLETED',ts,p_actor,'RECORDED','All assigned deliveries confirmed complete.',jsonb_build_object('automatic',true,'completed_by_event',e.id));
 end if;
 perform public.refresh_confirmed_delivery_state_v1(a.trip_id);$new$;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed delivery RPC differs; inspect before changing the workflow.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$and li.dr_number=trim(p_input->>'dr_number')) then$old$;
 new_block:=$new$and coalesce(nullif(btrim(li.dr_number),''),(select nullif(btrim(st.dr_number),'') from public.trip_stops st where st.id=li.trip_stop_id and st.trip_id=a.trip_id))=trim(p_input->>'dr_number')) then$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed POD receipt validation differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$'title',p_input->>'title','gps_captured_at'$old$;
 new_block:=$new$'title',case when k='STOP_DEPARTURE' then 'Delivery completed' else p_input->>'title' end,'gps_captured_at'$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed milestone metadata differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 -- Stop state is derived after the transaction, never completed by unloading alone.
 old_block:=$old$delivery_status=case when k='UNLOADING_FINISHED' and active_count=(select count(distinct ev.assignment_id) from public.trip_events ev join public.trip_truck_assignments ta on ta.id=ev.assignment_id where ev.trip_stop_id=sid and ev.event_type='UNLOADING_FINISHED' and ta.unassigned_at is null) then 'COMPLETED' when delivery_status='PENDING' then 'IN_PROGRESS' else delivery_status end$old$;
 new_block:=$new$delivery_status=case when delivery_status='PENDING' then 'IN_PROGRESS' else delivery_status end$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed unloading status mapping differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 EXECUTE definition;
 END IF;
END $migration$;

DO $review$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.review_delivery_event_v1(uuid,uuid,integer,text,text,timestamp with time zone)'::regprocedure);
 IF position('POD replacements retain their actual times' in definition)=0 THEN
  IF position('''ARRIVED'',''UNLOADING_STARTED'',''PARTIAL_UNLOAD'',''UNLOADING_FINISHED'',''STOP_DEPARTURE''' in definition)=0 THEN RAISE EXCEPTION 'Installed timestamp review sequence differs; inspect before updating.';END IF;
  definition:=replace(definition,'''ARRIVED'',''UNLOADING_STARTED'',''PARTIAL_UNLOAD'',''UNLOADING_FINISHED'',''STOP_DEPARTURE''','''ARRIVED'',''POD_SUBMITTED'',''UNLOADING_STARTED'',''UNLOADING_FINISHED'',''STOP_DEPARTURE''');
  definition:=replace(definition,'rank:=array_position(sequence,e.event_type);',$patch$rank:=array_position(sequence,e.event_type);
  -- POD replacements retain their actual times after the initial upload milestone.
  if e.event_type='POD_SUBMITTED' and exists(select 1 from public.trip_events prior where prior.assignment_id=e.assignment_id and prior.trip_stop_id=e.trip_stop_id and prior.event_type='POD_SUBMITTED' and (prior.event_time,prior.id)<(e.event_time,e.id)) then rank:=null;end if;$patch$);
  definition:=replace(definition,'other.id<>e.id and other.trip_stop_id',$patch$other.id<>e.id and (other.event_type<>'POD_SUBMITTED' or not exists(select 1 from public.trip_events prior where prior.assignment_id=other.assignment_id and prior.trip_stop_id=other.trip_stop_id and prior.event_type='POD_SUBMITTED' and (prior.event_time,prior.id)<(other.event_time,other.id))) and other.trip_stop_id$patch$);
  EXECUTE definition;
 END IF;
END $review$;
COMMIT;
