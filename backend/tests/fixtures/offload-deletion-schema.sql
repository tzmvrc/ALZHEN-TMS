-- ONLY for a newly created disposable local PostgreSQL cluster.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END; $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
CREATE TABLE public.trips(id uuid PRIMARY KEY);
CREATE TABLE public.trip_stops(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),UNIQUE(id,trip_id));
CREATE TABLE public.offloads(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),trip_stop_id uuid,reason text,UNIQUE(id,trip_id),FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id));
CREATE TABLE public.offload_items(id uuid PRIMARY KEY,offload_id uuid REFERENCES offloads(id) ON DELETE CASCADE,quantity numeric,total_cbm numeric);
CREATE TABLE public.report_receipts(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),trip_stop_id uuid REFERENCES trip_stops(id),offload_id uuid REFERENCES offloads(id),storage_path text UNIQUE,FOREIGN KEY(offload_id,trip_id) REFERENCES offloads(id,trip_id),FOREIGN KEY(trip_stop_id,trip_id) REFERENCES trip_stops(id,trip_id));
CREATE TABLE public.operations_report_conversions(source_type text,source_id uuid,target_type text,target_id uuid);
CREATE TABLE public.documents(id uuid PRIMARY KEY,file_path text);
-- Catalog-verified source immutability guard, retained by the new RPC.
CREATE FUNCTION public.guard_converted_operations_report_source_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM operations_report_conversions WHERE source_type='OFFLOAD' AND source_id=OLD.id) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Converted source report is immutable.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER converted_offload_immutable_trg BEFORE DELETE OR UPDATE ON offloads FOR EACH ROW EXECUTE FUNCTION guard_converted_operations_report_source_v1();
