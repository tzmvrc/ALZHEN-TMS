-- Required schema fix for the reporting layer.
-- PostgreSQL views are recreated in place; the existing view must be preserved while
-- adding the missing per-line-item identifier required by the frontend row key.
--
-- IMPORTANT: Replace the current SELECT list in public.v_tms_combined, preserving all
-- existing columns and joins. Add this expression alongside trip_id and trip_stop_id:
--
--   trip_line_items.id AS trip_line_item_id
--
-- This is the minimal safe change for the true row identity:
--   trip_id + trip_stop_id + trip_line_item_id
--
-- Exact migration pattern to run in Supabase SQL Editor:

CREATE OR REPLACE VIEW public.v_tms_combined AS
SELECT
  trips.id AS trip_id,
  trip_stops.id AS trip_stop_id,
  trip_line_items.id AS trip_line_item_id,
  -- keep all existing fields below this line exactly as they already are
  dispatches.dispatch_number,
  trips.loading_date,
  trips.estimated_delivery_date,
  trips.status AS trip_status,
  trip_types.name AS trip_type,
  warehouses.code AS warehouse_code,
  warehouses.name AS warehouse_name,
  trucking_companies.name AS trucking_company,
  trucks.plate_number,
  profiles.first_name || ' ' || profiles.last_name AS driver_name,
  customers.id AS customer_id,
  customers.name AS customer_name,
  stores.id AS store_id,
  stores.name AS store_name,
  province.name AS province,
  city.name AS city,
  trip_stop_deliveries.status AS delivery_status
FROM trips
LEFT JOIN trip_stops ON trip_stops.trip_id = trips.id
LEFT JOIN trip_line_items ON trip_line_items.trip_id = trips.id
LEFT JOIN trip_stop_deliveries ON trip_stop_deliveries.trip_stop_id = trip_stops.id
LEFT JOIN dispatches ON dispatches.id = trips.dispatch_id
LEFT JOIN warehouses ON warehouses.id = trips.warehouse_id
LEFT JOIN trip_types ON trip_types.id = trips.trip_type_id
LEFT JOIN trucks ON trucks.id = trips.truck_id
LEFT JOIN profiles ON profiles.id = trips.driver_id
LEFT JOIN customers ON customers.id = trip_stops.customer_id
LEFT JOIN stores ON stores.id = trip_stops.store_id
LEFT JOIN province ON province.id = stores.province_id
LEFT JOIN city ON city.id = stores.city_id
LEFT JOIN trucking_companies ON trucking_companies.id = trucks.trucking_company_id;

-- The exact join list and existing fields must remain unchanged beyond adding the
-- trip_line_item_id expression. Do not replace the view with a different schema or
-- duplicate-report pattern.
