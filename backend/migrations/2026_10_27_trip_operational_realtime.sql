CREATE TABLE public.trip_operational_signals(
 trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, source text NOT NULL,
 record_id uuid NOT NULL, revision uuid NOT NULL DEFAULT gen_random_uuid(), changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(trip_id,source)
);
ALTER TABLE public.trip_operational_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_operational_signals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.trip_operational_signals TO service_role;
CREATE OR REPLACE FUNCTION public.signal_trip_operation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_trip uuid;after_trip uuid;record uuid;subject uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN before_trip:=OLD.trip_id;record:=OLD.id;END IF;
 IF TG_OP<>'DELETE' THEN after_trip:=NEW.trip_id;record:=NEW.id;END IF;
 FOR subject IN SELECT DISTINCT v FROM unnest(ARRAY[before_trip,after_trip])v WHERE v IS NOT NULL LOOP
  IF EXISTS(SELECT 1 FROM public.trips WHERE id=subject) THEN
   INSERT INTO public.trip_operational_signals(trip_id,source,record_id) VALUES(subject,TG_TABLE_NAME,record)
   ON CONFLICT(trip_id,source) DO UPDATE SET record_id=excluded.record_id,revision=gen_random_uuid(),changed_at=clock_timestamp();
  END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.signal_trip_operation_v1() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE source text;
BEGIN
 FOREACH source IN ARRAY ARRAY['trip_images','loading_reports','unloading_reports','backloads','offloads','demurrages','incidents','report_receipts','pod_records'] LOOP
  EXECUTE format('CREATE TRIGGER trip_operation_signal AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.signal_trip_operation_v1()',source);
 END LOOP;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_operational_signals;
