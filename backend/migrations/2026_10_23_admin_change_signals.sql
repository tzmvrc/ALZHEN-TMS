-- Minimal invalidation metadata, never business rows, profile details or paths.
-- Installation touches no operational records. Recovery: stop the new consumer
-- and remove these specifically named triggers in a separately reviewed rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE TABLE public.admin_change_signals (
  topic text PRIMARY KEY,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.admin_change_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_change_signals FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.admin_change_signals TO authenticated,service_role;

CREATE FUNCTION public.can_read_admin_change_signals()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.admin_staff_session_days s ON s.profile_id=p.id AND s.role=p.role
    WHERE p.id=auth.uid() AND p.role IN ('ADMIN','STAFF') AND s.expires_at>now()
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_admin_change_signals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_admin_change_signals() TO authenticated,service_role;
CREATE POLICY admin_change_signals_management_read ON public.admin_change_signals
  FOR SELECT TO authenticated USING ((SELECT public.can_read_admin_change_signals()));

CREATE FUNCTION public.notify_admin_source_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Only the trigger's table name is emitted. Old/new row contents are never read.
  INSERT INTO public.admin_change_signals(topic) VALUES(TG_TABLE_NAME)
    ON CONFLICT(topic) DO UPDATE SET revision=gen_random_uuid(),changed_at=clock_timestamp();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_source_change() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'trips','trip_stops','trip_line_items','trip_truck_assignments','trip_events',
    'store_calls','documents','trip_images','incidents','incident_reasons','demurrages',
    'backloads','backload_items','offloads','offload_items','loading_reports',
    'unloading_reports','report_receipts','operations_report_conversions',
    'pod_records','pod_drive_files','profiles','admin_notifications','customers',
    'customer_stores','store_contacts','store_exceptions','warehouses','drivers',
    'trucks','truck_images','trucking_companies','trip_types','products','rate_cards',
    'billings','payables','receivables','tms_dropdown_options','tms_route_options',
    'flex_tables','flex_columns','flex_rows','flex_cells','flex_dropdown_options',
    'flex_table_permissions','flex_cell_mentions','shared_table_column_widths',
    'driver_trip_updates','offload_deletion_jobs','transaction_deletion_jobs'
  ] LOOP
    -- Fail installation rather than silently omit an assumed source relation.
    EXECUTE format('CREATE TRIGGER admin_change_signal_trg AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change()',v_table);
  END LOOP;
END; $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_change_signals;
COMMIT;
