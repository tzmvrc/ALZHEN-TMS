-- Allow incomplete bookings without fabricated warehouse/store/product/quantity values.
-- Apply using the project's normal database migration process before deploying this feature.
BEGIN;
ALTER TABLE public.trips
  ALTER COLUMN warehouse_id DROP NOT NULL,
  ALTER COLUMN trip_type_id DROP NOT NULL,
  ALTER COLUMN loading_date DROP NOT NULL,
  ALTER COLUMN estimated_delivery_date DROP NOT NULL;
ALTER TABLE public.trip_stops
  ALTER COLUMN store_id DROP NOT NULL,
  ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.trip_line_items
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN cbm DROP NOT NULL;
COMMIT;
