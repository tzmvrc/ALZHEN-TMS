-- After fixture and four proposals, in a disposable local database ONLY.
DO $$
DECLARE a uuid:='00000000-0000-4000-8000-000000000001'; st uuid:='00000000-0000-4000-8000-000000000100';
 trip uuid:='00000000-0000-4000-8000-000000000010'; r uuid:='00000000-0000-4000-8000-000000000200'; request uuid:='00000000-0000-4000-8000-000000000300';
 result jsonb; replay jsonb;
BEGIN
 result:=review_pod_receipt_v1(a,request,trip,st,r,0,0,'APPROVED',NULL,'{"dr_number":"333","quantity":0}');
 replay:=review_pod_receipt_v1(a,request,trip,st,r,0,0,'APPROVED',NULL,'{"dr_number":"333","quantity":0}');
 IF result<>replay OR (SELECT count(*) FROM admin_notifications)<>1 OR (SELECT count(*) FROM pod_review_events)<>1 THEN RAISE EXCEPTION 'idempotency/notification'; END IF;
 IF (SELECT pod_status FROM pod_records WHERE trip_stop_id=st)<>'RECEIVED' THEN RAISE EXCEPTION 'linked record not received'; END IF;
 IF EXISTS(SELECT FROM pod_records WHERE trip_stop_id<>'00000000-0000-4000-8000-000000000101' AND transmittal_reference IS NOT NULL) THEN RAISE EXCEPTION 'copied reference'; END IF;
 IF (SELECT pod_status||transmittal_reference||remarks FROM pod_records WHERE id='00000000-0000-4000-8000-000000000070')<>'SHIPPEDKEEP-REFERENCEKeep remarks' THEN RAISE EXCEPTION 'sibling overwritten'; END IF;
 BEGIN PERFORM review_pod_receipt_v1(a,request,trip,st,r,0,0,'REJECTED','Changed request','{}'); RAISE EXCEPTION 'reused request accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM review_pod_receipt_v1('00000000-0000-4000-8000-000000000003',gen_random_uuid(),trip,st,r,1,0,'REJECTED','No','{}'); RAISE EXCEPTION 'trucker review accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM review_pod_receipt_v1(a,gen_random_uuid(),trip,st,'00000000-0000-4000-8000-000000000201',0,0,'APPROVED',NULL,'{}'); RAISE EXCEPTION 'cross stop accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM review_pod_receipt_v1(a,gen_random_uuid(),trip,st,r,0,0,'APPROVED',NULL,'{}'); RAISE EXCEPTION 'stale version accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM review_pod_receipt_v1(a,gen_random_uuid(),trip,st,'00000000-0000-4000-8000-000000000202',0,0,'REJECTED','','{}'); RAISE EXCEPTION 'blank reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 DELETE FROM storage.objects WHERE name=(SELECT storage_path FROM trip_images WHERE id='00000000-0000-4000-8000-000000000204');
 BEGIN PERFORM review_pod_receipt_v1(a,gen_random_uuid(),trip,st,'00000000-0000-4000-8000-000000000204',0,0,'APPROVED',NULL,'{}'); RAISE EXCEPTION 'missing document accepted'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 INSERT INTO storage.objects(bucket_id,name) SELECT 'trip-images',storage_path FROM trip_images WHERE id='00000000-0000-4000-8000-000000000204';
 PERFORM review_pod_receipt_v1(a,gen_random_uuid(),trip,'00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201',0,0,'REJECTED','Unreadable. Upload a clearer original.','{}');
 IF (SELECT pod_status FROM pod_records WHERE id='00000000-0000-4000-8000-000000000070')<>'SHIPPED' THEN RAISE EXCEPTION 'rejection changed downstream POD'; END IF;
 IF (SELECT count(*) FROM admin_notifications WHERE notification_type='pod_rejected' AND recipient_profile_id='00000000-0000-4000-8000-000000000003')<>1 THEN RAISE EXCEPTION 'rejection recipient'; END IF;
 IF has_function_privilege('authenticated','review_pod_receipt_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid)','EXECUTE') OR has_table_privilege('authenticated','pod_review_events','SELECT') THEN RAISE EXCEPTION 'browser exposure'; END IF;
 IF NOT EXISTS(SELECT FROM storage.buckets WHERE id='trip-images' AND NOT public AND file_size_limit=5242880 AND 'application/pdf'=ANY(allowed_mime_types)) THEN RAISE EXCEPTION 'PDF bucket'; END IF;
END $$;
-- Simulate notification failure and prove decision/POD/audit roll back together.
ALTER TABLE admin_notifications ADD CONSTRAINT fixture_no_approval CHECK(notification_type<>'pod_approved') NOT VALID;
DO $$ BEGIN
 BEGIN PERFORM review_pod_receipt_v1('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000202',0,0,'APPROVED',NULL,'{}');
 RAISE EXCEPTION 'notification failure ignored'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT pod_review_status FROM trip_images WHERE id='00000000-0000-4000-8000-000000000202')<>'PENDING' OR (SELECT count(*) FROM pod_review_events)<>2 THEN RAISE EXCEPTION 'non-atomic failure'; END IF;
END $$;
ALTER TABLE admin_notifications DROP CONSTRAINT fixture_no_approval;
INSERT INTO pod_extraction_runs(request_id,receipt_id,actor_profile_id,ocr_version,input_sha256,original_ocr_text,model,external_consent_at,state,lease_token,lease_expires_at)
 VALUES('00000000-0000-4000-8000-000000000400','00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000001',0,repeat('a',64),'SYNTHETIC ONLY','gemini-2.5-flash',now(),'PROCESSING',gen_random_uuid(),now()+interval '1 minute');
UPDATE pod_extraction_runs SET state='FAILED',error_code='POD_AI_BILLING_REQUIRED',finished_at=now();
DO $$ BEGIN
 BEGIN UPDATE pod_extraction_runs SET original_ocr_text='changed'; RAISE EXCEPTION 'source mutation accepted'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN UPDATE pod_extraction_runs SET state='COMPLETED',interpretation='{}',error_code=NULL; RAISE EXCEPTION 'terminal mutation accepted'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 IF has_table_privilege('authenticated','pod_extraction_runs','SELECT') OR has_table_privilege('authenticated','trip_tracking_locations','SELECT') OR has_table_privilege('authenticated','trip_route_cache','SELECT') THEN RAISE EXCEPTION 'private data exposed'; END IF;
END $$;
SELECT 'local proposal assertions passed' AS result;
-- Exercise new FK effects using the existing exact-child deletion order.
-- This is a schema isolation test, not a live Storage cleanup/RPC test.
BEGIN;
DELETE FROM trip_images WHERE trip_stop_id='00000000-0000-4000-8000-000000000100';
DELETE FROM pod_records WHERE trip_stop_id='00000000-0000-4000-8000-000000000100';
DELETE FROM trip_stops WHERE id='00000000-0000-4000-8000-000000000100';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM trip_stops WHERE id='00000000-0000-4000-8000-000000000101') OR NOT EXISTS(SELECT FROM trip_truck_assignments) THEN RAISE EXCEPTION 'sibling/shared data deleted'; END IF;
 IF EXISTS(SELECT FROM pod_extraction_runs) OR NOT EXISTS(SELECT FROM pod_review_events WHERE receipt_id='00000000-0000-4000-8000-000000000200') THEN RAISE EXCEPTION 'derived history/audit lifecycle mismatch'; END IF;
END $$;
ROLLBACK;
