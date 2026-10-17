-- DISPOSABLE LOCAL DATABASE ONLY. Never run on Supabase or a production DB.
CREATE TABLE profiles(id uuid PRIMARY KEY,role text NOT NULL,first_name text,last_name text);
CREATE TABLE trips(id uuid PRIMARY KEY,status text);
CREATE TABLE trip_stops(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips ON DELETE CASCADE,dr_number text,archived_at timestamptz);
CREATE TABLE drivers(id uuid PRIMARY KEY,profile_id uuid REFERENCES profiles);
CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips ON DELETE CASCADE,driver_id uuid REFERENCES drivers,assignment_type text,unassigned_at timestamptz);
CREATE TABLE pod_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL REFERENCES trips ON DELETE CASCADE,trip_stop_id uuid NOT NULL REFERENCES trip_stops ON DELETE CASCADE,
 dr_number text,pod_status text NOT NULL DEFAULT 'PENDING_TRUCKER_CONFIRMATION' CHECK(pod_status IN ('PENDING_TRUCKER_CONFIRMATION','RECEIVED','FOR_TRANSMITTAL','TRANSMITTED','SHIPPED','COMPLETED')),
 pod_received_at timestamptz,transmittal_reference text,remarks text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX uq_pod_records_stop_dr ON pod_records(trip_stop_id,coalesce(dr_number,''));
CREATE TABLE trip_images(id uuid PRIMARY KEY,storage_path text NOT NULL DEFAULT gen_random_uuid()::text,trip_id uuid NOT NULL REFERENCES trips ON DELETE CASCADE,trip_stop_id uuid REFERENCES trip_stops ON DELETE SET NULL,uploaded_by uuid REFERENCES profiles ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','photo')),dr_number text,ocr_version integer NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now());
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
INSERT INTO storage.buckets VALUES('trip-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
\ir ../../migrations/2026_10_04_create_admin_notifications.sql
INSERT INTO profiles VALUES
 ('00000000-0000-4000-8000-000000000001','ADMIN','Fixture','Admin'),
 ('00000000-0000-4000-8000-000000000002','STAFF','Fixture','Staff'),
 ('00000000-0000-4000-8000-000000000003','TRUCKER','Fixture','Trucker');
INSERT INTO trips VALUES('00000000-0000-4000-8000-000000000010','ONGOING');
INSERT INTO trip_stops VALUES
 ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','333',NULL),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000010','444',NULL);
INSERT INTO drivers VALUES('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000003');
INSERT INTO trip_truck_assignments VALUES('00000000-0000-4000-8000-000000000060','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000050','PRIMARY',NULL);
INSERT INTO trip_images(id,trip_id,trip_stop_id,uploaded_by,kind,dr_number)
 SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000010',
 CASE WHEN i=201 THEN '00000000-0000-4000-8000-000000000101'::uuid ELSE '00000000-0000-4000-8000-000000000100'::uuid END,
 '00000000-0000-4000-8000-000000000003','receipt',CASE WHEN i=201 THEN '444' ELSE '333' END FROM generate_series(200,205) i;
INSERT INTO storage.objects(bucket_id,name) SELECT 'trip-images',storage_path FROM trip_images;
INSERT INTO pod_records(id,trip_id,trip_stop_id,dr_number,pod_status,transmittal_reference,remarks) VALUES
 ('00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000101','444','SHIPPED','KEEP-REFERENCE','Keep remarks');
