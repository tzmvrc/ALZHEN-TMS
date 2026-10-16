-- PROPOSAL ONLY: explicit approval required before applying to live Supabase.
-- Add row-lock-ordered versions to existing spreadsheet sources. No business
-- records, history, receipts, grants, policies or publications are changed.
-- Existing rows begin at version zero; each successful UPDATE increments once.
-- Recovery: disable Socket commit consumers, then separately review removal of
-- these six triggers/metadata columns and the helper. No business data rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.bump_collaboration_version_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW.collaboration_version := OLD.collaboration_version + 1;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_collaboration_version_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bump_collaboration_version_v1() TO service_role;
DO $$
DECLARE source text;
BEGIN
 FOREACH source IN ARRAY ARRAY['trips','trip_stops','trip_line_items','trip_truck_assignments','store_calls','billings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN collaboration_version bigint NOT NULL DEFAULT 0 CHECK (collaboration_version BETWEEN 0 AND 9007199254740991)',source);
  EXECUTE format('CREATE TRIGGER collaboration_version_v1 BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_collaboration_version_v1()',source);
 END LOOP;
END;
$$;
COMMIT;
