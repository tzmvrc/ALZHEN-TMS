-- Disposable PostgreSQL ONLY. All UUIDs and Storage paths are synthetic.
INSERT INTO profiles VALUES(fixture_id(1),'ADMIN'),(fixture_id(2),'STAFF'),(fixture_id(3),'TRUCKER');
SELECT fixture_trip(100),fixture_trip(101,1),fixture_trip(102,1);
DO $test$ DECLARE r jsonb; a uuid:=fixture_id(1); n integer; BEGIN
 r:=preview_whole_trip_deletion_v1(ARRAY[fixture_id(100),fixture_id(100)],a);
 IF jsonb_array_length(r->'trips')<>1 OR (r->'counts'->>'trip_stops')::int<>2
  OR (r->'counts'->>'trip_line_items')::int<>2 OR (r->'counts'->>'offload_items')::int<>1
  OR (r->'counts'->>'pod_records')::int<>1 OR (r->'counts'->>'cached_routes')::int<>1 THEN RAISE EXCEPTION 'Impact counts incorrect';END IF;
 FOREACH n IN ARRAY ARRAY[2,3] LOOP
  BEGIN PERFORM delete_whole_trips_v1(ARRAY[fixture_id(100)],fixture_id(n));RAISE EXCEPTION 'Unauthorized delete';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  BEGIN PERFORM preview_whole_trip_deletion_v1(ARRAY[fixture_id(100)],fixture_id(n));RAISE EXCEPTION 'Unauthorized preview';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END LOOP;
 BEGIN PERFORM delete_whole_trips_v1(ARRAY[fixture_id(999)],a);RAISE EXCEPTION 'Missing deleted';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM delete_whole_trips_v1(ARRAY['invalid']::uuid[],a);RAISE EXCEPTION 'Invalid accepted';EXCEPTION WHEN invalid_text_representation THEN NULL;END;
 BEGIN PERFORM delete_whole_trips_v1(ARRAY[]::uuid[],a);RAISE EXCEPTION 'Empty accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 r:=delete_whole_trips_v1(ARRAY[fixture_id(100),fixture_id(100),fixture_id(102)],a);
 IF jsonb_array_length(r)<>3 OR EXISTS(SELECT FROM trips WHERE id IN(fixture_id(100),fixture_id(102))) THEN RAISE EXCEPTION 'Whole distinct trip delete failed';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(r) j WHERE j ? 'snapshot' OR j ? 'storage_objects') THEN RAISE EXCEPTION 'Private acknowledgement leaked';END IF;
 IF (SELECT count(*) FROM trips WHERE id=fixture_id(101))<>1 OR (SELECT count(*) FROM trip_stops WHERE trip_id=fixture_id(101))<>1 THEN RAISE EXCEPTION 'Unrelated trip changed';END IF;
 IF EXISTS(SELECT FROM trip_tracking_locations WHERE assignment_id IN(fixture_id(100001),fixture_id(102001)))
  OR EXISTS(SELECT FROM trip_route_cache WHERE assignment_id IN(fixture_id(100001),fixture_id(102001)))
  OR EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM pod_records WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM loading_reports WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM unloading_reports WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM offloads WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM backloads WHERE trip_id=fixture_id(100))
  OR EXISTS(SELECT FROM flex_rows WHERE source_entity_id=fixture_id(1001)) THEN RAISE EXCEPTION 'Owned children survived';END IF;
 IF NOT EXISTS(SELECT FROM pod_review_events WHERE trip_id=fixture_id(100)) THEN RAISE EXCEPTION 'Review audit erased';END IF;
 IF NOT EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=fixture_id(100) AND state='PENDING_STORAGE' AND jsonb_array_length(storage_objects)=1) THEN RAISE EXCEPTION 'Exact cleanup not journaled';END IF;
 IF EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id IN(fixture_id(100),fixture_id(102)) AND (requested_by IS DISTINCT FROM a OR created_at IS NULL OR snapshot->'whole_trip_deletion'->>'dispatch_number' IS NULL OR NOT(snapshot->'whole_trip_deletion' ? 'affected_counts'))) THEN RAISE EXCEPTION 'Audit incomplete';END IF;
 IF jsonb_array_length(delete_whole_trips_v1(ARRAY[fixture_id(100)],a))<>2 THEN RAISE EXCEPTION 'Retry not idempotent';END IF;
 IF has_function_privilege('authenticated','delete_whole_trips_v1(uuid[],uuid)','EXECUTE') OR has_function_privilege('anon','preview_whole_trip_deletion_v1(uuid[],uuid)','EXECUTE') OR NOT has_function_privilege('service_role','preview_whole_trip_deletion_v1(uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'RPC ACL unsafe';END IF;
END $test$;
-- Reproduce live service SELECT restrictions without opening those tables.
SET ROLE service_role;
SELECT preview_whole_trip_deletion_v1(ARRAY[fixture_id(101)],fixture_id(1))->'counts' AS private_counts_via_authorized_rpc;
RESET ROLE;
SELECT fixture_trip(n) FROM generate_series(110,124)n;
SELECT fixture_trip(109);
UPDATE driver_trip_updates SET pod_image_path='legacy/private-pod.jpg' WHERE trip_id=fixture_id(121);
INSERT INTO billings VALUES(fixture_id(11099),fixture_id(110));
INSERT INTO payables VALUES(fixture_id(11199),fixture_id(111));
INSERT INTO receivables VALUES(fixture_id(11299),fixture_id(112));
INSERT INTO operations_report_conversions(source_type,source_id,trip_id,trip_stop_id) VALUES('OFFLOAD',fixture_id(11302),fixture_id(113),fixture_id(1131));
INSERT INTO documents VALUES(fixture_id(11499),'retained/document.pdf',fixture_id(114),fixture_id(1141));
INSERT INTO pod_drive_files VALUES(fixture_id(11599),fixture_id(115),fixture_id(1151),fixture_id(11501));
-- Cross-report Storage reference, malformed storage path, inconsistent image/POD,
-- retained report referencing another stop's line item, and inconsistent event stop.
UPDATE trip_images SET storage_path=(SELECT storage_path FROM trip_images WHERE trip_id=fixture_id(116)) WHERE trip_id=fixture_id(101);
UPDATE trip_images SET storage_path='unowned/object.jpg' WHERE trip_id=fixture_id(117);
UPDATE trip_images SET pod_record_id=fixture_id(10101) WHERE trip_id=fixture_id(118);
UPDATE offloads SET trip_stop_id=fixture_id(1192) WHERE trip_id=fixture_id(119);
UPDATE trip_events SET trip_stop_id=fixture_id(1011) WHERE trip_id=fixture_id(120);
DO $test$ DECLARE n integer; before_jobs bigint; BEGIN
 SELECT count(*) INTO before_jobs FROM transaction_deletion_jobs;
 FOR n IN 110..121 LOOP
  BEGIN
   PERFORM delete_whole_trips_v1(ARRAY[fixture_id(109),fixture_id(n)],fixture_id(1));
   RAISE EXCEPTION 'Protected trip % deleted',n;
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;
  IF NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(109)) OR NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(n)) OR (SELECT count(*) FROM transaction_deletion_jobs)<>before_jobs THEN RAISE EXCEPTION 'Protected batch rollback failed %',n;END IF;
 END LOOP;
