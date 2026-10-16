-- Run after offload-deletion-schema.sql in a NEW disposable database only.
ALTER TABLE public.trip_stops ADD dr_number text, ADD archived_at timestamptz;
ALTER TABLE public.documents ADD trip_id uuid REFERENCES trips(id) ON DELETE CASCADE, ADD trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE CASCADE;
ALTER TABLE public.operations_report_conversions ADD trip_id uuid REFERENCES trips(id) ON DELETE RESTRICT, ADD trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE RESTRICT;
CREATE TABLE public.trip_line_items(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE CASCADE);
ALTER TABLE public.offload_items ADD trip_line_item_id uuid REFERENCES trip_line_items(id);
CREATE TABLE public.backloads(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,trip_stop_id uuid,FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id) ON DELETE RESTRICT);
CREATE TABLE public.backload_items(id uuid PRIMARY KEY,backload_id uuid REFERENCES backloads(id) ON DELETE CASCADE,trip_line_item_id uuid REFERENCES trip_line_items(id));
CREATE TABLE public.unloading_reports(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),trip_stop_id uuid REFERENCES trip_stops(id));
CREATE TABLE public.loading_reports(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id));
ALTER TABLE public.report_receipts ADD backload_id uuid REFERENCES backloads(id), ADD loading_report_id uuid REFERENCES loading_reports(id), ADD unloading_report_id uuid REFERENCES unloading_reports(id);
CREATE TABLE public.pod_records(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE CASCADE);
CREATE TABLE public.pod_drive_files(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL,pod_record_id uuid REFERENCES pod_records(id) ON DELETE SET NULL);
CREATE TABLE public.trip_images(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,storage_path text);
CREATE TABLE public.trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE);
CREATE TABLE public.flex_rows(id uuid PRIMARY KEY,row_kind text,source_entity_type text,source_entity_id uuid);
CREATE TABLE public.flex_cells(id uuid PRIMARY KEY,row_id uuid REFERENCES flex_rows(id) ON DELETE CASCADE,value jsonb);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['trip_events','store_calls','incidents','demurrages'] LOOP
  EXECUTE format('CREATE TABLE public.%I(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['billings','payables','receivables'] LOOP
  EXECUTE format('CREATE TABLE public.%I(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id) ON DELETE CASCADE)',t);
 END LOOP;
END; $$;
