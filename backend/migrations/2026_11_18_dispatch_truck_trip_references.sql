-- A truck keeps the same displayed Trip no. across DRs in one dispatch.
-- Physical trips retain their existing trip_reference and numeric trip_number.
BEGIN;
ALTER TABLE public.trip_truck_assignments ADD COLUMN IF NOT EXISTS trip_reference text;
CREATE INDEX IF NOT EXISTS trip_truck_assignments_reference_idx ON public.trip_truck_assignments(trip_reference) WHERE trip_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_trip_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE prefix text; next_number bigint;
BEGIN
  prefix := 'TRIP' || to_char(coalesce(NEW.loading_date::date, (now() AT TIME ZONE 'Asia/Manila')::date), 'YYMMDD');
  PERFORM pg_advisory_xact_lock(hashtextextended(prefix, 0));
  SELECT greatest(
    coalesce((SELECT max(substring(t.trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint)
      FROM public.trips t WHERE t.trip_reference LIKE prefix || '-%'), 0),
    coalesce((SELECT max(substring(a.trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint)
      FROM public.trip_truck_assignments a WHERE a.trip_reference LIKE prefix || '-%'), 0)
  ) + 1 INTO next_number;
  NEW.trip_reference := prefix || '-' || next_number::text;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_assignment_trip_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE parent record; prefix text; existing text; next_number bigint;
BEGIN
  IF NEW.truck_id IS NULL THEN NEW.trip_reference := NULL; RETURN NEW; END IF;
  SELECT id, dispatch_number, trip_reference, loading_date INTO parent
    FROM public.trips WHERE id = NEW.trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip does not exist.' USING ERRCODE = '23503'; END IF;
  prefix := substring(parent.trip_reference FROM '^TRIP[0-9]{6}');
  IF prefix IS NULL THEN
    prefix := 'TRIP' || to_char(coalesce(parent.loading_date::date, (now() AT TIME ZONE 'Asia/Manila')::date), 'YYMMDD');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(prefix, 0));
  IF TG_OP = 'UPDATE' THEN
    IF OLD.trip_id = NEW.trip_id AND OLD.truck_id = NEW.truck_id
      AND OLD.trip_reference IS NOT NULL THEN
      NEW.trip_reference := OLD.trip_reference;
      RETURN NEW;
    END IF;
  END IF;
  SELECT a.trip_reference INTO existing
    FROM public.trip_truck_assignments a JOIN public.trips t ON t.id = a.trip_id
    WHERE a.id <> NEW.id AND a.truck_id = NEW.truck_id
      AND coalesce(t.dispatch_number, t.id::text) = coalesce(parent.dispatch_number, parent.id::text)
      AND a.trip_reference IS NOT NULL
    ORDER BY a.created_at, a.id LIMIT 1;
  IF existing IS NOT NULL THEN
    NEW.trip_reference := existing;
  ELSIF parent.trip_reference ~ '^TRIP[0-9]{6}-[0-9]+$'
    AND NOT EXISTS (SELECT 1 FROM public.trip_truck_assignments a
      WHERE a.id <> NEW.id AND a.trip_reference = parent.trip_reference) THEN
    NEW.trip_reference := parent.trip_reference;
  ELSE
    SELECT greatest(
      coalesce((SELECT max(substring(t.trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint)
        FROM public.trips t WHERE t.trip_reference LIKE prefix || '-%'), 0),
      coalesce((SELECT max(substring(a.trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint)
        FROM public.trip_truck_assignments a WHERE a.trip_reference LIKE prefix || '-%'), 0)
    ) + 1 INTO next_number;
    NEW.trip_reference := prefix || '-' || next_number::text;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trip_assignments_generate_reference ON public.trip_truck_assignments;
CREATE TRIGGER trip_assignments_generate_reference
BEFORE INSERT OR UPDATE OF trip_id, truck_id, trip_reference ON public.trip_truck_assignments
FOR EACH ROW EXECUTE FUNCTION public.generate_assignment_trip_reference();

DO $$ DECLARE assignment record;
BEGIN
  FOR assignment IN SELECT id FROM public.trip_truck_assignments
    WHERE trip_reference IS NULL AND truck_id IS NOT NULL ORDER BY created_at, id LOOP
    UPDATE public.trip_truck_assignments SET trip_reference = NULL WHERE id = assignment.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.generate_assignment_trip_reference() FROM PUBLIC;
COMMIT;
