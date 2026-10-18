-- Disposable reliability schema; add the already existing live status column.
ALTER TABLE trips ADD status text DEFAULT 'PLANNED';
\ir ../../migrations/2026_11_12_operations_submission_terminal_guard.sql
DO $$DECLARE state text; BEGIN
 FOREACH state IN ARRAY ARRAY['COMPLETED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED'] LOOP
  UPDATE trips SET status=state WHERE id=fixture_id(10);
  BEGIN PERFORM fixture_submit(3,600,'BACKLOAD',21);RAISE EXCEPTION 'Terminal trip accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END LOOP;
 UPDATE trips SET status='IN_PROGRESS' WHERE id=fixture_id(10);
 UPDATE trip_truck_assignments SET unassigned_at=now() WHERE driver_id=fixture_id(30);
 BEGIN PERFORM fixture_submit(3,600,'BACKLOAD',21);RAISE EXCEPTION 'Revoked assignment accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE trip_truck_assignments SET unassigned_at=NULL WHERE driver_id=fixture_id(30);
 PERFORM assert_ok(fixture_submit(3,600,'BACKLOAD',21)->>'created_by'=fixture_id(3)::text,'active assignment accepted');
END $$;
