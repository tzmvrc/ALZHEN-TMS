// Creates a new database only in an explicitly verified disposable local cluster.
const {execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs'),assert=require('node:assert/strict');
const database=process.argv[2]??'whole_trip_2d3_final';assert.match(database,/^whole_trip_2d3_[a-z0-9_]+$/);
const args=['-X','-w','-h','127.0.0.1','-p','55447','-U','fixture','-qAt','-v','ON_ERROR_STOP=1'];
const q=(sql,db='postgres')=>execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',[...args,'-d',db,'-f','-'],{input:sql,encoding:'utf8',windowsHide:true}).trim();
assert.match(q('SHOW data_directory'),/alzhen-2d3-[a-f0-9]+/);
q(`CREATE DATABASE ${database}`);
for(const f of ['backend/tests/fixtures/offload-deletion-schema.sql','backend/migrations/2026_10_21_offload_deletion_cleanup.sql','backend/tests/fixtures/transaction-deletion-schema.sql','backend/migrations/2026_10_22_transaction_deletion_cleanup.sql','backend/tests/fixtures/live-transaction-deletion-v1.sql','backend/tests/fixtures/whole-trip-review-schema.sql','backend/migrations/2026_11_08_proposed_driver_update_parent.sql','backend/migrations/2026_11_07_proposed_whole_trip_deletion.sql'])q(readFileSync(f,'utf8'),database);
q(`CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text primary key,public boolean);
CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,unique(bucket_id,name));
INSERT INTO storage.buckets VALUES('trip-images',false),('report-receipts',false);
CREATE TABLE drivers(id uuid primary key,profile_id uuid);
INSERT INTO drivers VALUES(fixture_id(3),fixture_id(3));
ALTER TABLE trip_truck_assignments ADD driver_id uuid DEFAULT fixture_id(3);
ALTER TABLE trip_images ADD kind text DEFAULT 'receipt',ADD uploaded_by uuid DEFAULT fixture_id(3);
ALTER TABLE pod_drive_files ADD drive_link text;
ALTER TABLE report_receipts ADD upload_status text DEFAULT 'READY';
CREATE TABLE fixture_master_data(id uuid primary key,name text);
INSERT INTO fixture_master_data VALUES(fixture_id(7),'Shared master fixture');
INSERT INTO profiles VALUES(fixture_id(1),'ADMIN'),(fixture_id(2),'STAFF'),(fixture_id(3),'TRUCKER');
CREATE FUNCTION fixture_storage() RETURNS void LANGUAGE sql AS $$
INSERT INTO storage.objects(bucket_id,name,metadata)
 SELECT 'trip-images',storage_path,'{"mimetype":"image/jpeg"}'::jsonb FROM trip_images
 UNION ALL SELECT 'report-receipts',storage_path,'{"mimetype":"image/jpeg"}'::jsonb FROM report_receipts
 ON CONFLICT(bucket_id,name) DO NOTHING;$$;
SELECT fixture_trip(800),fixture_storage();`,database);
const tables=['trips','trip_stops','trip_line_items','trip_truck_assignments','driver_trip_updates','trip_images','pod_records','report_receipts','storage.objects','transaction_deletion_jobs','pod_review_events','fixture_master_data'];
const snapshot=()=>tables.map(t=>q(`SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'')) FROM ${t} r`,database));
const before=snapshot();q(readFileSync('backend/migrations/2026_11_13_proposed_verified_trip_attachment_cleanup.sql','utf8'),database);assert.deepEqual(snapshot(),before);
console.log(JSON.stringify({disposable:true,database,installationPreservedTables:tables.length}));