END $test$;
SELECT fixture_trip(130,0);
SELECT delete_whole_trips_v1(ARRAY[fixture_id(130)],fixture_id(1));
SELECT 'Modeled relationship checks: exact parent, multi-stop/items, distinct and repeated trips, POD/transmittal, Operations, financial/history/document/Storage guards, tracking cascades, ACL, atomic rollback, retained audits and durable cleanup' AS passed;

DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM driver_trip_updates WHERE id='00000000-0000-4000-8000-000900000001') THEN RAISE EXCEPTION 'Legacy orphan silently removed';END IF;
 BEGIN INSERT INTO driver_trip_updates VALUES(fixture_id(99991),fixture_id(99992),NULL,NULL,NULL);RAISE EXCEPTION 'Late orphan write accepted';EXCEPTION WHEN foreign_key_violation OR SQLSTATE '23001' THEN NULL;END;
 PERFORM delete_transaction_with_cleanup_v1(fixture_id(123),fixture_id(1231),fixture_id(1));
 IF NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(123)) THEN RAISE EXCEPTION 'Partial stop erased trip-level driver updates'; END IF;
 PERFORM delete_transaction_with_cleanup_v1(fixture_id(123),fixture_id(1232),fixture_id(1));
 IF EXISTS(SELECT FROM trips WHERE id=fixture_id(123)) OR EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(123)) THEN RAISE EXCEPTION 'Compatible last-stop cleanup failed'; END IF;
END $$;

SELECT delete_whole_trips_v1(ARRAY[fixture_id(123)],fixture_id(1));
