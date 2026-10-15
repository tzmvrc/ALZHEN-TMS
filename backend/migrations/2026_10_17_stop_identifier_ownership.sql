-- Independent stop transaction identifiers; trip identifiers remain intact.
-- No backfill, operational record changes, RLS changes, or grant changes.
-- Rollback: restore the captured views; retain the additive column to preserve future edits.
BEGIN;
ALTER TABLE public.trip_stops ADD COLUMN IF NOT EXISTS transaction_number text;

CREATE OR REPLACE VIEW public.v_dispatch_monitoring AS
 WITH unique_active_primary_assignments AS (
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
 SELECT t.id AS trip_id,
        CASE
            WHEN (trip_stops.id IS NULL) THEN t.dispatch_number
            ELSE trip_stops.dispatch_number
        END AS dispatch_number,
    t.loading_date,
    warehouses.code AS warehouse_code,
    warehouses.name AS warehouse_name,
    trucks.plate_number,
    concat_ws(' '::text, drivers.first_name, drivers.last_name) AS driver_name,
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
    CASE WHEN trip_stops.id IS NULL THEN t.transaction_number ELSE trip_stops.transaction_number END AS transaction_number,
    t.trip_number,
    t.added_to_report,
    t.letter_status,
    t.truck_allocated_by,
    concat_ws(' '::text, allocated_by.first_name, allocated_by.last_name) AS truck_allocated_by_name,
    t.subcon_rate_manual,
    warehouse_departure.warehouse_departure_time,
    t.signed_dr_upload_date,
    t.transmittal_date,
    t.tms_date,
    t.pod_ac_shipping_date,
    t.lbc_tracking_number,
    t.tms_done_by,
    concat_ws(' '::text, tms_done.first_name, tms_done.last_name) AS tms_done_by_name,
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
   FROM ((((((((((((trips t
     LEFT JOIN warehouses ON ((warehouses.id = t.warehouse_id)))
     LEFT JOIN unique_active_primary_assignments tta ON ((tta.trip_id = t.id)))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN trip_stops ON ((trip_stops.trip_id = t.id)))
     LEFT JOIN customers ON ((customers.id = trip_stops.customer_id)))
     LEFT JOIN customer_stores ON ((customer_stores.id = trip_stops.store_id)))
     LEFT JOIN profiles allocated_by ON ((allocated_by.id = t.truck_allocated_by)))
     LEFT JOIN profiles tms_done ON ((tms_done.id = t.tms_done_by)))
     LEFT JOIN LATERAL ( SELECT min(trip_events.event_time) AS warehouse_departure_time
           FROM trip_events
          WHERE ((trip_events.trip_id = t.id) AND (trip_events.event_type = 'WAREHOUSE_DEPARTURE'::text))) warehouse_departure ON (true))
     LEFT JOIN trip_types ON ((trip_types.id = t.trip_type_id)));

CREATE OR REPLACE VIEW public.v_dispatch_report AS
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
    CASE WHEN dispatch_scopes.trip_stop_id IS NULL THEN trips.transaction_number ELSE trip_stops.transaction_number END AS transaction_number,
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

CREATE OR REPLACE VIEW public.v_store_calling AS
 SELECT sc.id AS store_call_id,
    CASE WHEN sc.trip_stop_id IS NULL THEN t.dispatch_number ELSE ts.dispatch_number END AS dispatch_number,
    t.loading_date,
    ts.stop_sequence,
    c.name AS customer_name,
    cs.name AS store_name,
    tr.plate_number,
    concat_ws(' '::text, d.first_name, d.last_name) AS driver_name,
    tc.name AS trucking_company,
    concat_ws(' '::text, assigned.first_name, assigned.last_name) AS assigned_to,
    sc.date_assigned,
    sc.date_of_contact,
    sc.time_texted,
    sc.time_called,
    sc.contact_number,
    sc.contact_name,
    sc.status,
    sc.confirmation_status,
    sc.remarks,
    w.code AS warehouse_code,
    w.name AS ship_from
   FROM ((((((((((store_calls sc
     LEFT JOIN trips t ON ((t.id = sc.trip_id)))
     LEFT JOIN warehouses w ON ((w.id = t.warehouse_id)))
     LEFT JOIN trip_stops ts ON (((ts.id = sc.trip_stop_id) AND (ts.trip_id = sc.trip_id))))
     LEFT JOIN customers c ON ((c.id = ts.customer_id)))
     LEFT JOIN customer_stores cs ON ((cs.id = ts.store_id)))
     LEFT JOIN trip_truck_assignments tta ON (((tta.trip_id = t.id) AND (tta.assignment_type = 'PRIMARY'::text) AND (tta.unassigned_at IS NULL) AND NOT EXISTS (SELECT 1 FROM public.trip_truck_assignments other WHERE other.trip_id = tta.trip_id AND other.assignment_type = 'PRIMARY' AND other.unassigned_at IS NULL AND other.id <> tta.id))))
     LEFT JOIN trucks tr ON ((tr.id = tta.truck_id)))
     LEFT JOIN drivers d ON ((d.id = tta.driver_id)))
     LEFT JOIN trucking_companies tc ON ((tc.id = tta.trucking_company_id)))
     LEFT JOIN profiles assigned ON ((assigned.id = sc.assigned_to)));

CREATE OR REPLACE VIEW public.v_tms_combined AS
 WITH unique_active_primary_assignments AS (
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
 SELECT t.id AS trip_id,
        CASE
            WHEN (ts.id IS NULL) THEN t.dispatch_number
            ELSE ts.dispatch_number
        END AS dispatch_number,
    t.loading_date,
    t.estimated_delivery_date,
    t.status AS trip_status,
    tt.name AS trip_type,
    w.code AS warehouse_code,
    w.name AS warehouse_name,
    tc.name AS trucking_company,
    tr.plate_number,
    concat_ws(' '::text, d.first_name, d.last_name) AS driver_name,
    ts.id AS trip_stop_id,
    ts.stop_sequence,
    c.id AS customer_id,
    c.name AS customer_name,
    cs.id AS store_id,
    cs.name AS store_name,
    cs.province,
    cs.city,
    ts.delivery_status,
    ts.arrival_time,
    ts.start_unloading_time,
    ts.finish_unloading_time,
    ts.departure_time,
    p.sku,
    p.model_code,
    p.name AS product_name,
    p.category,
    li.quantity,
    li.cbm,
    li.dr_number,
    li.sap_so_number,
    li.customer_po_number,
    li.internal_po_number,
    li.customer_model,
    t.remarks AS trip_remarks,
    ts.remarks AS stop_remarks,
    li.remarks AS item_remarks,
    CASE WHEN ts.id IS NULL THEN t.transaction_number ELSE ts.transaction_number END AS transaction_number,
    t.trip_number,
    t.added_to_report,
    t.letter_status,
    t.truck_allocated_by,
    concat_ws(' '::text, allocated_by.first_name, allocated_by.last_name) AS truck_allocated_by_name,
    t.subcon_rate_manual,
    wh_departure.warehouse_departure_time,
    t.signed_dr_upload_date,
    t.transmittal_date,
    t.tms_date,
    t.tms_done_by,
    concat_ws(' '::text, tms_done.first_name, tms_done.last_name) AS tms_done_by_name,
    t.pod_ac_shipping_date,
    t.lbc_tracking_number,
    li.id AS trip_line_item_id,
    t.id AS _trip_id,
    ts.id AS _trip_stop_id,
    li.id AS _trip_line_item_id,
    tt.id AS _trip_type_id,
    t.warehouse_id AS _warehouse_id,
    ts.customer_id AS _customer_id,
    ts.store_id AS _store_id,
    tta.truck_id AS _truck_id,
    tta.driver_id AS _driver_id,
    tta.trucking_company_id AS _trucking_company_id,
    li.product_id AS _product_id,
    tta.id AS _assignment_id,
    t.truck_allocated_by AS _truck_allocated_by,
    t.tms_done_by AS _tms_done_by
   FROM ((((((((((((((trips t
     LEFT JOIN trip_types tt ON ((tt.id = t.trip_type_id)))
     LEFT JOIN warehouses w ON ((w.id = t.warehouse_id)))
     LEFT JOIN unique_active_primary_assignments tta ON ((tta.trip_id = t.id)))
     LEFT JOIN trucks tr ON ((tr.id = tta.truck_id)))
     LEFT JOIN trucking_companies tc ON ((tc.id = tta.trucking_company_id)))
     LEFT JOIN drivers d ON ((d.id = tta.driver_id)))
     LEFT JOIN trip_stops ts ON ((ts.trip_id = t.id)))
     LEFT JOIN customers c ON ((c.id = ts.customer_id)))
     LEFT JOIN customer_stores cs ON ((cs.id = ts.store_id)))
     LEFT JOIN trip_line_items li ON (((li.trip_stop_id = ts.id) AND (li.trip_id = t.id))))
     LEFT JOIN products p ON ((p.id = li.product_id)))
     LEFT JOIN profiles allocated_by ON ((allocated_by.id = t.truck_allocated_by)))
     LEFT JOIN profiles tms_done ON ((tms_done.id = t.tms_done_by)))
     LEFT JOIN ( SELECT trip_events.trip_id,
            min(trip_events.event_time) AS warehouse_departure_time
           FROM trip_events
          WHERE (trip_events.event_type = 'WAREHOUSE_DEPARTURE'::text)
          GROUP BY trip_events.trip_id) wh_departure ON ((wh_departure.trip_id = t.id)));

CREATE OR REPLACE VIEW public.v_trip_booking AS
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
    CASE WHEN trip_booking_scopes.trip_stop_id IS NULL THEN trips.transaction_number ELSE trip_stops.transaction_number END AS transaction_number,
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

COMMIT;

