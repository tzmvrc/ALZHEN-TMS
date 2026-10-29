-- Reviewed submission workflow. No new tables, columns, backfill or Storage changes.
-- Operational dependency: 2026_10_30_simplified_delivery_sequence.sql.
-- One existing POD delivery event is one submission. Legacy documents retain v1 review.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- A stop may contain several assigned DRs. Validate the selected document's DR
-- against its exact truck/stop cargo, then reuse the existing approval/audit writer.
DO $review_dr$
DECLARE definition text; old_block text; new_block text;
BEGIN
 definition:=replace(pg_get_functiondef('public.review_pod_receipt_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
 IF position('POD_SUBMISSION_EXACT_DR' IN definition)>0 THEN RETURN; END IF;
 old_block:=$old$dr:=coalesce(nullif(btrim(s.dr_number),''),nullif(btrim(r.dr_number),''));$old$;
 new_block:=$new$-- POD_SUBMISSION_EXACT_DR: document identity remains the approval key.
  if r.delivery_event_id is not null then
   dr:=nullif(btrim(r.dr_number),'');
   if dr is null or not exists(
    select 1 from public.trip_cargo_allocations ca join public.trip_line_items li on li.id=ca.trip_line_item_id
    where ca.assignment_id=r.assignment_id and ca.trip_id=p_trip_id and li.trip_id=p_trip_id and li.trip_stop_id=p_stop_id
     and coalesce(nullif(btrim(li.dr_number),''),nullif(btrim(s.dr_number),''))=dr
   ) then raise exception 'Receipt DR is not assigned to this truck and delivery stop.' using errcode='55000';end if;
  else
   dr:=coalesce(nullif(btrim(s.dr_number),''),nullif(btrim(r.dr_number),''));
  end if;$new$;
 IF position(old_block IN definition)=0 THEN RAISE EXCEPTION 'Installed receipt DR validation differs; inspect before applying.'; END IF;
 definition:=replace(definition,old_block,new_block);
 old_block:=$old$SELECT array_agg(id) INTO ids FROM public.pod_records WHERE trip_id=p_trip_id AND trip_stop_id=p_stop_id;$old$;
 new_block:=$new$SELECT array_agg(id) INTO ids FROM public.pod_records WHERE trip_id=p_trip_id AND trip_stop_id=p_stop_id
   AND (r.delivery_event_id IS NULL OR regexp_replace(lower(coalesce(dr_number,'')),'[^a-z0-9]','','g')=regexp_replace(lower(dr),'[^a-z0-9]','','g'));$new$;
 IF position(old_block IN definition)=0 THEN RAISE EXCEPTION 'Installed POD ledger selection differs; inspect before applying.'; END IF;
 EXECUTE replace(definition,old_block,new_block);
END $review_dr$;
CREATE OR REPLACE FUNCTION public.review_pod_submission_v1(
 p_actor_id uuid,p_request_id uuid,p_trip_id uuid,p_stop_id uuid,p_receipt_id uuid,
 p_expected_review_version bigint,p_expected_ocr_version integer,p_decision text,p_reason text,
 p_reviewed_fields jsonb,p_pod_record_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.trip_images%ROWTYPE; e public.trip_events%ROWTYPE; result jsonb; canonical uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role IN ('ADMIN','STAFF')) THEN
  RAISE EXCEPTION 'POD review requires Admin or Staff.' USING ERRCODE='42501'; END IF;
 -- Match the delivery writer's lock order. Replay returns the original atomic outcome.
 PERFORM 1 FROM public.trips WHERE id=p_trip_id FOR UPDATE;
 SELECT * INTO r FROM public.trip_images WHERE id=p_receipt_id AND trip_id=p_trip_id AND trip_stop_id=p_stop_id AND kind='receipt';
 SELECT * INTO e FROM public.trip_events WHERE id=r.delivery_event_id AND trip_id=p_trip_id AND trip_stop_id=p_stop_id AND event_type='POD_SUBMITTED';
 IF e.id IS NULL OR e.assignment_id IS DISTINCT FROM r.assignment_id THEN RAISE EXCEPTION 'POD submission association is unavailable.' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM public.trip_truck_assignments WHERE id=e.assignment_id FOR UPDATE;
 PERFORM 1 FROM public.trip_stops WHERE id=p_stop_id FOR UPDATE;
 PERFORM 1 FROM public.trip_images WHERE delivery_event_id=e.id ORDER BY id FOR UPDATE;
 SELECT id INTO canonical FROM public.trip_images WHERE delivery_event_id=e.id AND kind='receipt'
  ORDER BY coalesce(display_order,0),created_at,id LIMIT 1;
 IF canonical IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Select the submission primary document before review.' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.pod_review_events WHERE actor_profile_id=p_actor_id AND request_id=p_request_id) THEN
  RETURN public.review_pod_receipt_v1(p_actor_id,p_request_id,p_trip_id,p_stop_id,p_receipt_id,p_expected_review_version,p_expected_ocr_version,p_decision,p_reason,p_reviewed_fields,p_pod_record_id);
 END IF;
 IF EXISTS(SELECT 1 FROM public.trip_images WHERE delivery_event_id=e.id AND
  (trip_id<>p_trip_id OR trip_stop_id IS DISTINCT FROM p_stop_id OR assignment_id IS DISTINCT FROM r.assignment_id OR
   uploaded_by IS DISTINCT FROM r.uploaded_by OR dr_number IS DISTINCT FROM r.dr_number OR kind<>'receipt' OR delivery_upload_state<>'READY' OR coalesce(pod_review_status,'PENDING')<>'PENDING')) THEN
  RAISE EXCEPTION 'This submission has a prior decision or inconsistent pages. Reload before reviewing.' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM public.trip_images WHERE delivery_event_id=e.id) NOT BETWEEN 1 AND 6 OR EXISTS(
  SELECT 1 FROM public.trip_images page WHERE page.delivery_event_id=e.id AND NOT EXISTS(
   SELECT 1 FROM storage.objects WHERE bucket_id='trip-images' AND name=page.storage_path)
 ) THEN RAISE EXCEPTION 'A submitted original page is missing. Restore its verified document before review.' USING ERRCODE='55000'; END IF;
 result:=public.review_pod_receipt_v1(p_actor_id,p_request_id,p_trip_id,p_stop_id,p_receipt_id,p_expected_review_version,p_expected_ocr_version,p_decision,p_reason,p_reviewed_fields,p_pod_record_id);
 -- All pages share the selected submission's decision, with one existing audit/notification.
 UPDATE public.trip_images im SET pod_review_status=decided.pod_review_status,
  pod_review_version=im.pod_review_version+1,pod_reviewed_by=decided.pod_reviewed_by,
  pod_reviewed_at=decided.pod_reviewed_at,pod_rejection_reason=decided.pod_rejection_reason,
  pod_record_id=decided.pod_record_id,updated_at=clock_timestamp()
 FROM public.trip_images decided WHERE decided.id=r.id AND im.delivery_event_id=e.id AND im.id<>r.id;
 IF p_decision='REJECTED' THEN
  UPDATE public.trip_events SET delivery_metadata=coalesce(delivery_metadata,'{}')||jsonb_build_object('dr_number',r.dr_number,'pod_replacement_request',
   jsonb_build_object('receipt_id',r.id,'reason',btrim(p_reason),'requested_at',clock_timestamp(),'review_event_id',result->>'event_id','resolved_by',NULL)) WHERE id=e.id;
 END IF;
 UPDATE public.admin_notifications SET message=CASE WHEN p_decision='REJECTED' THEN
  'POD rejected — DR '||coalesce(r.dr_number,'not recorded')||'. Please upload a new POD. Reason: '||btrim(p_reason)
  ELSE 'POD approved — DR '||coalesce(r.dr_number,'not recorded')||'.' END,
  metadata=metadata||jsonb_build_object('assignment_id',e.assignment_id,'dr_number',r.dr_number,'reason',CASE WHEN p_decision='REJECTED' THEN btrim(p_reason) END,
   'action','POD_SUBMITTED','delivery_event_id',e.id)
 WHERE id=(result->>'notification_id')::uuid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.review_pod_submission_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_pod_submission_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_pod_replacement_v1(p_actor uuid,p_assignment uuid,p_key uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.trip_images%ROWTYPE; source public.trip_events%ROWTYPE; result jsonb; a public.trip_truck_assignments%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.trips WHERE id=(SELECT trip_id FROM public.trip_truck_assignments WHERE id=p_assignment) FOR UPDATE;
 SELECT * INTO a FROM public.trip_truck_assignments WHERE id=p_assignment FOR UPDATE;
 IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=a.driver_id AND profile_id=p_actor) THEN
  RAISE EXCEPTION 'This assignment is not available to your account.' USING ERRCODE='42501'; END IF;
 -- The original writer validates request identity, ownership and complete replay payload.
 IF EXISTS(SELECT 1 FROM public.trip_events WHERE recorded_by=p_actor AND delivery_request_id=p_key) THEN
  RETURN public.submit_delivery_event_v1(p_actor,p_assignment,p_key,p_input); END IF;
 IF p_input->>'type' IS DISTINCT FROM 'POD_SUBMITTED' THEN RAISE EXCEPTION 'A replacement must be a POD.' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.trip_stops WHERE id=(p_input->>'stop_id')::uuid FOR UPDATE;
 SELECT * INTO r FROM public.trip_images WHERE id=(p_input->>'replaces_receipt_id')::uuid AND assignment_id=p_assignment
  AND trip_id=a.trip_id AND trip_stop_id=(p_input->>'stop_id')::uuid AND uploaded_by=p_actor AND kind='receipt' FOR UPDATE;
 SELECT * INTO source FROM public.trip_events WHERE id=r.delivery_event_id FOR UPDATE;
 IF r.id IS NULL OR r.pod_review_status<>'REJECTED' OR source.delivery_metadata#>>'{pod_replacement_request,receipt_id}' IS DISTINCT FROM r.id::text
  OR source.delivery_metadata#>>'{pod_replacement_request,resolved_by}' IS NOT NULL OR r.dr_number IS DISTINCT FROM btrim(p_input->>'dr_number') THEN
  RAISE EXCEPTION 'This rejection request is no longer outstanding for your stop and DR.' USING ERRCODE='40001'; END IF;
 result:=public.submit_delivery_event_v1(p_actor,p_assignment,p_key,p_input);
 UPDATE public.trip_events SET delivery_metadata=delivery_metadata||jsonb_build_object('replaces_receipt_id',r.id) WHERE id=(result->>'id')::uuid RETURNING to_jsonb(trip_events.*) INTO result;
 UPDATE public.trip_events SET delivery_metadata=jsonb_set(delivery_metadata,'{pod_replacement_request,resolved_by}',to_jsonb(result->>'id')) WHERE id=source.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb) TO service_role;

