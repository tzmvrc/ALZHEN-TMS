-- NEW disposable PostgreSQL database only; synthetic data, never production.
CREATE TABLE trips(id uuid PRIMARY KEY,warehouse_id uuid,loading_date date,lbc_tracking_number text,pod_ac_shipping_date date);
CREATE TABLE trip_stops(id uuid PRIMARY KEY,trip_id uuid,stop_sequence integer,store_id uuid,customer_id uuid,dr_number text,delivery_status text,finish_unloading_time timestamptz);
CREATE TABLE warehouses(id uuid PRIMARY KEY,code text);
CREATE TABLE customer_stores(id uuid PRIMARY KEY,name text);
CREATE TABLE customers(id uuid PRIMARY KEY,name text);
CREATE TABLE trucks(id uuid PRIMARY KEY,plate_number text);
CREATE TABLE drivers(id uuid PRIMARY KEY,first_name text,last_name text);
CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid,truck_id uuid,driver_id uuid,assignment_type text,unassigned_at timestamptz);
CREATE TABLE trip_line_items(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,dr_number text,sap_so_number text);
CREATE TABLE flex_tables(id uuid PRIMARY KEY,settings jsonb,archived_at timestamptz);
CREATE TABLE flex_rows(id uuid PRIMARY KEY,table_id uuid,row_kind text,source_entity_type text,source_entity_id uuid,archived_at timestamptz);
CREATE TABLE flex_columns(id uuid PRIMARY KEY,table_id uuid,settings jsonb,binding_scope text,is_archived boolean);
CREATE TABLE flex_cells(id uuid PRIMARY KEY,row_id uuid,column_id uuid,value jsonb);
