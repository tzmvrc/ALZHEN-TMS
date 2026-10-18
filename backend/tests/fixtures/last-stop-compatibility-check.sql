-- Disposable ONLY, after whole-trip-review-check.sql and both revised proposals.
BEGIN;
SELECT fixture_trip(n,1) FROM generate_series(501,511)n;
SELECT fixture_trip(512,2);
SELECT fixture_trip(513,2);
UPDATE driver_trip_updates SET pod_image_path='unresolved/retained.jpg' WHERE trip_id=fixture_id(513);
DELETE FROM driver_trip_updates WHERE trip_id=fixture_id(501);
UPDATE driver_trip_updates SET pod_image_path='legacy/unknown.jpg' WHERE trip_id=fixture_id(503);
INSERT INTO payables VALUES(fixture_id(50499),fixture_id(504));
INSERT INTO operations_report_conversions(source_type,source_id,trip_id,trip_stop_id)
 VALUES('OFFLOAD',fixture_id(50502),fixture_id(505),fixture_id(5051));
UPDATE driver_trip_updates SET pod_image_url='https://private.invalid/object' WHERE trip_id=fixture_id(506);
-- A retained driver's URL points at another trip's exact image: do not delete it.
UPDATE driver_trip_updates SET pod_image_url=(SELECT storage_path FROM trip_images WHERE trip_id=fixture_id(507))
 WHERE trip_id=fixture_id(508);
DO $$ DECLARE r jsonb; retry jsonb; n integer; jobs bigint; BEGIN
 r:=delete_transaction_with_cleanup_v1(fixture_id(501),fixture_id(5011),fixture_id(1));
 IF EXISTS(SELECT FROM trips WHERE id=fixture_id(501)) OR r->'snapshot'->'driver_update_cleanup'->>'count'<>'0' THEN RAISE EXCEPTION 'No-update last stop failed'; END IF;
 RAISE NOTICE 'PASS 1: last stop without driver updates';
 r:=delete_transaction_with_cleanup_v1(fixture_id(502),fixture_id(5021),fixture_id(2));
 IF EXISTS(SELECT FROM trips WHERE id=fixture_id(502)) OR EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(502))
  OR r->'snapshot'->'driver_update_cleanup'->>'count' IS DISTINCT FROM '1'
  OR r->'snapshot'->'driver_update_cleanup'->'ids' IS DISTINCT FROM jsonb_build_array(fixture_id(50299)) THEN RAISE EXCEPTION 'Staff eligible cleanup/audit failed'; END IF;
 RAISE NOTICE 'PASS 2: Staff last-stop cleanup with minimal audit';
 retry:=delete_transaction_with_cleanup_v1(fixture_id(502),fixture_id(5021),fixture_id(2));
 IF retry->>'id'<>r->>'id' THEN RAISE EXCEPTION 'Retry created another job'; END IF;
 RAISE NOTICE 'PASS 3: repeated request returns original job';
 SELECT count(*) INTO jobs FROM transaction_deletion_jobs;
 FOREACH n IN ARRAY ARRAY[503,504,505,506,507] LOOP
  BEGIN
   PERFORM delete_transaction_with_cleanup_v1(fixture_id(n),fixture_id(n*10+1),fixture_id(1));
   RAISE EXCEPTION 'Protected last stop deleted: %',n;
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  IF NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(n)) OR NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(n*10+1))
   OR NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(n))
   OR (SELECT count(*) FROM transaction_deletion_jobs)<>jobs THEN RAISE EXCEPTION 'Protected rollback failed %',n; END IF;
  RAISE NOTICE 'PASS: protected last-stop rollback % (path, finance, conversion, URL, shared image)',n;
 END LOOP;
 r:=delete_transaction_with_cleanup_v1(fixture_id(512),fixture_id(5121),fixture_id(2));
 IF NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(512)) OR NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(5122))
  OR NOT EXISTS(SELECT FROM trip_truck_assignments WHERE trip_id=fixture_id(512))
  OR NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(512)) OR r->'snapshot' ? 'driver_update_cleanup' THEN RAISE EXCEPTION 'Partial stop touched trip-level updates'; END IF;
 RAISE NOTICE 'PASS 9: partial stop preserves sibling, assignment and driver updates';
 r:=delete_transaction_with_cleanup_v1(fixture_id(512),fixture_id(5122),fixture_id(2));
 IF EXISTS(SELECT FROM trips WHERE id=fixture_id(512)) OR EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(512)) THEN RAISE EXCEPTION 'Final remaining stop failed'; END IF;
 RAISE NOTICE 'PASS 10: final remaining stop removes parent explicitly';
 BEGIN
  PERFORM delete_transaction_with_cleanup_v1(fixture_id(509),fixture_id(5091),fixture_id(3));
  RAISE EXCEPTION 'Trucker deletion permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS 11: Trucker prohibited';
 r:=delete_transaction_with_cleanup_v1(fixture_id(510),fixture_id(5101),fixture_id(1));
 IF EXISTS(SELECT FROM pod_records WHERE trip_id=fixture_id(510))
  OR NOT EXISTS(SELECT FROM pod_review_events WHERE trip_id=fixture_id(510))
  OR r->>'state'<>'PENDING_STORAGE' OR jsonb_array_length(r->'storage_objects')<>2 THEN RAISE EXCEPTION 'POD exact-key journal/history failed'; END IF;
 RAISE NOTICE 'PASS 12: owned POD removed, decision audit retained, exact image/receipt cleanup pending';
 r:=delete_transaction_with_cleanup_v1(fixture_id(513),fixture_id(5131),fixture_id(2));
 IF NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(513) AND pod_image_path='unresolved/retained.jpg')
  OR NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(5132)) THEN RAISE EXCEPTION 'Partial stop changed legacy attachment'; END IF;
 RAISE NOTICE 'PASS 14: partial stop leaves unresolved trip-level attachments untouched';
 BEGIN PERFORM delete_transaction_with_cleanup_v1(fixture_id(513),fixture_id(5132),fixture_id(2));RAISE EXCEPTION 'Final stop bypassed legacy attachment guard';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 IF NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(513)) OR NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(5132)) THEN RAISE EXCEPTION 'Final stop blocker lost parent'; END IF;
 RAISE NOTICE 'PASS 15: final stop still blocked by unresolved attachment';
 -- Force failure AFTER explicit child deletion to prove full statement rollback.
END $$;
CREATE FUNCTION fixture_fail_parent_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.id=fixture_id(511) THEN RAISE EXCEPTION 'fixture parent failure' USING ERRCODE='55000'; END IF;
 RETURN OLD; END $$;
CREATE TRIGGER fixture_parent_failure BEFORE DELETE ON trips FOR EACH ROW EXECUTE FUNCTION fixture_fail_parent_delete();
DO $$ DECLARE jobs bigint; BEGIN
 SELECT count(*) INTO jobs FROM transaction_deletion_jobs;
 BEGIN PERFORM delete_transaction_with_cleanup_v1(fixture_id(511),fixture_id(5111),fixture_id(1));RAISE EXCEPTION 'Failure not raised';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 IF NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(511)) OR NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(5111))
  OR NOT EXISTS(SELECT FROM pod_records WHERE trip_id=fixture_id(511)) OR (SELECT count(*) FROM transaction_deletion_jobs)<>jobs THEN RAISE EXCEPTION 'Late failure did not restore full operation'; END IF;
 RAISE NOTICE 'PASS 13: failure after child cleanup restores all rows and journals';
END $$;
ROLLBACK;
