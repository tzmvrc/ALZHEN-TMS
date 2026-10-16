\set ON_ERROR_STOP on
BEGIN;
INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001','ADMIN','PRIVATE'),('00000000-0000-4000-8000-000000000002','STAFF','PRIVATE'),('00000000-0000-4000-8000-000000000003','TRUCKER','PRIVATE'),('00000000-0000-4000-8000-000000000004','STAFF','EXPIRED');
INSERT INTO admin_staff_session_days VALUES('00000000-0000-4000-8000-000000000001','ADMIN',now()+interval '1 hour'),('00000000-0000-4000-8000-000000000002','STAFF',now()+interval '1 hour'),('00000000-0000-4000-8000-000000000004','STAFF',now()-interval '1 hour');
INSERT INTO trips VALUES('00000000-0000-4000-8000-000000000010','NEVER PUBLISHED');
DO $$ DECLARE before uuid; BEGIN
 SELECT revision INTO before FROM admin_change_signals WHERE topic='trips';
 UPDATE trips SET private_value='CHANGED PRIVATE DATA';
 IF (SELECT revision FROM admin_change_signals WHERE topic='trips')=before THEN RAISE EXCEPTION 'update did not signal'; END IF;
 SELECT revision INTO before FROM admin_change_signals WHERE topic='trips';
 BEGIN UPDATE trips SET private_value='ROLLBACK'; RAISE EXCEPTION USING ERRCODE='55000'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 IF (SELECT revision FROM admin_change_signals WHERE topic='trips')<>before THEN RAISE EXCEPTION 'rolled back write signaled'; END IF;
 DELETE FROM trips;
 IF (SELECT revision FROM admin_change_signals WHERE topic='trips')=before THEN RAISE EXCEPTION 'delete did not signal'; END IF;
 IF EXISTS(SELECT 1 FROM admin_change_signals WHERE to_jsonb(admin_change_signals)::text LIKE '%PRIVATE%') THEN RAISE EXCEPTION 'private data leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='admin_change_signals') THEN RAISE EXCEPTION 'not published'; END IF;
 IF has_table_privilege('authenticated','profiles','SELECT') OR has_table_privilege('authenticated','trips','SELECT') THEN RAISE EXCEPTION 'base permissions broadened'; END IF;
 IF has_table_privilege('authenticated','admin_change_signals','INSERT') OR has_table_privilege('authenticated','admin_change_signals','UPDATE') THEN RAISE EXCEPTION 'signal writes exposed'; END IF;
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN IF (SELECT count(*) FROM admin_change_signals)<2 THEN RAISE EXCEPTION 'ADMIN read blocked'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF (SELECT count(*) FROM admin_change_signals)<2 THEN RAISE EXCEPTION 'STAFF read blocked'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM admin_change_signals) THEN RAISE EXCEPTION 'TRUCKER read permitted'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM admin_change_signals) THEN RAISE EXCEPTION 'expired session read permitted'; END IF; END; $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM admin_change_signals) THEN RAISE EXCEPTION 'missing identity read permitted'; END IF; END; $$;
RESET ROLE;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tgrelid::regclass AS name FROM pg_trigger WHERE tgname='admin_change_signal_trg' LOOP
   EXECUTE format('INSERT INTO %s(id,private_value) VALUES(gen_random_uuid(),''SECRET PATH'')',t.name);
 END LOOP;
 IF (SELECT count(*) FROM admin_change_signals)<>51 THEN RAISE EXCEPTION 'source coverage mismatch: %',(SELECT count(*) FROM admin_change_signals); END IF;
END; $$;
ROLLBACK;
