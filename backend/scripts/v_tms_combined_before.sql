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
        CASE
            WHEN (ts.id IS NULL) THEN t.transaction_number
            ELSE ts.transaction_number
        END AS transaction_number,
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
    t.tms_done_by AS _tms_done_by,
    ts.dr_number AS transaction_dr_number,
    ts.quantity AS transaction_quantity,
    ts.total_cbm AS transaction_total_cbm,
    COALESCE(t.archived_at, ts.archived_at) AS transaction_archived_at,
    ( SELECT
                CASE
                    WHEN (jsonb_typeof(ce.value) = 'string'::text) THEN (ce.value #>> '{}'::text[])
                    ELSE NULL::text
                END AS "case"
           FROM (((flex_tables ft
             JOIN flex_columns co ON ((co.table_id = ft.id)))
             JOIN flex_rows fr ON ((fr.table_id = ft.id)))
             JOIN flex_cells ce ON (((ce.row_id = fr.id) AND (ce.column_id = co.id))))
          WHERE (((ft.settings ->> 'system_key'::text) = 'alzhen_transmittal_tracker_v1'::text) AND (ft.archived_at IS NULL) AND ((co.settings ->> 'system_key'::text) = 'transmittal_ref'::text) AND (NOT co.is_archived) AND (co.binding_scope = 'STOP'::text) AND (fr.row_kind = 'SOURCE'::text) AND (fr.source_entity_type = 'STOP'::text) AND (fr.archived_at IS NULL) AND (fr.source_entity_id = ts.id))) AS transmittal_ref,
    COALESCE(( SELECT ce.version
           FROM (((flex_tables ft
             JOIN flex_columns co ON ((co.table_id = ft.id)))
             JOIN flex_rows fr ON ((fr.table_id = ft.id)))
             JOIN flex_cells ce ON (((ce.row_id = fr.id) AND (ce.column_id = co.id))))
          WHERE (((ft.settings ->> 'system_key'::text) = 'alzhen_transmittal_tracker_v1'::text) AND (ft.archived_at IS NULL) AND ((co.settings ->> 'system_key'::text) = 'transmittal_ref'::text) AND (NOT co.is_archived) AND (co.binding_scope = 'STOP'::text) AND (fr.row_kind = 'SOURCE'::text) AND (fr.source_entity_type = 'STOP'::text) AND (fr.archived_at IS NULL) AND (fr.source_entity_id = ts.id))), 0) AS transmittal_ref_version
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