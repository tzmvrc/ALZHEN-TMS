-- Keep the installed RPC's authorization, idempotency, evidence ownership and milestones.
-- Related receipts live on the existing authoritative trip event; no new tables.
DO $migration$
DECLARE definition text; old_block text; new_block text;
BEGIN
 definition := pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
 IF position('Validate related report receipts' in definition)>0 THEN RETURN; END IF;
 old_block := $old$ if k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED','DEMURRAGE_REPORTED') or (k='CUSTOM_STATUS' and p_input->>'title' in ('Accident','Vehicle breakdown')) then
  if length(trim(coalesce(p_input->>'remarks','')))<5 or jsonb_array_length(coalesce(p_input->'attachments','[]'))=0 then raise exception 'Add a reason and photo evidence for this report.' using errcode='23514'; end if;
 end if;$old$;
 new_block := $new$ -- Validate related report receipts against this exact assignment, inside the transaction.
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
 end if;$new$;
 definition:=replace(definition,E'\r\n',E'\n');
 old_block:=replace(old_block,E'\r\n',E'\n');
 new_block:=replace(new_block,E'\r\n',E'\n');
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed report validation differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 old_block := $old$meta||jsonb_build_object('title',p_input->>'title','gps_captured_at',captured,'dr_number',p_input->>'dr_number')$old$;
 new_block := $new$meta||jsonb_build_object('title',p_input->>'title','gps_captured_at',captured,'dr_number',case when k in ('BACKLOAD_REPORTED','OFFLOAD_REPORTED','DEMURRAGE_REPORTED') then meta->>'dr_number' else p_input->>'dr_number' end)$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed event metadata differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 -- Formal reports use the complete receipt list checked above, including stop-level DRs.
 old_block := $old$if k in ('POD_SUBMITTED','BACKLOAD_REPORTED','OFFLOAD_REPORTED') and nullif(trim(p_input->>'dr_number'),'') is not null$old$;
 new_block := $new$if k='POD_SUBMITTED' and nullif(trim(p_input->>'dr_number'),'') is not null$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Installed receipt validation differs; inspect before updating.';END IF;
 definition:=replace(definition,old_block,new_block);
 EXECUTE definition;
END $migration$;
