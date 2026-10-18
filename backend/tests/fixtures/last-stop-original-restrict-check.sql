-- Disposable ONLY, before installing revised proposals. Reproduce the regression.
BEGIN;
INSERT INTO profiles VALUES(fixture_id(1),'ADMIN');
SELECT fixture_trip(500,1);
ALTER TABLE driver_trip_updates ADD CONSTRAINT original_restrict_probe
 FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE RESTRICT NOT VALID;
DO $$ BEGIN
 BEGIN
  PERFORM delete_transaction_with_cleanup_v1(fixture_id(500),fixture_id(5001),fixture_id(1));
  RAISE EXCEPTION 'Original last-stop RPC unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '23001' THEN NULL; END;
 IF NOT EXISTS(SELECT FROM trip_stops WHERE id=fixture_id(5001))
  OR NOT EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=fixture_id(500))
  OR EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=fixture_id(500)) THEN
  RAISE EXCEPTION 'Original RESTRICT failure did not roll back'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: original RESTRICT regression reproduced, all work rolled back';
