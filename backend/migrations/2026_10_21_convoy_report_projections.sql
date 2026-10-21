BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.trips ADD COLUMN spreadsheet_issue_type text CHECK(length(spreadsheet_issue_type)<=500),ADD COLUMN spreadsheet_issue_reason text CHECK(length(spreadsheet_issue_reason)<=2000);
ALTER TABLE public.trip_stops ADD COLUMN spreadsheet_issue_type text CHECK(length(spreadsheet_issue_type)<=500),ADD COLUMN spreadsheet_issue_reason text CHECK(length(spreadsheet_issue_reason)<=2000);
DO $$ BEGIN IF md5(replace(pg_get_viewdef('public.v_dispatch_monitoring'::regclass),chr(13),''))<>'d22d2f62442d7606abc0da7e0a4e168f' THEN RAISE EXCEPTION 'Report definition changed; review before replacing v_dispatch_monitoring';END IF;END $$;
CREATE OR REPLACE VIEW public.v_dispatch_monitoring AS SELECT source.*,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_type ELSE s.spreadsheet_issue_type END AS issue_report_type,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_reason ELSE s.spreadsheet_issue_reason END AS issue_reason,c.total_cbm AS trip_total_cbm,a.assigned_cbm,c.remaining_cbm AS remaining_unassigned_cbm,a.capacity_cbm AS truck_capacity_cbm,CASE WHEN a.capacity_cbm>0 THEN a.assigned_cbm/a.capacity_cbm*100 END AS capacity_utilization FROM (WITH active_convoy_assignments AS (
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
            assignment.updated_at, assignment.stop_scope
           FROM trip_truck_assignments assignment
          WHERE assignment.unassigned_at IS NULL
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
        CASE
            WHEN (trip_stops.id IS NULL) THEN t.transaction_number
            ELSE trip_stops.transaction_number
        END AS transaction_number,
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
    tta.id AS _assignment_id,
    trip_stops.dr_number AS transaction_dr_number,
    trip_stops.quantity AS transaction_quantity,
    trip_stops.total_cbm AS transaction_total_cbm,
    COALESCE(t.archived_at, trip_stops.archived_at) AS transaction_archived_at,
    ( SELECT
                CASE
                    WHEN (jsonb_typeof(ce.value) = 'string'::text) THEN (ce.value #>> '{}'::text[])
                    ELSE NULL::text
                END AS "case"
           FROM (((flex_tables ft
             JOIN flex_columns co ON ((co.table_id = ft.id)))
             JOIN flex_rows fr ON ((fr.table_id = ft.id)))
             JOIN flex_cells ce ON (((ce.row_id = fr.id) AND (ce.column_id = co.id))))
          WHERE (((ft.settings ->> 'system_key'::text) = 'alzhen_transmittal_tracker_v1'::text) AND (ft.archived_at IS NULL) AND ((co.settings ->> 'system_key'::text) = 'transmittal_ref'::text) AND (NOT co.is_archived) AND (co.binding_scope = 'STOP'::text) AND (fr.row_kind = 'SOURCE'::text) AND (fr.source_entity_type = 'STOP'::text) AND (fr.archived_at IS NULL) AND (fr.source_entity_id = trip_stops.id))) AS transmittal_ref,
    COALESCE(( SELECT ce.version
           FROM (((flex_tables ft
             JOIN flex_columns co ON ((co.table_id = ft.id)))
             JOIN flex_rows fr ON ((fr.table_id = ft.id)))
             JOIN flex_cells ce ON (((ce.row_id = fr.id) AND (ce.column_id = co.id))))
          WHERE (((ft.settings ->> 'system_key'::text) = 'alzhen_transmittal_tracker_v1'::text) AND (ft.archived_at IS NULL) AND ((co.settings ->> 'system_key'::text) = 'transmittal_ref'::text) AND (NOT co.is_archived) AND (co.binding_scope = 'STOP'::text) AND (fr.row_kind = 'SOURCE'::text) AND (fr.source_entity_type = 'STOP'::text) AND (fr.archived_at IS NULL) AND (fr.source_entity_id = trip_stops.id))), 0) AS transmittal_ref_version
   FROM ((((((((((((trips t
     LEFT JOIN warehouses ON ((warehouses.id = t.warehouse_id)))
     LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = t.id)))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN trip_stops ON ((trip_stops.trip_id = t.id AND (tta.id IS NULL OR tta.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=tta.id AND responsibility.trip_stop_id=trip_stops.id)))))
     LEFT JOIN customers ON ((customers.id = trip_stops.customer_id)))
     LEFT JOIN customer_stores ON ((customer_stores.id = trip_stops.store_id)))
     LEFT JOIN profiles allocated_by ON ((allocated_by.id = t.truck_allocated_by)))
     LEFT JOIN profiles tms_done ON ((tms_done.id = t.tms_done_by)))
     LEFT JOIN LATERAL ( SELECT min(trip_events.event_time) AS warehouse_departure_time
           FROM trip_events
          WHERE ((trip_events.trip_id = t.id) AND (trip_events.event_type = 'WAREHOUSE_DEPARTURE'::text))) warehouse_departure ON (true))
     LEFT JOIN trip_types ON ((trip_types.id = t.trip_type_id)))) source LEFT JOIN public.trips t ON t.id=source._trip_id LEFT JOIN public.trip_stops s ON s.id=source._trip_stop_id LEFT JOIN public.v_trip_cargo_totals c ON c.trip_id=source._trip_id LEFT JOIN public.v_trip_assignment_totals a ON a.assignment_id=source._assignment_id;
DO $$ BEGIN IF md5(replace(pg_get_viewdef('public.v_dispatch_report'::regclass),chr(13),''))<>'091d74422fceee4b1420c7993f552aff' THEN RAISE EXCEPTION 'Report definition changed; review before replacing v_dispatch_report';END IF;END $$;
CREATE OR REPLACE VIEW public.v_dispatch_report AS SELECT source.*,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_type ELSE s.spreadsheet_issue_type END AS issue_report_type,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_reason ELSE s.spreadsheet_issue_reason END AS issue_reason,c.total_cbm AS trip_total_cbm,a.assigned_cbm,c.remaining_cbm AS remaining_unassigned_cbm,a.capacity_cbm AS truck_capacity_cbm,CASE WHEN a.capacity_cbm>0 THEN a.assigned_cbm/a.capacity_cbm*100 END AS capacity_utilization FROM (WITH dispatch_scopes AS (
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
        ), active_convoy_assignments AS (
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
            assignment.updated_at, assignment.stop_scope
           FROM trip_truck_assignments assignment
          WHERE assignment.unassigned_at IS NULL
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
     LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = trips.id AND (dispatch_scopes.trip_stop_id IS NULL OR tta.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=tta.id AND responsibility.trip_stop_id=dispatch_scopes.trip_stop_id)))))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
     LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)))) source LEFT JOIN public.trips t ON t.id=source._trip_id LEFT JOIN public.trip_stops s ON s.id=source._trip_stop_id LEFT JOIN public.v_trip_cargo_totals c ON c.trip_id=source._trip_id LEFT JOIN public.v_trip_assignment_totals a ON a.assignment_id=source._assignment_id;
