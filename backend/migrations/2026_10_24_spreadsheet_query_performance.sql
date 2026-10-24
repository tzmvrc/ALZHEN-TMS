-- Non-destructive search projections and matching foreign-key/order indexes.
-- Existing view fields, owners, grants and RLS policies are preserved.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $search$
DECLARE view_name text; definition text; fields text; trip_column text; extra text;
BEGIN
 FOREACH view_name IN ARRAY ARRAY['v_tms_combined','v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_store_calling','vw_store_calling_tracker','v_trip_source_master','v_trip_master_csv'] LOOP
  IF to_regclass('public.'||view_name) IS NULL THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||view_name) AND attname='_search_text' AND NOT attisdropped) THEN CONTINUE; END IF;
  definition:=rtrim(pg_get_viewdef(to_regclass('public.'||view_name),true),E';\n ');
  SELECT string_agg(format('m.%I::text',attname),',' ORDER BY attnum) INTO fields FROM pg_attribute
   WHERE attrelid=to_regclass('public.'||view_name) AND attnum>0 AND NOT attisdropped AND left(attname,1)<>'_' AND atttypid<>'uuid'::regtype;
  SELECT attname INTO trip_column FROM pg_attribute WHERE attrelid=to_regclass('public.'||view_name) AND attname IN ('trip_id','_trip_id') AND atttypid='uuid'::regtype ORDER BY CASE WHEN attname='_trip_id' THEN 0 ELSE 1 END LIMIT 1;
  extra:=CASE WHEN trip_column IS NULL THEN '' ELSE ',parent.dispatch_number,parent.trip_reference' END;
  EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT m.*,concat_ws('' '',%s%s) AS _search_text FROM (%s) m%s',view_name,fields,extra,definition,CASE WHEN trip_column IS NULL THEN '' ELSE format(' LEFT JOIN public.trips parent ON parent.id=m.%I',trip_column) END);
 END LOOP;
END;
$search$;
CREATE INDEX IF NOT EXISTS spreadsheet_trips_active_date_id_idx ON public.trips(loading_date DESC,id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS spreadsheet_trips_status_date_id_idx ON public.trips(status,loading_date DESC,id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS spreadsheet_items_trip_stop_id_idx ON public.trip_line_items(trip_id,trip_stop_id,id);
CREATE INDEX IF NOT EXISTS spreadsheet_incident_scope_idx ON public.incidents(trip_id,trip_stop_id,id);
CREATE INDEX IF NOT EXISTS spreadsheet_backload_scope_idx ON public.backloads(trip_id,trip_stop_id,id);
CREATE INDEX IF NOT EXISTS spreadsheet_offload_scope_idx ON public.offloads(trip_id,trip_stop_id,id);
CREATE INDEX IF NOT EXISTS spreadsheet_pod_scope_dr_idx ON public.pod_records(trip_id,trip_stop_id,dr_number,id);
CREATE INDEX IF NOT EXISTS spreadsheet_warehouses_name_id_idx ON public.warehouses(name,id);
CREATE INDEX IF NOT EXISTS spreadsheet_products_name_id_idx ON public.products(name,id);
CREATE INDEX IF NOT EXISTS spreadsheet_drivers_name_id_idx ON public.drivers(last_name,first_name,id);
CREATE INDEX IF NOT EXISTS spreadsheet_flex_rows_page_idx ON public.flex_rows(table_id,position,created_at,id) WHERE archived_at IS NULL AND row_kind='CUSTOM';
NOTIFY pgrst,'reload schema';
COMMIT;
