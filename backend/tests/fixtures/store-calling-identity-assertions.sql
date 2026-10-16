-- Isolated fixtures only. Roll back all synthetic business rows.
BEGIN;
DO $$ BEGIN
 IF EXISTS (
  (SELECT attnum,attname,atttypid,atttypmod FROM expected_store_view_columns
   EXCEPT SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.vw_store_calling_tracker'::regclass AND attnum>0 AND NOT attisdropped)
  UNION ALL
  (SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.vw_store_calling_tracker'::regclass AND attnum>0 AND NOT attisdropped
   EXCEPT SELECT attnum,attname,atttypid,atttypmod FROM expected_store_view_columns)
 ) THEN RAISE EXCEPTION 'View contract changed'; END IF;
 IF (SELECT count(*) FROM expected_store_view_columns)<>45 THEN RAISE EXCEPTION 'Expected 45 columns'; END IF;
END $$;
INSERT INTO trips(id,dispatch_number,transaction_number) VALUES
 ('00000000-0000-4000-8000-000000000001','PARENT','PARENT-TX'),
 ('00000000-0000-4000-8000-000000000002','OTHER','OTHER-TX');
INSERT INTO trip_stops(id,trip_id,dispatch_number,transaction_number,stop_sequence) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','STOP-1','TX-1',1),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','STOP-2','TX-2',2),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001',NULL,NULL,3),
 ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000002','OTHER-STOP','OTHER-STOP-TX',1);
INSERT INTO store_calls(id,trip_id,trip_stop_id) VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012'),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013'),
 ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000001',NULL),
 ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000014');
DO $$ BEGIN
 IF (SELECT count(*) FROM vw_store_calling_tracker)<>5 THEN RAISE EXCEPTION 'Zero assignments lost calls'; END IF;
 IF (SELECT dispatch_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000022')<>'STOP-2' THEN RAISE EXCEPTION 'Wrong stop dispatch'; END IF;
 IF (SELECT transaction_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000022')<>'TX-2' THEN RAISE EXCEPTION 'Wrong stop transaction'; END IF;
 IF (SELECT dispatch_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000023') IS NOT NULL THEN RAISE EXCEPTION 'Null stop inherited parent'; END IF;
 IF (SELECT dispatch_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000024')<>'PARENT' THEN RAISE EXCEPTION 'Trip-only call lost parent identifier'; END IF;
 IF (SELECT trip_stop_id FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000025') IS NOT NULL THEN RAISE EXCEPTION 'Cross-trip stop leaked'; END IF;
END $$;
INSERT INTO drivers(id,first_name) VALUES ('00000000-0000-4000-8000-000000000031','Active');
INSERT INTO trip_truck_assignments(id,trip_id,driver_id,assignment_type,unassigned_at) VALUES
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','PRIMARY',NULL),
 ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000001',NULL,'PRIMARY',now()),
 ('00000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000000001',NULL,'SECONDARY',NULL);
DO $$ BEGIN
 IF (SELECT count(*) FROM vw_store_calling_tracker)<>5 THEN RAISE EXCEPTION 'Stale/secondary assignment multiplied calls'; END IF;
 IF EXISTS(SELECT 1 FROM vw_store_calling_tracker WHERE driver_name<>'Active') THEN RAISE EXCEPTION 'Wrong active driver'; END IF;
END $$;
INSERT INTO trip_truck_assignments(id,trip_id,assignment_type) VALUES
 ('00000000-0000-4000-8000-000000000044','00000000-0000-4000-8000-000000000001','PRIMARY');
DO $$ BEGIN
 IF (SELECT count(*) FROM vw_store_calling_tracker)<>5 THEN RAISE EXCEPTION 'Ambiguous assignments multiplied calls'; END IF;
 IF EXISTS(SELECT 1 FROM vw_store_calling_tracker WHERE driver_id IS NOT NULL) THEN RAISE EXCEPTION 'Arbitrary ambiguous driver'; END IF;
END $$;
UPDATE trip_stops SET dispatch_number='SAVED-2' WHERE id='00000000-0000-4000-8000-000000000012';
DO $$ BEGIN
 IF (SELECT dispatch_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000022')<>'SAVED-2' THEN RAISE EXCEPTION 'Saved stop edit reverted'; END IF;
 IF (SELECT dispatch_number FROM vw_store_calling_tracker WHERE store_call_id='00000000-0000-4000-8000-000000000021')<>'STOP-1' THEN RAISE EXCEPTION 'Sibling changed'; END IF;
END $$;
ROLLBACK;
