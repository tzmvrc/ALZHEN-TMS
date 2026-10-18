-- Extend the reliability fixture with the real existing record-deletion RPCs.
-- New reservation paths must satisfy those RPCs' UUID filename contract.
CREATE TABLE backload_items(id uuid PRIMARY KEY,backload_id uuid REFERENCES backloads(id) ON DELETE CASCADE);
CREATE TABLE operations_report_conversions(source_type text,source_id uuid,target_type text,target_id uuid);
CREATE TABLE documents(id uuid PRIMARY KEY,file_path text);
ALTER TABLE offload_items DROP CONSTRAINT offload_items_offload_id_fkey;
ALTER TABLE offload_items ADD FOREIGN KEY(offload_id) REFERENCES offloads(id) ON DELETE CASCADE;
\ir ../../migrations/2026_10_21_offload_deletion_cleanup.sql
\ir ../../migrations/2026_11_10_proposed_backload_deletion_cleanup.sql
DO $$DECLARE r uuid; receipt jsonb; job jsonb; BEGIN
 r:=(fixture_submit(1,400,'BACKLOAD',20)->>'id')::uuid;
 receipt:=reserve_operations_receipt_v1(fixture_id(1),fixture_id(401),'BACKLOAD',r,'ready.png','image/png',100,repeat('d',64));
 BEGIN PERFORM delete_backload_with_cleanup_v1(r,fixture_id(1)); RAISE EXCEPTION 'Expected incomplete upload blocker'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 PERFORM assert_ok(EXISTS(SELECT FROM backloads WHERE id=r),'pending deletion rolls back parent');
 PERFORM assert_ok(NOT EXISTS(SELECT FROM backload_deletion_jobs WHERE backload_id=r),'pending deletion rolls back journal');
 INSERT INTO storage.objects VALUES('report-receipts',receipt->>'storage_path');
 PERFORM complete_operations_receipt_v1(fixture_id(1),fixture_id(401));
 job:=delete_backload_with_cleanup_v1(r,fixture_id(1));
 PERFORM assert_ok(job->>'state'='PENDING_STORAGE','completed bytes enter durable cleanup');
 PERFORM assert_ok(delete_backload_with_cleanup_v1(r,fixture_id(1))->>'id'=job->>'id','record delete retry idempotent');
 PERFORM assert_ok(NOT EXISTS(SELECT FROM backloads WHERE id=r),'only report removed');
 BEGIN PERFORM fixture_submit(1,400,'BACKLOAD',20);RAISE EXCEPTION 'Deleted retry resurrected report';EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;END;
 r:=(fixture_submit(1,410,'OFFLOAD',21)->>'id')::uuid;
 receipt:=reserve_operations_receipt_v1(fixture_id(1),fixture_id(411),'OFFLOAD',r,'ready.png','image/png',100,repeat('e',64));
 BEGIN PERFORM delete_offload_with_cleanup_v1(r,fixture_id(1));RAISE EXCEPTION 'Expected incomplete Offload blocker';EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;END;
 INSERT INTO storage.objects VALUES('report-receipts',receipt->>'storage_path');
 PERFORM complete_operations_receipt_v1(fixture_id(1),fixture_id(411));
 PERFORM assert_ok(delete_offload_with_cleanup_v1(r,fixture_id(1))->>'state'='PENDING_STORAGE','Offload path compatible with cleanup');
 PERFORM assert_ok((SELECT count(*)=2 FROM trips),'report deletion preserves trips');
 PERFORM assert_ok((SELECT count(*)=3 FROM trip_stops),'report deletion preserves sibling stops');
END $$;
