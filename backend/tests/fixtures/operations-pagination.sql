-- ISOLATED DISPOSABLE DATABASE ONLY. No production data/credentials.
CREATE TABLE public.trips(id uuid PRIMARY KEY,trip_number integer,dispatch_number text,warehouse_id uuid,remarks text);
CREATE TABLE public.trip_stops(id uuid PRIMARY KEY,trip_id uuid,stop_sequence integer,dispatch_number text,dr_number text,finish_unloading_time timestamptz,remarks text,store_id uuid,customer_id uuid);
CREATE TABLE public.trip_line_items(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,quantity numeric,cbm numeric,dr_number text);
CREATE TABLE public.loading_reports(id uuid PRIMARY KEY,trip_id uuid UNIQUE,event_type text);
CREATE TABLE public.unloading_reports(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,event_type text);
CREATE TABLE public.backloads(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,event_type text,reason text,number_of_boxes numeric,comments text);
CREATE TABLE public.offloads(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,event_type text,reported_at timestamptz,report_date date,created_at timestamptz,reason text,number_of_boxes numeric,comments text,reported_by uuid,created_by uuid,submitted_by uuid);
CREATE TABLE public.offload_items(id uuid PRIMARY KEY,offload_id uuid,quantity numeric,total_cbm numeric,dr_number text);
CREATE TABLE public.operations_report_conversions(source_type text,source_id uuid);
CREATE TABLE public.trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid,truck_id uuid,driver_id uuid,assignment_type text,unassigned_at timestamptz);
CREATE TABLE public.trucks(id uuid PRIMARY KEY,plate_number text);
CREATE TABLE public.drivers(id uuid PRIMARY KEY,profile_id uuid,first_name text,last_name text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,first_name text,last_name text);
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,name text);
CREATE TABLE public.customer_stores(id uuid PRIMARY KEY,name text);
CREATE TABLE public.customers(id uuid PRIMARY KEY,name text);
INSERT INTO trips(id,trip_number,dispatch_number,remarks) VALUES('00000000-0000-4000-8000-000000000001',1,'TRIP-LEGACY','Trip remarks');
INSERT INTO trip_stops(id,trip_id,stop_sequence,dispatch_number,dr_number,remarks) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',1,'DSP-1','DR-1','Stop one'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',2,'DSP-2','DR-2','Stop two');
INSERT INTO offloads(id,trip_id,trip_stop_id,event_type,reported_at,comments)
 SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001',
 CASE WHEN i%2=0 THEN '00000000-0000-4000-8000-000000000012'::uuid ELSE '00000000-0000-4000-8000-000000000011'::uuid END,
 'Offload','2026-10-17 08:00:00+08',CASE WHEN i=75 THEN 'Needle across pages' ELSE 'Fixture '||i END
 FROM generate_series(100,224) i;
UPDATE offloads SET comments='Needle across pages' WHERE id='00000000-0000-4000-8000-000000000174';
INSERT INTO loading_reports VALUES('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000001','Loading');
INSERT INTO unloading_reports VALUES('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Unloading');
INSERT INTO backloads VALUES('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000001',NULL,'Backload','Fixture',0,NULL);
INSERT INTO trip_truck_assignments VALUES
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000001',NULL,NULL,'PRIMARY',NULL),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000001',NULL,NULL,'PRIMARY',NULL);
INSERT INTO offload_items VALUES('00000000-0000-4000-8000-000000000400','00000000-0000-4000-8000-000000000174',0,0.125,'ITEM-DR');
