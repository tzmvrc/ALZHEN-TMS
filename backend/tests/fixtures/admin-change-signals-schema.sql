-- NEW disposable PostgreSQL database only. Never run on Supabase.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END; $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,private_value text);
CREATE TABLE public.admin_staff_session_days(profile_id uuid,role text,expires_at timestamptz);
CREATE PUBLICATION supabase_realtime;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
    'trips','trip_stops','trip_line_items','trip_truck_assignments','trip_events',
    'store_calls','documents','trip_images','incidents','incident_reasons','demurrages',
    'backloads','backload_items','offloads','offload_items','loading_reports',
    'unloading_reports','report_receipts','operations_report_conversions',
    'pod_records','pod_drive_files','admin_notifications','customers',
    'customer_stores','store_contacts','store_exceptions','warehouses','drivers',
    'trucks','truck_images','trucking_companies','trip_types','products','rate_cards',
    'billings','payables','receivables','tms_dropdown_options','tms_route_options',
    'flex_tables','flex_columns','flex_rows','flex_cells','flex_dropdown_options',
    'flex_table_permissions','flex_cell_mentions','shared_table_column_widths',
    'driver_trip_updates','offload_deletion_jobs','transaction_deletion_jobs'
 ] LOOP EXECUTE format('CREATE TABLE public.%I(id uuid PRIMARY KEY,private_value text)',t); END LOOP;
END; $$;