-- Guard regular submission/departure from bypassing an outstanding rejection.
DO $migration$
DECLARE definition text; anchor text:='insert into public.trip_events(trip_id,trip_stop_id,assignment_id,event_type,event_time,recorded_by,latitude,longitude,notes,device_time,accuracy_meters,verification_method,delivery_request_id,delivery_payload,delivery_metadata)';
BEGIN
 definition:=pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
 IF position('POD_REPLACEMENT_REQUEST_GUARD' IN definition)>0 THEN RETURN; END IF;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Delivery writer differs: review migration before applying.'; END IF;
 definition:=replace(definition,anchor,$guard$
 -- POD_REPLACEMENT_REQUEST_GUARD: assignment lock is already held.
 if k in ('POD_SUBMITTED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED') and exists(
  select 1 from public.trip_events request where request.assignment_id=a.id
   and (sid is null or request.trip_stop_id=sid) and request.delivery_metadata->'pod_replacement_request' is not null
   and request.delivery_metadata#>>'{pod_replacement_request,resolved_by}' is null
   and (k<>'POD_SUBMITTED' or (request.delivery_metadata->>'dr_number'=p_input->>'dr_number' and p_input->>'replaces_receipt_id' is null))
 ) then raise exception 'Upload the Admin-requested replacement POD before continuing.' using errcode='23514'; end if;
 $guard$||anchor);
 EXECUTE definition;
