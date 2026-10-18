-- ONLY for the disposable schema in backload-deletion-schema.sql.
INSERT INTO profiles VALUES ('00000000-0000-4000-8000-000000000001','ADMIN'),('00000000-0000-4000-8000-000000000002','TRUCKER');
INSERT INTO trips VALUES ('00000000-0000-4000-8000-000000000010');
INSERT INTO trip_stops VALUES ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000010');
INSERT INTO trip_stops VALUES ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000010');
INSERT INTO backloads SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','Fixture' FROM generate_series(31,36) n;
INSERT INTO backload_items SELECT ('00000000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,n,n/10.0 FROM generate_series(31,36) n;
INSERT INTO report_receipts SELECT ('00000000-0000-4000-8000-'||lpad((n+20)::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021',('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'operations/00000000-0000-4000-8000-000000000010/backload/00000000-0000-4000-8000-'||lpad(n::text,12,'0')||'/00000000-0000-4000-8000-000000000099.png' FROM generate_series(31,34) n;
INSERT INTO operations_report_conversions VALUES ('BACKLOAD','00000000-0000-4000-8000-000000000033','BACKLOAD','00000000-0000-4000-8000-000000000090');
INSERT INTO operations_report_conversions VALUES ('BACKLOAD','00000000-0000-4000-8000-000000000090','BACKLOAD','00000000-0000-4000-8000-000000000036');
INSERT INTO documents SELECT '00000000-0000-4000-8000-000000000091',storage_path FROM report_receipts WHERE backload_id='00000000-0000-4000-8000-000000000032';
CREATE TABLE protected_fixture(backload_id uuid REFERENCES backloads(id));
INSERT INTO protected_fixture VALUES ('00000000-0000-4000-8000-000000000034');
DO $$
DECLARE a uuid := '00000000-0000-4000-8000-000000000001'; j jsonb; again jsonb; blocked boolean;
BEGIN
 j := delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000031',a);
 IF j->>'state'<>'PENDING_STORAGE' OR jsonb_array_length(j->'storage_paths')<>1 OR j#>>'{snapshot,report,id}'<>'00000000-0000-4000-8000-000000000031' THEN RAISE EXCEPTION 'Snapshot or cleanup ownership failed'; END IF;
 IF EXISTS(SELECT 1 FROM backloads WHERE id='00000000-0000-4000-8000-000000000031') OR EXISTS(SELECT 1 FROM backload_items WHERE backload_id='00000000-0000-4000-8000-000000000031') OR EXISTS(SELECT 1 FROM report_receipts WHERE backload_id='00000000-0000-4000-8000-000000000031') THEN RAISE EXCEPTION 'Owned records remain'; END IF;
 IF (SELECT count(*) FROM trips)<>1 OR (SELECT count(*) FROM trip_stops)<>3 OR NOT EXISTS(SELECT 1 FROM backloads WHERE id='00000000-0000-4000-8000-000000000032') THEN RAISE EXCEPTION 'Sibling data changed'; END IF;
 again := delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000031',a);
 IF again->>'id'<>j->>'id' THEN RAISE EXCEPTION 'Retry created another operation'; END IF;
 blocked:=false; BEGIN PERFORM delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000032',a); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Retained document was ignored'; END IF;
 blocked:=false; BEGIN PERFORM delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000033',a); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Converted history was ignored'; END IF;
 blocked:=false; BEGIN PERFORM delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000036',a); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Converted target history was ignored'; END IF;
 blocked:=false; BEGIN PERFORM delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000034',a); EXCEPTION WHEN foreign_key_violation THEN blocked:=true; END;
 IF NOT blocked OR NOT EXISTS(SELECT 1 FROM report_receipts WHERE backload_id='00000000-0000-4000-8000-000000000034') OR EXISTS(SELECT 1 FROM backload_deletion_jobs WHERE backload_id='00000000-0000-4000-8000-000000000034') THEN RAISE EXCEPTION 'Failed deletion did not roll back'; END IF;
 j := delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000035',a);
 IF j->>'state'<>'COMPLETE' THEN RAISE EXCEPTION 'No-image deletion should complete atomically'; END IF;
 blocked:=false; BEGIN PERFORM delete_backload_with_cleanup_v1('00000000-0000-4000-8000-000000000036','00000000-0000-4000-8000-000000000002'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Trucker deletion allowed'; END IF;
 IF has_table_privilege('authenticated','backload_deletion_jobs','SELECT') OR has_function_privilege('authenticated','delete_backload_with_cleanup_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser privileges too broad'; END IF;
 RAISE NOTICE 'PASS: physical ownership, images queued, snapshots, idempotency, siblings, document/history protection, rollback, no-image completion and authorization';
END; $$;
