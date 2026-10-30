-- PROPOSAL ONLY: do not apply without explicit approval. No operational backfill.
-- Additive receipt decision metadata; existing OCR verification remains separate.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.trip_images
 ADD COLUMN pod_review_status text NOT NULL DEFAULT 'PENDING' CHECK (pod_review_status IN ('PENDING','APPROVED','REJECTED')),
 ADD COLUMN pod_review_version bigint NOT NULL DEFAULT 0 CHECK (pod_review_version BETWEEN 0 AND 9007199254740991),
 ADD COLUMN pod_reviewed_at timestamptz,
 ADD COLUMN pod_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN pod_rejection_reason text,
 ADD COLUMN pod_record_id uuid REFERENCES public.pod_records(id) ON DELETE SET NULL;

CREATE TABLE public.pod_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,
 actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 actor_snapshot text NOT NULL,
 -- Immutable identity snapshots, deliberately not FKs: authorized permanent
 -- transaction/document deletion must not erase this minimal decision audit.
 receipt_id uuid NOT NULL, trip_id uuid NOT NULL, trip_stop_id uuid NOT NULL,
 decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
 reason text, reviewed_fields jsonb NOT NULL CHECK (jsonb_typeof(reviewed_fields)='object'),
 expected_review_version bigint NOT NULL, expected_ocr_version integer NOT NULL,
 outcome jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_profile_id,request_id)
);
CREATE INDEX pod_review_events_receipt_idx ON public.pod_review_events(receipt_id,created_at DESC,id);
ALTER TABLE public.pod_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pod_review_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.pod_review_events TO service_role;

ALTER TABLE public.admin_notifications DROP CONSTRAINT admin_notifications_notification_type_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_notification_type_check
 CHECK (notification_type IN ('report_mention','pod_approved','pod_rejected','master_list_edit'));

CREATE FUNCTION public.review_pod_receipt_v1(
 p_actor_id uuid,p_request_id uuid,p_trip_id uuid,p_stop_id uuid,p_receipt_id uuid,
 p_expected_review_version bigint,p_expected_ocr_version integer,p_decision text,
 p_reason text,p_reviewed_fields jsonb,p_pod_record_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.review_pod_receipt_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_pod_receipt_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid) TO service_role;
COMMIT;

-- Recovery: disable POD_REVIEW_ENABLED first. Keep audit/decision data. After
-- dependency review, revoke service EXECUTE to stop new decisions. Do not DROP
-- audit or receipt columns, or narrow notification CHECK while POD notices exist.
-- No base POD grants, browser grants, publication or Storage changes required.
