-- Append exact IDs to the existing v_dispatch_monitoring view.
-- Keep the existing display projection and its column order before the ID fields.
-- CREATE OR REPLACE VIEW only permits adding columns at the end.
CREATE OR REPLACE VIEW public.v_dispatch_monitoring AS
SELECT
  t.id AS trip_id,
  t.dispatch_number,
  t.loading_date,
  warehouses.code AS warehouse_code,
  warehouses.name AS warehouse_name,
  trucks.plate_number,
  concat_ws(' ', drivers.first_name, drivers.last_name) AS driver_name,
  trucking_companies.name AS trucking_company,
  t.status AS trip_status,
  trip_stops.stop_sequence,
  customers.name AS customer_name,
  customer_stores.name AS store_name,
  trip_stops.delivery_status,
  trip_stops.arrival_time,
  trip_stops.start_unloading_time,
  trip_stops.finish_unloading_time,
  trip_stops.departure_time,
  t.remarks,
  t.transaction_number,
  t.trip_number,
  t.added_to_report,
  t.letter_status,
  t.truck_allocated_by,
  concat_ws(' ', allocated_by.first_name, allocated_by.last_name) AS truck_allocated_by_name,
  t.subcon_rate_manual,
  warehouse_departure.warehouse_departure_time,
  t.signed_dr_upload_date,
  t.transmittal_date,
  t.tms_date,
  t.pod_ac_shipping_date,
  t.lbc_tracking_number,
  t.tms_done_by,
  concat_ws(' ', tms_done.first_name, tms_done.last_name) AS tms_done_by_name,
  -- Append-only exact identity columns.
  t.id AS _trip_id,
  trip_stops.id AS _trip_stop_id,
  trip_types.id AS _trip_type_id,
  t.warehouse_id AS _warehouse_id,
  trip_stops.customer_id AS _customer_id,
  trip_stops.store_id AS _store_id,
  tta.truck_id AS _truck_id,
  tta.driver_id AS _driver_id,
  tta.trucking_company_id AS _trucking_company_id,
  tta.id AS _assignment_id
FROM trips t
LEFT JOIN warehouses ON warehouses.id = t.warehouse_id
LEFT JOIN trip_truck_assignments tta
  ON tta.trip_id = t.id
  AND tta.assignment_type = 'PRIMARY'
LEFT JOIN trucks ON trucks.id = tta.truck_id
LEFT JOIN drivers ON drivers.id = tta.driver_id
LEFT JOIN trucking_companies ON trucking_companies.id = tta.trucking_company_id
LEFT JOIN trip_stops ON trip_stops.trip_id = t.id
LEFT JOIN customers ON customers.id = trip_stops.customer_id
LEFT JOIN customer_stores ON customer_stores.id = trip_stops.store_id
LEFT JOIN profiles allocated_by ON allocated_by.id = t.truck_allocated_by
LEFT JOIN profiles tms_done ON tms_done.id = t.tms_done_by
LEFT JOIN LATERAL (
  SELECT min(trip_events.event_time) AS warehouse_departure_time
  FROM trip_events
  WHERE trip_events.trip_id = t.id
    AND trip_events.event_type = 'WAREHOUSE_DEPARTURE'
) AS warehouse_departure ON true
LEFT JOIN trip_types ON trip_types.id = t.trip_type_id;
