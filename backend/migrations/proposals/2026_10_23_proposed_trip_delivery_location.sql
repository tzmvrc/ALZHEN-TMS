-- PREPARED ONLY: requires explicit approval before application to a live database.
-- The separately approved address feature uses a trip-stop snapshot; shared stores
-- change only when the administrator explicitly enables the store-update toggle.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.trip_stops ADD COLUMN IF NOT EXISTS delivery_location jsonb;
COMMENT ON COLUMN public.trip_stops.delivery_location IS 'Trip-specific verified delivery address and coordinates; independent of the shared store location.';
NOTIFY pgrst, 'reload schema';
COMMIT;
