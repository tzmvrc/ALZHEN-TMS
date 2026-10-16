-- NEW disposable PostgreSQL database only. No production data.
CREATE TABLE trips(id uuid PRIMARY KEY,dispatch_number text,transaction_number text,trip_number integer,trip_type_id uuid,warehouse_id uuid);
CREATE TABLE trip_stops(id uuid PRIMARY KEY,trip_id uuid,dispatch_number text,transaction_number text,stop_sequence integer,store_id uuid,customer_id uuid,delivery_status text);
CREATE TABLE trip_types(id uuid PRIMARY KEY,code text,name text);
CREATE TABLE warehouses(id uuid PRIMARY KEY,code text,name text);
CREATE TABLE customer_stores(id uuid PRIMARY KEY,name text,code text,province text,city text,region text);
CREATE TABLE customers(id uuid PRIMARY KEY,name text);
CREATE TABLE profiles(id uuid PRIMARY KEY,first_name text,last_name text);
CREATE TABLE store_contacts(id uuid PRIMARY KEY,name text,phone text,email text,"position" text);
CREATE TABLE drivers(id uuid PRIMARY KEY,first_name text,last_name text,trucking_company_id uuid);
CREATE TABLE trucks(id uuid PRIMARY KEY,plate_number text,trucking_company_id uuid);
CREATE TABLE trucking_companies(id uuid PRIMARY KEY,name text);
CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid,driver_id uuid,truck_id uuid,trucking_company_id uuid,assignment_type text,unassigned_at timestamptz);
CREATE TABLE store_calls(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,assigned_to uuid,contact_id uuid,contact_name text,contact_number text,date_assigned timestamptz,date_of_contact timestamptz,time_texted timestamptz,time_called timestamptz,status text,confirmation_status text,remarks text,created_at timestamptz,updated_at timestamptz);
\ir store-calling-legacy-view.sql
CREATE TABLE expected_store_view_columns AS SELECT attnum,attname,atttypid,atttypmod
 FROM pg_attribute WHERE attrelid='public.vw_store_calling_tracker'::regclass AND attnum>0 AND NOT attisdropped;