DO $$ BEGIN IF md5(replace(pg_get_viewdef('public.v_tms_combined'::regclass),chr(13),''))<>'c73ecc2f2d33d3758f4a987f8dcd43f1' THEN RAISE EXCEPTION 'Report definition changed; review before replacing v_tms_combined';END IF;END $$;
CREATE OR REPLACE VIEW public.v_tms_combined AS SELECT source.*,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_type ELSE s.spreadsheet_issue_type END AS issue_report_type,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_reason ELSE s.spreadsheet_issue_reason END AS issue_reason,c.total_cbm AS trip_total_cbm,a.assigned_cbm,c.remaining_cbm AS remaining_unassigned_cbm,a.capacity_cbm AS truck_capacity_cbm,CASE WHEN a.capacity_cbm>0 THEN a.assigned_cbm/a.capacity_cbm*100 END AS capacity_utilization FROM (WITH active_convoy_assignments AS (
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
            assignment.updated_at, assignment.stop_scope
           FROM trip_truck_assignments assignment
          WHERE assignment.unassigned_at IS NULL
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
     LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = t.id)))
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
          GROUP BY trip_events.trip_id) wh_departure ON ((wh_departure.trip_id = t.id)))) source LEFT JOIN public.trips t ON t.id=source._trip_id LEFT JOIN public.trip_stops s ON s.id=source._trip_stop_id LEFT JOIN public.v_trip_cargo_totals c ON c.trip_id=source._trip_id LEFT JOIN public.v_trip_assignment_totals a ON a.assignment_id=source._assignment_id;
DO $$ BEGIN IF md5(replace(pg_get_viewdef('public.v_trip_booking'::regclass),chr(13),''))<>'81a6c6ddecf13158f267a6cc4aeb33cd' THEN RAISE EXCEPTION 'Report definition changed; review before replacing v_trip_booking';END IF;END $$;
CREATE OR REPLACE VIEW public.v_trip_booking AS SELECT source.*,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_type ELSE s.spreadsheet_issue_type END AS issue_report_type,CASE WHEN source._trip_stop_id IS NULL THEN t.spreadsheet_issue_reason ELSE s.spreadsheet_issue_reason END AS issue_reason,c.total_cbm AS trip_total_cbm,a.assigned_cbm,c.remaining_cbm AS remaining_unassigned_cbm,a.capacity_cbm AS truck_capacity_cbm,CASE WHEN a.capacity_cbm>0 THEN a.assigned_cbm/a.capacity_cbm*100 END AS capacity_utilization FROM (WITH trip_booking_scopes AS (
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
        ), active_convoy_assignments AS (
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
            assignment.updated_at, assignment.stop_scope
           FROM trip_truck_assignments assignment
          WHERE assignment.unassigned_at IS NULL
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
     LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = trips.id AND (trip_booking_scopes.trip_stop_id IS NULL OR tta.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=tta.id AND responsibility.trip_stop_id=trip_booking_scopes.trip_stop_id)) AND trip_booking_scopes.billing_id IS NULL)))
     LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
     LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
     LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
     LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
     LEFT JOIN profiles profiles_allocated ON ((profiles_allocated.id = trips.truck_allocated_by)))
     LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)))
     LEFT JOIN billings ON (((billings.id = trip_booking_scopes.billing_id) AND (billings.trip_id = trips.id))))) source LEFT JOIN public.trips t ON t.id=source._trip_id LEFT JOIN public.trip_stops s ON s.id=source._trip_stop_id LEFT JOIN public.v_trip_cargo_totals c ON c.trip_id=source._trip_id LEFT JOIN public.v_trip_assignment_totals a ON a.assignment_id=source._assignment_id;
GRANT SELECT ON public.vw_store_calling_tracker TO service_role;
COMMIT;
