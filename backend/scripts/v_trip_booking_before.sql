 WITH trip_booking_scopes AS (
         SELECT trips_1.id AS trip_id,
            trip_stops_1.id AS trip_stop_id,
            trip_line_items_1.id AS trip_line_item_id,
            NULL::uuid AS billing_id
           FROM ((trips trips_1
             LEFT JOIN trip_stops trip_stops_1 ON ((trip_stops_1.trip_id = trips_1.id)))
             LEFT JOIN trip_line_items trip_line_items_1 ON (((trip_line_items_1.trip_stop_id = trip_stops_1.id) AND (trip_line_items_1.trip_id = trips_1.id))))
        UNION ALL
         SELECT billings_1.trip_id,
            NULL::uuid AS uuid,
            NULL::uuid AS uuid,
            billings_1.id
           FROM billings billings_1
        ), unique_active_primary_assignments AS (
         SELECT assignment.id,
            assignment.trip_id,
            assignment.truck_id,
            assignment.driver_id,
            assignment.trucking_company_id,
            assignment.assignment_type,
            assignment.assigned_at,
            assignment.unassigned_at,
            assignment.remarks,
            assignment.created_at,
            assignment.updated_at
           FROM trip_truck_assignments assignment
          WHERE ((assignment.assignment_type = 'PRIMARY'::text) AND (assignment.unassigned_at IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM trip_truck_assignments other
                  WHERE ((other.trip_id = assignment.trip_id) AND (other.assignment_type = 'PRIMARY'::text) AND (other.unassigned_at IS NULL) AND (other.id <> assignment.id))))))
        )
 SELECT
        CASE
            WHEN (trip_booking_scopes.trip_stop_id IS NULL) THEN trips.dispatch_number
            ELSE trip_stops.dispatch_number
        END AS dispatch_number,
    trips.loading_date,
    trips.estimated_delivery_date,
    trip_types.name AS trip_type,
    warehouses.code AS warehouse_code,
    warehouses.name AS warehouse_name,
    trip_stops.stop_sequence,
    customers.name AS customer_name,
    customer_stores.name AS store_name,
    trucks.plate_number,
    ((profiles.first_name || ' '::text) || profiles.last_name) AS driver_name,
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
        CASE
            WHEN (trip_booking_scopes.trip_stop_id IS NULL) THEN trips.transaction_number
            ELSE trip_stops.transaction_number
        END AS transaction_number,
    trips.trip_number,
    trips.added_to_report,
    trips.letter_status,
    trips.truck_allocated_by,
    ((profiles_allocated.first_name || ' '::text) || profiles_allocated.last_name) AS truck_allocated_by_name,
    products.category AS product_category,
    trip_line_items.customer_model,
    trips.subcon_rate_manual,
    trips.signed_dr_upload_date,
    trips.transmittal_date,
    trips.tms_date,
    trips.tms_done_by,
    ((profiles_tms.first_name || ' '::text) || profiles_tms.last_name) AS tms_done_by_name,
    trips.pod_ac_shipping_date,
    trips.lbc_tracking_number,
    billings.invoice_number,
    trips.id AS _trip_id,
    trip_booking_scopes.trip_stop_id AS _trip_stop_id,
    trip_booking_scopes.trip_line_item_id AS _trip_line_item_id,
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
    trip_booking_scopes.billing_id AS _billing_id
   FROM ((((((((((((((((trip_booking_scopes
     JOIN trips ON ((trips.id = trip_booking_scopes.trip_id)))
     LEFT JOIN trip_types ON ((trip_types.id = trips.trip_type_id)))
     LEFT JOIN warehouses ON ((warehouses.id = trips.warehouse_id)))
     LEFT JOIN trip_stops ON (((trip_stops.id = trip_booking_scopes.trip_stop_id) AND (trip_stops.trip_id = trips.id))))
     LEFT JOIN customers ON ((customers.id = trip_stops.customer_id)))
     LEFT JOIN customer_stores ON ((customer_stores.id = trip_stops.store_id)))
     LEFT JOIN trip_line_items ON (((trip_line_items.id = trip_booking_scopes.trip_line_item_id) AND (trip_line_items.trip_id = trips.id) AND (NOT (trip_line_items.trip_stop_id IS DISTINCT FROM trip_booking_scopes.trip_stop_id)))))
     LEFT JOIN products ON ((products.id = trip_line_items.product_id)))
     LEFT JOIN unique_active_primary_assignments tta ON ((tta.trip_id = trips.id)))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
     LEFT JOIN profiles profiles_allocated ON ((profiles_allocated.id = trips.truck_allocated_by)))
     LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)))
     LEFT JOIN billings ON (((billings.id = trip_booking_scopes.billing_id) AND (billings.trip_id = trips.id))));