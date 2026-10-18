-- Disposable whole-trip fixture with the exact new pending-receipt guard.
BEGIN;
SELECT fixture_trip(980),fixture_trip(981,1);
UPDATE report_receipts SET upload_status='PENDING' WHERE trip_id IN (fixture_id(980),fixture_id(981));
DO $$DECLARE original_jobs bigint; BEGIN
 SELECT count(*) INTO original_jobs FROM transaction_deletion_jobs;
 BEGIN PERFORM delete_whole_trips_v1(ARRAY[fixture_id(980),fixture_id(981)],fixture_id(1));
  RAISE EXCEPTION 'Whole batch ignored pending image';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM NOT LIKE '%image upload is incomplete%' THEN RAISE; END IF;
 END;
 BEGIN PERFORM delete_transaction_with_cleanup_v1(fixture_id(981),fixture_id(9811),fixture_id(1));
  RAISE EXCEPTION 'Last-stop ignored pending image';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM NOT LIKE '%image upload is incomplete%' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM trips WHERE id IN (fixture_id(980),fixture_id(981)))<>2
  OR (SELECT count(*) FROM trip_stops WHERE trip_id IN (fixture_id(980),fixture_id(981)))<>3
  OR (SELECT count(*) FROM transaction_deletion_jobs)<>original_jobs THEN
  RAISE EXCEPTION 'Pending receipt caused partial trip/stop/journal deletion';
 END IF;
END $$;
ROLLBACK;