END $migration$;
-- Required requests also block automatic last-stop completion, including a
-- rejection at an earlier stop that once had another approved receipt.
DO $ready$
DECLARE definition text; anchor text:='WHERE a.id=p_assignment AND s.id=p_stop AND s.archived_at IS NULL';
BEGIN
 IF to_regprocedure('public.delivery_stop_pod_ready_v1(uuid,uuid,boolean)') IS NULL THEN RETURN; END IF;
 definition:=pg_get_functiondef('public.delivery_stop_pod_ready_v1(uuid,uuid,boolean)'::regprocedure);
 IF position('POD_REPLACEMENT_READY_GUARD' IN definition)>0 THEN RETURN; END IF;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Installed POD readiness differs; inspect before applying.'; END IF;
 EXECUTE replace(definition,anchor,anchor||$guard$
   -- POD_REPLACEMENT_READY_GUARD
   AND NOT EXISTS(SELECT 1 FROM public.trip_events request WHERE request.assignment_id=a.id AND request.trip_stop_id=s.id
    AND request.delivery_metadata->'pod_replacement_request' IS NOT NULL
    AND request.delivery_metadata#>>'{pod_replacement_request,resolved_by}' IS NULL)
 $guard$);
END $ready$;
NOTIFY pgrst, 'reload schema';
COMMIT;
