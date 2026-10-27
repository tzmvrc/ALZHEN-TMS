-- Only future rows use Planned. Imported/historical explicit statuses are preserved.
ALTER TABLE public.trip_stops ALTER COLUMN delivery_status SET DEFAULT 'PLANNED';
