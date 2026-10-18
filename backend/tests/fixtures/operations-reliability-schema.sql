-- Local disposable PostgreSQL only. Models the live columns, scope FKs and
-- existing Offload creation/capacity functions; not a full production clone.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE FUNCTION fixture_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
CREATE TABLE trips(id uuid PRIMARY KEY,archived_at timestamptz);
CREATE TABLE trip_stops(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips,archived_at timestamptz,dr_number text,UNIQUE(id,trip_id));
CREATE TABLE drivers(id uuid PRIMARY KEY,profile_id uuid REFERENCES profiles);
CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips,driver_id uuid REFERENCES drivers,unassigned_at timestamptz);
CREATE TABLE offloads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid REFERENCES trips,trip_stop_id uuid,
 reason text,number_of_boxes numeric,comments text,created_by uuid REFERENCES profiles,submitted_by uuid REFERENCES profiles,
 submitted_at timestamptz,reported_at timestamptz,reported_by uuid REFERENCES profiles,report_date date,UNIQUE(id,trip_id),FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id));
CREATE TABLE offload_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),offload_id uuid REFERENCES offloads,trip_line_item_id uuid,quantity numeric,total_cbm numeric);
CREATE TABLE backloads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid REFERENCES trips,trip_stop_id uuid,
 reason text,number_of_boxes numeric,comments text,created_by uuid REFERENCES profiles,submitted_by uuid REFERENCES profiles,submitted_at timestamptz,event_type text,
 UNIQUE(id,trip_id),FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id));
CREATE TABLE report_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid REFERENCES trips,trip_stop_id uuid,
 offload_id uuid REFERENCES offloads,backload_id uuid REFERENCES backloads,loading_report_id uuid,unloading_report_id uuid,
 storage_path text UNIQUE,file_name text,mime_type text,file_size_bytes bigint CHECK(file_size_bytes BETWEEN 1 AND 5242880),
 uploaded_by uuid REFERENCES profiles,received_at timestamptz,created_at timestamptz DEFAULT now(),
 CHECK(num_nonnulls(offload_id,backload_id,loading_report_id,unloading_report_id)=1),
 FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id),FOREIGN KEY(offload_id,trip_id) REFERENCES offloads(id,trip_id),FOREIGN KEY(backload_id,trip_id) REFERENCES backloads(id,trip_id));
CREATE SCHEMA storage;
CREATE TABLE storage.objects(bucket_id text,name text,PRIMARY KEY(bucket_id,name));
GRANT USAGE ON SCHEMA public,storage TO service_role;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE UPDATE ON report_receipts FROM service_role;
GRANT SELECT ON storage.objects TO service_role;
INSERT INTO profiles VALUES(fixture_id(1),'ADMIN'),(fixture_id(2),'STAFF'),(fixture_id(3),'TRUCKER'),(fixture_id(4),'TRUCKER'),(fixture_id(5),'OTHER');
INSERT INTO trips VALUES(fixture_id(10),NULL),(fixture_id(11),NULL);
INSERT INTO trip_stops VALUES(fixture_id(20),fixture_id(10),NULL,'DR-A'),(fixture_id(21),fixture_id(10),NULL,'DR-B'),(fixture_id(22),fixture_id(11),NULL,'DR-C');
INSERT INTO drivers VALUES(fixture_id(30),fixture_id(3));
INSERT INTO trip_truck_assignments VALUES(fixture_id(40),fixture_id(10),fixture_id(30),NULL);
