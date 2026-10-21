 WITH dispatch_scopes AS (
         SELECT trips_1.id AS trip_id,
            trip_stops_1.id AS trip_stop_id,
            trip_line_items_1.id AS trip_line_item_id,
            NULL::date AS incident_date,
            NULL::text AS ir_status,
            NULL::date AS ir_submitted_date,
            NULL::text AS backload_reason,
            NULL::numeric AS backload_number_of_boxes,
            NULL::text AS backload_comments,
            NULL::numeric AS offload_number_of_boxes,
            NULL::text AS offload_reason,
            NULL::text AS offload_comments,
            NULL::uuid AS incident_id,
            NULL::uuid AS backload_id,
            NULL::uuid AS offload_id
           FROM ((trips trips_1
             LEFT JOIN trip_stops trip_stops_1 ON ((trip_stops_1.trip_id = trips_1.id)))
             LEFT JOIN trip_line_items trip_line_items_1 ON (((trip_line_items_1.trip_stop_id = trip_stops_1.id) AND (trip_line_items_1.trip_id = trips_1.id))))
        UNION ALL
         SELECT inc.trip_id,
            inc.trip_stop_id,
            NULL::uuid AS uuid,
            inc.incident_date,
            inc.status,
            inc.submitted_date,
            NULL::text AS text,
            NULL::numeric AS "numeric",
            NULL::text AS text,
            NULL::numeric AS "numeric",
            NULL::text AS text,
            NULL::text AS text,
            inc.id,
            NULL::uuid AS uuid,
            NULL::uuid AS uuid
           FROM incidents inc
        UNION ALL
         SELECT bl.trip_id,
            bl.trip_stop_id,
            NULL::uuid AS uuid,
            NULL::date AS date,
            NULL::text AS text,
            NULL::date AS date,
            bl.reason,
            bl.number_of_boxes,
            bl.comments,
            NULL::numeric AS "numeric",
            NULL::text AS text,
            NULL::text AS text,
            NULL::uuid AS uuid,
            bl.id,
            NULL::uuid AS uuid
           FROM backloads bl
        UNION ALL
         SELECT off.trip_id,
            off.trip_stop_id,
            NULL::uuid AS uuid,
            NULL::date AS date,
            NULL::text AS text,
            NULL::date AS date,
            NULL::text AS text,
            NULL::numeric AS "numeric",
            NULL::text AS text,
            off.number_of_boxes,
            off.reason,
            off.comments,
            NULL::uuid AS uuid,
            NULL::uuid AS uuid,
            off.id
           FROM offloads off
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
            WHEN (dispatch_scopes.trip_stop_id IS NULL) THEN trips.dispatch_number
            ELSE trip_stops.dispatch_number
        END AS dispatch_number,
    trips.loading_date,
    trips.estimated_delivery_date,
    trip_stops.delivery_status,
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
        CASE
            WHEN (dispatch_scopes.trip_stop_id IS NULL) THEN trips.transaction_number
            ELSE trip_stops.transaction_number
        END AS transaction_number,
    trips.trip_number,
    trips.added_to_report,
    trips.letter_status,
    ((profiles.first_name || ' '::text) || profiles.last_name) AS driver_name,
    trucking_companies.name AS trucking_company,
    trips.subcon_rate_manual,
    trip_stops.arrival_time,
    trip_stops.start_unloading_time,
    trip_stops.finish_unloading_time,
    trip_stops.departure_time,
    trip_line_items.customer_model,
    dispatch_scopes.incident_date,
    dispatch_scopes.ir_status,
    dispatch_scopes.ir_submitted_date,
    dispatch_scopes.backload_reason,
    (dispatch_scopes.backload_number_of_boxes)::numeric(14,3) AS backload_number_of_boxes,
    dispatch_scopes.backload_comments,
    (dispatch_scopes.offload_number_of_boxes)::numeric(14,3) AS offload_number_of_boxes,
    dispatch_scopes.offload_reason,
    dispatch_scopes.offload_comments,
    trips.signed_dr_upload_date,
    trips.transmittal_date,
    trips.tms_date,
    trips.pod_ac_shipping_date,
    trips.lbc_tracking_number,
    ((profiles_tms.first_name || ' '::text) || profiles_tms.last_name) AS tms_done_by_name,
    trips.id AS _trip_id,
    dispatch_scopes.trip_stop_id AS _trip_stop_id,
    dispatch_scopes.trip_line_item_id AS _trip_line_item_id,
    trip_line_items.product_id AS _product_id,
    trips.warehouse_id AS _warehouse_id,
    trip_stops.customer_id AS _customer_id,
    trip_stops.store_id AS _store_id,
    tta.truck_id AS _truck_id,
    tta.driver_id AS _driver_id,
    tta.trucking_company_id AS _trucking_company_id,
    tta.id AS _assignment_id,
    trips.tms_done_by AS _tms_done_by,
    dispatch_scopes.incident_id AS _incident_id,
    dispatch_scopes.backload_id AS _backload_id,
    dispatch_scopes.offload_id AS _offload_id
   FROM (((((((((((((dispatch_scopes
     JOIN trips ON ((trips.id = dispatch_scopes.trip_id)))
     LEFT JOIN warehouses ON ((warehouses.id = trips.warehouse_id)))
     LEFT JOIN trip_stops ON (((trip_stops.id = dispatch_scopes.trip_stop_id) AND (trip_stops.trip_id = trips.id))))
     LEFT JOIN trip_line_items ON (((trip_line_items.id = dispatch_scopes.trip_line_item_id) AND (trip_line_items.trip_id = trips.id) AND (NOT (trip_line_items.trip_stop_id IS DISTINCT FROM dispatch_scopes.trip_stop_id)))))
     LEFT JOIN products ON ((products.id = trip_line_items.product_id)))
     LEFT JOIN customer_stores ON ((customer_stores.id = trip_stops.store_id)))
     LEFT JOIN customers ON ((customers.id = trip_stops.customer_id)))
     LEFT JOIN unique_active_primary_assignments tta ON ((tta.trip_id = trips.id)))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
     LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)));