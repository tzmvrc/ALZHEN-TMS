-- Throws on every assertion failure; all writes are disposable fixtures.
CREATE FUNCTION assert_ok(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END$$;
CREATE FUNCTION fixture_submit(actor integer,key integer,kind text,stop integer,reason text DEFAULT 'Reason') RETURNS jsonb LANGUAGE sql AS $$
 SELECT submit_operations_report_v1(fixture_id(actor),fixture_id(key),kind,
 jsonb_build_object('trip_id',fixture_id(10),'trip_stop_id',fixture_id(stop),'reason',reason),
 jsonb_build_object('trip_id',fixture_id(10),'trip_stop_id',fixture_id(stop),'reason',reason,'created_by',fixture_id(5),'reported_at',now(),'reported_by',fixture_id(actor)),
 '{"quantity":2,"total_cbm":1}'::jsonb) $$;
SELECT assert_ok((fixture_submit(1,101,'OFFLOAD',20)->>'id')=(fixture_submit(1,101,'OFFLOAD',20)->>'id'),'Offload retry identity');
SELECT assert_ok((fixture_submit(3,102,'BACKLOAD',21)->>'id')=(fixture_submit(3,102,'BACKLOAD',21)->>'id'),'Backload retry identity');
SELECT fixture_submit(2,103,'BACKLOAD',20);
SELECT assert_ok((SELECT count(*)=1 FROM offloads),'one Offload after retry');
SELECT assert_ok((SELECT count(*)=2 FROM backloads),'legitimate separate reports');
SELECT assert_ok((SELECT bool_and(created_by=fixture_id(1) AND submitted_by=fixture_id(1)) FROM offloads),'spoofed creator ignored');
SELECT assert_ok((SELECT count(*)=1 FROM backloads WHERE created_by=fixture_id(3) AND trip_stop_id=fixture_id(21)),'trucker exact stop attribution');
DO $$BEGIN
 BEGIN PERFORM fixture_submit(1,101,'OFFLOAD',21); RAISE EXCEPTION 'Expected key conflict'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM fixture_submit(4,104,'BACKLOAD',20); RAISE EXCEPTION 'Expected assignment rejection'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM fixture_submit(5,105,'BACKLOAD',20); RAISE EXCEPTION 'Expected role rejection'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM fixture_submit(1,106,'BACKLOAD',22); RAISE EXCEPTION 'Expected wrong stop rejection'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM fixture_submit(1,107,'BACKLOAD',20,' '); RAISE EXCEPTION 'Expected reason rejection'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$DECLARE r uuid; a jsonb; b jsonb; BEGIN
 SELECT id INTO r FROM backloads WHERE created_by=fixture_id(3);
 a:=reserve_operations_receipt_v1(fixture_id(3),fixture_id(201),'BACKLOAD',r,'proof.png','image/png',100,repeat('a',64));
 b:=reserve_operations_receipt_v1(fixture_id(3),fixture_id(201),'BACKLOAD',r,'proof.png','image/png',100,repeat('a',64));
 PERFORM assert_ok(a->>'id'=b->>'id','upload retry identity');
 BEGIN PERFORM reserve_operations_receipt_v1(fixture_id(3),fixture_id(201),'BACKLOAD',r,'proof.png','image/png',100,repeat('b',64)); RAISE EXCEPTION 'Expected hash conflict'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN DELETE FROM report_receipts WHERE id=(a->>'id')::uuid; RAISE EXCEPTION 'Expected pending retention'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN PERFORM complete_operations_receipt_v1(fixture_id(3),fixture_id(201)); RAISE EXCEPTION 'Expected missing object'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 INSERT INTO storage.objects VALUES('report-receipts',a->>'storage_path');
 b:=complete_operations_receipt_v1(fixture_id(3),fixture_id(201));
 PERFORM assert_ok(b->>'upload_status'='READY','completion after bytes');
 PERFORM assert_ok(complete_operations_receipt_v1(fixture_id(3),fixture_id(201))->>'id'=a->>'id','completion idempotent');
 FOR n IN 2..20 LOOP PERFORM reserve_operations_receipt_v1(fixture_id(3),fixture_id(200+n),'BACKLOAD',r,'proof.png','image/png',100,repeat('a',64)); END LOOP;
 BEGIN PERFORM reserve_operations_receipt_v1(fixture_id(3),fixture_id(221),'BACKLOAD',r,'extra.png','image/png',100,repeat('a',64)); RAISE EXCEPTION 'Expected capacity rejection'; EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM assert_ok((SELECT count(*)=20 FROM report_receipts WHERE backload_id=r),'atomic cap counts reservations');
END $$;
SELECT assert_ok(NOT has_function_privilege('authenticated','submit_operations_report_v1(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'browser denied submission RPC');
SELECT assert_ok(NOT has_table_privilege('authenticated','operations_submission_requests','SELECT'),'private journal');
SELECT assert_ok((SELECT count(*)=2 FROM trips),'parents preserved');
SELECT assert_ok((SELECT count(*)=3 FROM trip_stops),'siblings preserved');
-- Match live table privileges: completion has only column UPDATE grants.
SET ROLE service_role;
SELECT fixture_submit(2,300,'BACKLOAD',21);
SELECT reserve_operations_receipt_v1(fixture_id(2),fixture_id(301),'BACKLOAD',
 (SELECT id FROM backloads WHERE submitted_by=fixture_id(2) AND trip_stop_id=fixture_id(21)),
 'service.png','image/png',10,repeat('c',64));
RESET ROLE;
INSERT INTO storage.objects SELECT 'report-receipts',storage_path FROM report_receipts WHERE upload_request_id=fixture_id(301);
SET ROLE service_role;
SELECT assert_ok(complete_operations_receipt_v1(fixture_id(2),fixture_id(301))->>'upload_status'='READY','service role limited completion grant');
SELECT assert_ok(NOT has_column_privilege('service_role','report_receipts','storage_path','UPDATE'),'no broad receipt update grant');
RESET ROLE;
