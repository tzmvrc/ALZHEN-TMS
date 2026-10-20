-- Keep trip_number as the numeric position within a dispatch.
-- trip_reference is the unique, user-facing TRIPYYMMDD-N identifier.
BEGIN;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS trip_reference text;

WITH numbered AS (
  SELECT id,
    'TRIP' || to_char(coalesce(loading_date::date, (created_at AT TIME ZONE 'Asia/Manila')::date, (now() AT TIME ZONE 'Asia/Manila')::date), 'YYMMDD') AS prefix,
    row_number() OVER (
      PARTITION BY coalesce(loading_date::date, (created_at AT TIME ZONE 'Asia/Manila')::date, (now() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY created_at NULLS FIRST, id
    ) AS position
  FROM public.trips WHERE trip_reference IS NULL OR btrim(trip_reference) = ''
), existing AS (
  SELECT split_part(trip_reference, '-', 1) AS prefix,
    max(substring(trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint) AS maximum
  FROM public.trips WHERE trip_reference ~ '^TRIP[0-9]{6}-[0-9]+$'
  GROUP BY split_part(trip_reference, '-', 1)
)
UPDATE public.trips AS trip SET trip_reference = numbered.prefix || '-' || (coalesce(existing.maximum, 0) + numbered.position)::text
FROM numbered LEFT JOIN existing USING (prefix) WHERE trip.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS trips_trip_reference_unique ON public.trips(trip_reference);

CREATE OR REPLACE FUNCTION public.generate_trip_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  prefix text;
  next_number bigint;
BEGIN
  -- Assign on insert under a date-specific transaction lock so concurrent
  -- creators receive different references even if their previews matched.
  prefix := 'TRIP' || to_char(coalesce(NEW.loading_date::date, (now() AT TIME ZONE 'Asia/Manila')::date), 'YYMMDD');
  PERFORM pg_advisory_xact_lock(hashtextextended(prefix, 0));
  SELECT coalesce(max(substring(trip_reference FROM '^TRIP[0-9]{6}-([0-9]+)$')::bigint), 0) + 1
    INTO next_number FROM public.trips WHERE trip_reference LIKE prefix || '-%';
  NEW.trip_reference := prefix || '-' || next_number::text;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trips_generate_trip_reference ON public.trips;
CREATE TRIGGER trips_generate_trip_reference BEFORE INSERT ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.generate_trip_reference();
REVOKE ALL ON FUNCTION public.generate_trip_reference() FROM PUBLIC;
COMMIT;
