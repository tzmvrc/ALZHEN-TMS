-- Append exact IDs to the existing v_trip_booking output.
-- Preserve existing report fields (including dr_number, trucking_company,
-- and invoice_number) and their order; add identity columns at the end only.
-- CREATE OR REPLACE VIEW only permits adding columns at the end.
CREATE OR REPLACE VIEW public.v_trip_booking AS
SELECT
  trips.dispatch_number,
  trips.loading_date,
  trips.estimated_delivery_date,
  trip_types.name AS trip_type,
  warehouses.code AS warehouse_code,
  warehouses.name AS warehouse_name,
  trip_stops.stop_sequence,
  customers.name AS customer_name,
  customer_stores.name AS store_name,
  trucks.plate_number,
  profiles.first_name || ' ' || profiles.last_name AS driver_name,
  trucking_companies.name AS trucking_company,
  trip_line_items.dr_number,
  trip_line_items.sap_so_number,
  trip_line_items.customer_po_number,
  trip_line_items.internal_po_number,
  products.sku,
  products.model_code,
  products.name AS product_name,
  trip_line_items.quantity,
  trip_line_items.cbm,
  trips.status AS trip_status,
  trip_stops.delivery_status,
  trips.remarks,
  trips.transaction_number,
  trips.trip_number,
  trips.added_to_report,
  trips.letter_status,
  trips.truck_allocated_by,
  profiles_allocated.first_name || ' ' || profiles_allocated.last_name AS truck_allocated_by_name,
  products.category AS product_category,
  trip_line_items.customer_model,
  trips.subcon_rate_manual,
  trips.signed_dr_upload_date,
  trips.transmittal_date,
  trips.tms_date,
  trips.tms_done_by,
  profiles_tms.first_name || ' ' || profiles_tms.last_name AS tms_done_by_name,
  trips.pod_ac_shipping_date,
  trips.lbc_tracking_number,
  billings.invoice_number,
  -- Append-only exact identity columns.
  trips.id AS _trip_id,
  trip_stops.id AS _trip_stop_id,
  trip_line_items.id AS _trip_line_item_id,
  trip_line_items.product_id AS _product_id,
  trips.trip_type_id AS _trip_type_id,
  trips.warehouse_id AS _warehouse_id,
  trip_stops.customer_id AS _customer_id,
  trip_stops.store_id AS _store_id,
  tta.truck_id AS _truck_id,
  tta.driver_id AS _driver_id,
  tta.trucking_company_id AS _trucking_company_id,
  tta.id AS _assignment_id,
  trips.truck_allocated_by AS _truck_allocated_by,
  trips.tms_done_by AS _tms_done_by,
  billings.id AS _billing_id
FROM trips
LEFT JOIN trip_types ON trip_types.id = trips.trip_type_id
LEFT JOIN warehouses ON warehouses.id = trips.warehouse_id
LEFT JOIN trip_stops ON trip_stops.trip_id = trips.id
LEFT JOIN customers ON customers.id = trip_stops.customer_id
LEFT JOIN customer_stores ON customer_stores.id = trip_stops.store_id
LEFT JOIN trip_line_items ON trip_line_items.trip_stop_id = trip_stops.id
LEFT JOIN products ON products.id = trip_line_items.product_id
LEFT JOIN trip_truck_assignments tta
  ON tta.trip_id = trips.id
  AND tta.assignment_type = 'PRIMARY'
LEFT JOIN trucks ON trucks.id = tta.truck_id
LEFT JOIN drivers ON drivers.id = tta.driver_id
LEFT JOIN trucking_companies ON trucking_companies.id = tta.trucking_company_id
LEFT JOIN profiles ON profiles.id = drivers.profile_id
LEFT JOIN profiles AS profiles_allocated ON profiles_allocated.id = trips.truck_allocated_by
LEFT JOIN profiles AS profiles_tms ON profiles_tms.id = trips.tms_done_by
LEFT JOIN billings ON billings.trip_id = trips.id;
