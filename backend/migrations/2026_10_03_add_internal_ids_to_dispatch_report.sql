-- Append exact IDs to the existing v_dispatch_report output.
-- Existing report column names and order must remain unchanged.
-- CREATE OR REPLACE VIEW only permits adding columns at the end.
CREATE OR REPLACE VIEW public.v_dispatch_report AS
SELECT
  trips.dispatch_number,
  trips.loading_date,
  trips.estimated_delivery_date,
  trip_stops.delivery_status AS delivery_status,
  warehouses.code AS wh_code,
  warehouses.name AS ship_from,
  customer_stores.name AS ship_to,
  customers.name AS customer_name,
  trucks.plate_number,
  trip_line_items.dr_number,
  trip_line_items.sap_so_number,
  trip_line_items.customer_po_number,
  trip_line_items.internal_po_number,
  products.model_code AS product_model,
  products.category,
  trip_line_items.quantity,
  trip_line_items.cbm,
  customer_stores.province,
  customer_stores.city,
  trips.remarks,
  trips.transaction_number,
  trips.trip_number,
  trips.added_to_report,
  trips.letter_status,
  profiles.first_name || ' ' || profiles.last_name AS driver_name,
  trucking_companies.name AS trucking_company,
  trips.subcon_rate_manual,
  trip_stops.arrival_time,
  trip_stops.start_unloading_time,
  trip_stops.finish_unloading_time,
  trip_stops.departure_time,
  trip_line_items.customer_model,
  inc.incident_date,
  inc.status AS ir_status,
  inc.submitted_date AS ir_submitted_date,
  bl.reason AS backload_reason,
  bl.number_of_boxes AS backload_number_of_boxes,
  bl.comments AS backload_comments,
  off.number_of_boxes AS offload_number_of_boxes,
  off.reason AS offload_reason,
  off.comments AS offload_comments,
  trips.signed_dr_upload_date,
  trips.transmittal_date,
  trips.tms_date,
  trips.pod_ac_shipping_date,
  trips.lbc_tracking_number,
  profiles_tms.first_name || ' ' || profiles_tms.last_name AS tms_done_by_name,
  -- Append-only exact identity columns.
  trips.id AS _trip_id,
  trip_stops.id AS _trip_stop_id,
  trip_line_items.id AS _trip_line_item_id,
  trip_line_items.product_id AS _product_id,
  trips.warehouse_id AS _warehouse_id,
  trip_stops.customer_id AS _customer_id,
  trip_stops.store_id AS _store_id,
  tta.truck_id AS _truck_id,
  tta.driver_id AS _driver_id,
  tta.trucking_company_id AS _trucking_company_id,
  tta.id AS _assignment_id,
  trips.tms_done_by AS _tms_done_by
FROM trips
LEFT JOIN warehouses ON warehouses.id = trips.warehouse_id
LEFT JOIN trip_stops ON trip_stops.trip_id = trips.id
LEFT JOIN trip_line_items ON trip_line_items.trip_stop_id = trip_stops.id
LEFT JOIN products ON products.id = trip_line_items.product_id
LEFT JOIN customer_stores ON customer_stores.id = trip_stops.store_id
LEFT JOIN customers ON customers.id = trip_stops.customer_id
LEFT JOIN trip_truck_assignments tta
  ON tta.trip_id = trips.id
  AND tta.assignment_type = 'PRIMARY'
LEFT JOIN trucks ON trucks.id = tta.truck_id
LEFT JOIN drivers ON drivers.id = tta.driver_id
LEFT JOIN trucking_companies ON trucking_companies.id = tta.trucking_company_id
LEFT JOIN profiles ON profiles.id = drivers.profile_id
LEFT JOIN incidents inc
  ON inc.trip_id = trips.id
  AND (inc.trip_stop_id = trip_stops.id OR inc.trip_stop_id IS NULL)
LEFT JOIN backloads bl
  ON bl.trip_id = trips.id
  AND (bl.trip_stop_id = trip_stops.id OR bl.trip_stop_id IS NULL)
LEFT JOIN offloads off
  ON off.trip_id = trips.id
  AND (off.trip_stop_id = trip_stops.id OR off.trip_stop_id IS NULL)
LEFT JOIN profiles AS profiles_tms ON profiles_tms.id = trips.tms_done_by;
