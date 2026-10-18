-- Phase 2C.7. Additive, service-only retry journal and image reservations.
-- No operational backfill/deletion, Storage policy, publication or base grant changes.
-- Recovery: stop new submissions; retain this journal and PENDING receipts until
-- reconciled. Revert application first. Do not drop retry evidence or pending bytes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE public.operations_submission_requests (
 actor_id uuid NOT NULL,
 request_id uuid NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('OFFLOAD','BACKLOAD')),
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object' AND octet_length(request_payload::text)<=20000),
 outcome jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE public.operations_submission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_submission_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.operations_submission_requests TO service_role;

-- Shared scope guard: locks prevent assignment/parent changes during each RPC.
CREATE FUNCTION public.lock_operations_submission_scope_v1(p_actor uuid,p_trip uuid,p_stop uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE actor_role text;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=p_actor FOR SHARE;
 IF actor_role IS NULL OR actor_role NOT IN ('ADMIN','STAFF','TRUCKER') THEN
  RAISE EXCEPTION 'Reporting is not authorized.' USING ERRCODE='42501';
 END IF;
 PERFORM id FROM public.trips WHERE id=p_trip AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trip unavailable.' USING ERRCODE='P0002'; END IF;
 IF p_stop IS NOT NULL THEN
  PERFORM id FROM public.trip_stops WHERE id=p_stop AND trip_id=p_trip AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stop does not belong to this active trip.' USING ERRCODE='23514'; END IF;
 END IF;
 IF actor_role='TRUCKER' THEN
  PERFORM a.id FROM public.trip_truck_assignments a JOIN public.drivers d ON d.id=a.driver_id
   WHERE a.trip_id=p_trip AND a.unassigned_at IS NULL AND d.profile_id=p_actor FOR SHARE OF a,d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trucker is not actively assigned.' USING ERRCODE='42501'; END IF;
 END IF;
END $$;

CREATE FUNCTION public.submit_operations_report_v1(p_actor uuid,p_request uuid,p_type text,p_payload jsonb,p_report jsonb,p_item jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior public.operations_submission_requests; result jsonb; trip uuid; stop uuid;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_type IS NULL OR p_type NOT IN ('OFFLOAD','BACKLOAD')
  OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>20000
  OR btrim(coalesce(p_report->>'reason',''))='' OR length(p_report->>'reason')>2000
 THEN RAISE EXCEPTION 'Invalid submission.' USING ERRCODE='22023'; END IF;
 trip:=(p_report->>'trip_id')::uuid; stop:=(p_report->>'trip_stop_id')::uuid;
 PERFORM public.lock_operations_submission_scope_v1(p_actor,trip,stop);
 PERFORM pg_advisory_xact_lock(hashtextextended('operations-submit:'||p_actor::text||':'||p_request::text,0));
 SELECT * INTO prior FROM public.operations_submission_requests WHERE actor_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF prior.source_type<>p_type OR prior.request_payload<>p_payload THEN
   RAISE EXCEPTION 'Submission request was already used for different content.' USING ERRCODE='40001';
  END IF;
  -- Never recreate a report after explicit deletion or conversion.
  IF p_type='OFFLOAD' THEN PERFORM id FROM public.offloads WHERE id=(prior.outcome->>'id')::uuid;
  ELSE PERFORM id FROM public.backloads WHERE id=(prior.outcome->>'id')::uuid; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Previously submitted report is no longer available.' USING ERRCODE='55000'; END IF;
  RETURN prior.outcome;
 END IF;
 IF p_type='OFFLOAD' THEN
  IF stop IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=stop AND btrim(coalesce(dr_number,''))<>'') THEN
   RAISE EXCEPTION 'Select an exact DR transaction.' USING ERRCODE='23514';
  END IF;
  result:=public.create_offload_with_item_v1(p_report||jsonb_build_object('created_by',p_actor,'submitted_by',p_actor),p_item);
 ELSE
  INSERT INTO public.backloads(trip_id,trip_stop_id,reason,number_of_boxes,comments,created_by,submitted_by,submitted_at,event_type)
   VALUES(trip,stop,p_report->>'reason',(p_report->>'number_of_boxes')::numeric,p_report->>'comments',p_actor,p_actor,clock_timestamp(),'Backload')
   RETURNING to_jsonb(backloads.*) INTO result;
 END IF;
 INSERT INTO public.operations_submission_requests(actor_id,request_id,source_type,request_payload,outcome)
  VALUES(p_actor,p_request,p_type,p_payload,result);
 RETURN result;
END $$;

ALTER TABLE public.report_receipts
 ADD COLUMN upload_request_id uuid,
 ADD COLUMN upload_sha256 text CHECK(upload_sha256 IS NULL OR upload_sha256 ~ '^[a-f0-9]{64}$'),
 ADD COLUMN upload_status text NOT NULL DEFAULT 'READY' CHECK(upload_status IN ('PENDING','READY'));
CREATE UNIQUE INDEX report_receipts_upload_request_uidx ON public.report_receipts(uploaded_by,upload_request_id) WHERE upload_request_id IS NOT NULL;
-- Live service_role deliberately lacks general receipt UPDATE. Only the two
-- completion columns are granted; no ownership/path/scope edits are added.
GRANT UPDATE(upload_status,received_at) ON public.report_receipts TO service_role;

-- Same parent-row lock used by existing scope/deletion/conversion guards.
-- Count reservations too: simultaneous Backload uploaders cannot exceed 20.
CREATE FUNCTION public.check_backload_receipt_capacity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.backload_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.backload_id IS NOT DISTINCT FROM NEW.backload_id THEN RETURN NEW; END IF;
 PERFORM id FROM public.backloads WHERE id=NEW.backload_id FOR UPDATE;
 IF (SELECT count(*) FROM public.report_receipts WHERE backload_id=NEW.backload_id AND id<>NEW.id)>=20 THEN
  RAISE EXCEPTION 'A Backload supports at most twenty images.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER backload_receipt_capacity_trg BEFORE INSERT OR UPDATE OF backload_id ON public.report_receipts
 FOR EACH ROW EXECUTE FUNCTION public.check_backload_receipt_capacity_v1();

CREATE FUNCTION public.reserve_operations_receipt_v1(p_actor uuid,p_request uuid,p_type text,p_record uuid,p_name text,p_mime text,p_size bigint,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE parent record; saved public.report_receipts; path text; ext text;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_type IS NULL OR p_type NOT IN ('OFFLOAD','BACKLOAD')
  OR p_name IS NULL OR length(p_name)>255 OR length(p_name)=0
  OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 5242880 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$'
  OR p_mime IS NULL OR p_mime NOT IN ('image/jpeg','image/png','image/webp') THEN
  RAISE EXCEPTION 'Invalid image reservation.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('operations-upload:'||p_actor::text||':'||p_request::text,0));
 IF p_type='OFFLOAD' THEN SELECT id,trip_id,trip_stop_id INTO parent FROM public.offloads WHERE id=p_record FOR UPDATE;
 ELSE SELECT id,trip_id,trip_stop_id INTO parent FROM public.backloads WHERE id=p_record FOR UPDATE; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not found.' USING ERRCODE='P0002'; END IF;
 PERFORM public.lock_operations_submission_scope_v1(p_actor,parent.trip_id,parent.trip_stop_id);
 SELECT * INTO saved FROM public.report_receipts WHERE uploaded_by=p_actor AND upload_request_id=p_request;
 IF FOUND THEN
  IF coalesce(saved.offload_id,saved.backload_id)<>p_record OR (p_type='OFFLOAD')<>(saved.offload_id IS NOT NULL)
   OR saved.file_name<>p_name OR saved.mime_type<>p_mime OR saved.file_size_bytes<>p_size OR saved.upload_sha256<>p_sha256 THEN
   RAISE EXCEPTION 'Image request was already used for different content.' USING ERRCODE='40001';
  END IF;
  RETURN to_jsonb(saved);
 END IF;
 ext:=CASE p_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
 -- Keep the installed deletion RPC's UUID filename ownership contract.
 path:='operations/'||parent.trip_id::text||'/'||lower(p_type)||'/'||p_record::text||'/'||gen_random_uuid()::text||'.'||ext;
 INSERT INTO public.report_receipts(trip_id,trip_stop_id,offload_id,backload_id,storage_path,file_name,mime_type,file_size_bytes,uploaded_by,upload_request_id,upload_sha256,upload_status)
  VALUES(parent.trip_id,parent.trip_stop_id,CASE WHEN p_type='OFFLOAD' THEN p_record END,CASE WHEN p_type='BACKLOAD' THEN p_record END,path,p_name,p_mime,p_size,p_actor,p_request,p_sha256,'PENDING')
  RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;

-- A pending reservation must remain durable while a Storage write can still
-- complete. Never let deletion/conversion discard that ownership evidence.
CREATE FUNCTION public.guard_pending_operations_receipt_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.upload_status='PENDING' AND (TG_OP='DELETE' OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
  OR NEW.trip_stop_id IS DISTINCT FROM OLD.trip_stop_id OR NEW.offload_id IS DISTINCT FROM OLD.offload_id
  OR NEW.backload_id IS DISTINCT FROM OLD.backload_id) THEN
  RAISE EXCEPTION 'An image upload is incomplete. Retry the original upload before deleting or converting this report.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pending_operations_receipt_guard_trg BEFORE DELETE OR UPDATE ON public.report_receipts
 FOR EACH ROW EXECUTE FUNCTION public.guard_pending_operations_receipt_v1();

CREATE FUNCTION public.complete_operations_receipt_v1(p_actor uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.report_receipts;
BEGIN
 SELECT * INTO r FROM public.report_receipts WHERE uploaded_by=p_actor AND upload_request_id=p_request;
 IF NOT FOUND THEN RAISE EXCEPTION 'Image reservation not found.' USING ERRCODE='P0002'; END IF;
 IF r.offload_id IS NOT NULL THEN PERFORM id FROM public.offloads WHERE id=r.offload_id FOR UPDATE;
 ELSE PERFORM id FROM public.backloads WHERE id=r.backload_id FOR UPDATE; END IF;
 PERFORM public.lock_operations_submission_scope_v1(p_actor,r.trip_id,r.trip_stop_id);
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='report-receipts' AND name=r.storage_path) THEN
  RAISE EXCEPTION 'Image bytes are not yet available. Retry this upload.' USING ERRCODE='55000';
 END IF;
 UPDATE public.report_receipts SET upload_status='READY',received_at=coalesce(received_at,clock_timestamp())
  WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.lock_operations_submission_scope_v1(uuid,uuid,uuid),public.submit_operations_report_v1(uuid,uuid,text,jsonb,jsonb,jsonb),public.reserve_operations_receipt_v1(uuid,uuid,text,uuid,text,text,bigint,text),public.complete_operations_receipt_v1(uuid,uuid),public.check_backload_receipt_capacity_v1(),public.guard_pending_operations_receipt_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lock_operations_submission_scope_v1(uuid,uuid,uuid),public.submit_operations_report_v1(uuid,uuid,text,jsonb,jsonb,jsonb),public.reserve_operations_receipt_v1(uuid,uuid,text,uuid,text,text,bigint,text),public.complete_operations_receipt_v1(uuid,uuid) TO service_role;
COMMIT;
