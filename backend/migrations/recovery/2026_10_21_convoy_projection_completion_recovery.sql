BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE VIEW public.v_dispatch_monitoring AS SELECT old_projection.*, NULL::text AS stop_dispatch_reference FROM ( SELECT source.trip_id,
    source.dispatch_number,
    source.loading_date,
    source.warehouse_code,
    source.warehouse_name,
    source.plate_number,
    source.driver_name,
    source.trucking_company,
    source.trip_status,
    source.stop_sequence,
    source.customer_name,
    source.store_name,
    source.delivery_status,
    source.arrival_time,
    source.start_unloading_time,
    source.finish_unloading_time,
    source.departure_time,
    source.remarks,
    source.transaction_number,
    source.trip_number,
    source.added_to_report,
    source.letter_status,
    source.truck_allocated_by,
    source.truck_allocated_by_name,
    source.subcon_rate_manual,
    source.warehouse_departure_time,
    source.signed_dr_upload_date,
    source.transmittal_date,
    source.tms_date,
    source.pod_ac_shipping_date,
    source.lbc_tracking_number,
    source.tms_done_by,
    source.tms_done_by_name,
    source._trip_id,
    source._trip_stop_id,
    source._trip_type_id,
    source._warehouse_id,
    source._customer_id,
    source._store_id,
    source._truck_id,
    source._driver_id,
    source._trucking_company_id,
    source._assignment_id,
    source.transaction_dr_number,
    source.transaction_quantity,
    source.transaction_total_cbm,
    source.transaction_archived_at,
    source.transmittal_ref,
    source.transmittal_ref_version,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_type
            ELSE s.spreadsheet_issue_type
        END AS issue_report_type,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_reason
            ELSE s.spreadsheet_issue_reason
        END AS issue_reason,
    c.total_cbm AS trip_total_cbm,
    a.assigned_cbm,
    c.remaining_cbm AS remaining_unassigned_cbm,
    a.capacity_cbm AS truck_capacity_cbm,
        CASE
            WHEN (a.capacity_cbm > (0)::numeric) THEN ((a.assigned_cbm / a.capacity_cbm) * (100)::numeric)
            ELSE NULL::numeric
        END AS capacity_utilization
   FROM ((((( WITH active_convoy_assignments AS (
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
                    assignment.updated_at,
                    assignment.stop_scope
                   FROM trip_truck_assignments assignment
                  WHERE (assignment.unassigned_at IS NULL)
                )
         SELECT t_1.id AS trip_id,
                CASE
                    WHEN (trip_stops.id IS NULL) THEN t_1.dispatch_number
                    ELSE trip_stops.dispatch_number
                END AS dispatch_number,
            t_1.loading_date,
            warehouses.code AS warehouse_code,
            warehouses.name AS warehouse_name,
            trucks.plate_number,
            concat_ws(' '::text, drivers.first_name, drivers.last_name) AS driver_name,
            trucking_companies.name AS trucking_company,
            t_1.status AS trip_status,
            trip_stops.stop_sequence,
            customers.name AS customer_name,
            customer_stores.name AS store_name,
            trip_stops.delivery_status,
            trip_stops.arrival_time,
            trip_stops.start_unloading_time,
            trip_stops.finish_unloading_time,
            trip_stops.departure_time,
            t_1.remarks,
                CASE
                    WHEN (trip_stops.id IS NULL) THEN t_1.transaction_number
                    ELSE trip_stops.transaction_number
                END AS transaction_number,
            t_1.trip_number,
            t_1.added_to_report,
            t_1.letter_status,
            t_1.truck_allocated_by,
            concat_ws(' '::text, allocated_by.first_name, allocated_by.last_name) AS truck_allocated_by_name,
            t_1.subcon_rate_manual,
            warehouse_departure.warehouse_departure_time,
            t_1.signed_dr_upload_date,
            t_1.transmittal_date,
            t_1.tms_date,
            t_1.pod_ac_shipping_date,
            t_1.lbc_tracking_number,
            t_1.tms_done_by,
            concat_ws(' '::text, tms_done.first_name, tms_done.last_name) AS tms_done_by_name,
            t_1.id AS _trip_id,
            trip_stops.id AS _trip_stop_id,
            trip_types.id AS _trip_type_id,
            t_1.warehouse_id AS _warehouse_id,
            trip_stops.customer_id AS _customer_id,
            trip_stops.store_id AS _store_id,
            tta.truck_id AS _truck_id,
            tta.driver_id AS _driver_id,
            tta.trucking_company_id AS _trucking_company_id,
            tta.id AS _assignment_id,
            trip_stops.dr_number AS transaction_dr_number,
            trip_stops.quantity AS transaction_quantity,
            trip_stops.total_cbm AS transaction_total_cbm,
            COALESCE(t_1.archived_at, trip_stops.archived_at) AS transaction_archived_at,
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
           FROM ((((((((((((trips t_1
             LEFT JOIN warehouses ON ((warehouses.id = t_1.warehouse_id)))
             LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = t_1.id)))
             LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
             LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
             LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
             LEFT JOIN trip_stops ON (((trip_stops.trip_id = t_1.id) AND ((tta.id IS NULL) OR (tta.stop_scope = 'ALL'::text) OR (EXISTS ( SELECT 1
                   FROM trip_assignment_stops responsibility
                  WHERE ((responsibility.assignment_id = tta.id) AND (responsibility.trip_stop_id = trip_stops.id))))))))
             LEFT JOIN customers ON ((customers.id = trip_stops.customer_id)))
             LEFT JOIN customer_stores ON ((customer_stores.id = trip_stops.store_id)))
             LEFT JOIN profiles allocated_by ON ((allocated_by.id = t_1.truck_allocated_by)))
             LEFT JOIN profiles tms_done ON ((tms_done.id = t_1.tms_done_by)))
             LEFT JOIN LATERAL ( SELECT min(trip_events.event_time) AS warehouse_departure_time
                   FROM trip_events
                  WHERE ((trip_events.trip_id = t_1.id) AND (trip_events.event_type = 'WAREHOUSE_DEPARTURE'::text))) warehouse_departure ON (true))
             LEFT JOIN trip_types ON ((trip_types.id = t_1.trip_type_id)))) source
     LEFT JOIN trips t ON ((t.id = source._trip_id)))
     LEFT JOIN trip_stops s ON ((s.id = source._trip_stop_id)))
     LEFT JOIN v_trip_cargo_totals c ON ((c.trip_id = source._trip_id)))
     LEFT JOIN v_trip_assignment_totals a ON ((a.assignment_id = source._assignment_id)))) old_projection;
CREATE OR REPLACE VIEW public.v_dispatch_report AS SELECT old_projection.*, NULL::text AS stop_dispatch_reference FROM ( SELECT source.dispatch_number,
    source.loading_date,
    source.estimated_delivery_date,
    source.delivery_status,
    source.wh_code,
    source.ship_from,
    source.ship_to,
    source.customer_name,
    source.plate_number,
    source.dr_number,
    source.sap_so_number,
    source.customer_po_number,
    source.internal_po_number,
    source.product_model,
    source.category,
    source.quantity,
    source.cbm,
    source.province,
    source.city,
    source.remarks,
    source.transaction_number,
    source.trip_number,
    source.added_to_report,
    source.letter_status,
    source.driver_name,
    source.trucking_company,
    source.subcon_rate_manual,
    source.arrival_time,
    source.start_unloading_time,
    source.finish_unloading_time,
    source.departure_time,
    source.customer_model,
    source.incident_date,
    source.ir_status,
    source.ir_submitted_date,
    source.backload_reason,
    source.backload_number_of_boxes,
    source.backload_comments,
    source.offload_number_of_boxes,
    source.offload_reason,
    source.offload_comments,
    source.signed_dr_upload_date,
    source.transmittal_date,
    source.tms_date,
    source.pod_ac_shipping_date,
    source.lbc_tracking_number,
    source.tms_done_by_name,
    source._trip_id,
    source._trip_stop_id,
    source._trip_line_item_id,
    source._product_id,
    source._warehouse_id,
    source._customer_id,
    source._store_id,
    source._truck_id,
    source._driver_id,
    source._trucking_company_id,
    source._assignment_id,
    source._tms_done_by,
    source._incident_id,
    source._backload_id,
    source._offload_id,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_type
            ELSE s.spreadsheet_issue_type
        END AS issue_report_type,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_reason
            ELSE s.spreadsheet_issue_reason
        END AS issue_reason,
    c.total_cbm AS trip_total_cbm,
    a.assigned_cbm,
    c.remaining_cbm AS remaining_unassigned_cbm,
    a.capacity_cbm AS truck_capacity_cbm,
        CASE
            WHEN (a.capacity_cbm > (0)::numeric) THEN ((a.assigned_cbm / a.capacity_cbm) * (100)::numeric)
            ELSE NULL::numeric
        END AS capacity_utilization
   FROM ((((( WITH dispatch_scopes AS (
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
                    assignment.updated_at,
                    assignment.stop_scope
                   FROM trip_truck_assignments assignment
                  WHERE (assignment.unassigned_at IS NULL)
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
             LEFT JOIN active_convoy_assignments tta ON (((tta.trip_id = trips.id) AND ((dispatch_scopes.trip_stop_id IS NULL) OR (tta.stop_scope = 'ALL'::text) OR (EXISTS ( SELECT 1
                   FROM trip_assignment_stops responsibility
                  WHERE ((responsibility.assignment_id = tta.id) AND (responsibility.trip_stop_id = dispatch_scopes.trip_stop_id))))))))
             LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
             LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
             LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
             LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
             LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)))) source
     LEFT JOIN trips t ON ((t.id = source._trip_id)))
     LEFT JOIN trip_stops s ON ((s.id = source._trip_stop_id)))
     LEFT JOIN v_trip_cargo_totals c ON ((c.trip_id = source._trip_id)))
     LEFT JOIN v_trip_assignment_totals a ON ((a.assignment_id = source._assignment_id)))) old_projection;
CREATE OR REPLACE VIEW public.v_tms_combined AS SELECT old_projection.*, NULL::text AS stop_dispatch_reference FROM ( SELECT source.trip_id,
    source.dispatch_number,
    source.loading_date,
    source.estimated_delivery_date,
    source.trip_status,
    source.trip_type,
    source.warehouse_code,
    source.warehouse_name,
    source.trucking_company,
    source.plate_number,
    source.driver_name,
    source.trip_stop_id,
    source.stop_sequence,
    source.customer_id,
    source.customer_name,
    source.store_id,
    source.store_name,
    source.province,
    source.city,
    source.delivery_status,
    source.arrival_time,
    source.start_unloading_time,
    source.finish_unloading_time,
    source.departure_time,
    source.sku,
    source.model_code,
    source.product_name,
    source.category,
    source.quantity,
    source.cbm,
    source.dr_number,
    source.sap_so_number,
    source.customer_po_number,
    source.internal_po_number,
    source.customer_model,
    source.trip_remarks,
    source.stop_remarks,
    source.item_remarks,
    source.transaction_number,
    source.trip_number,
    source.added_to_report,
    source.letter_status,
    source.truck_allocated_by,
    source.truck_allocated_by_name,
    source.subcon_rate_manual,
    source.warehouse_departure_time,
    source.signed_dr_upload_date,
    source.transmittal_date,
    source.tms_date,
    source.tms_done_by,
    source.tms_done_by_name,
    source.pod_ac_shipping_date,
    source.lbc_tracking_number,
    source.trip_line_item_id,
    source._trip_id,
    source._trip_stop_id,
    source._trip_line_item_id,
    source._trip_type_id,
    source._warehouse_id,
    source._customer_id,
    source._store_id,
    source._truck_id,
    source._driver_id,
    source._trucking_company_id,
    source._product_id,
    source._assignment_id,
    source._truck_allocated_by,
    source._tms_done_by,
    source.transaction_dr_number,
    source.transaction_quantity,
    source.transaction_total_cbm,
    source.transaction_archived_at,
    source.transmittal_ref,
    source.transmittal_ref_version,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_type
            ELSE s.spreadsheet_issue_type
        END AS issue_report_type,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_reason
            ELSE s.spreadsheet_issue_reason
        END AS issue_reason,
    c.total_cbm AS trip_total_cbm,
    a.assigned_cbm,
    c.remaining_cbm AS remaining_unassigned_cbm,
    a.capacity_cbm AS truck_capacity_cbm,
        CASE
            WHEN (a.capacity_cbm > (0)::numeric) THEN ((a.assigned_cbm / a.capacity_cbm) * (100)::numeric)
            ELSE NULL::numeric
        END AS capacity_utilization
   FROM ((((( WITH active_convoy_assignments AS (
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
                    assignment.updated_at,
                    assignment.stop_scope
                   FROM trip_truck_assignments assignment
                  WHERE (assignment.unassigned_at IS NULL)
                )
         SELECT t_1.id AS trip_id,
                CASE
                    WHEN (ts.id IS NULL) THEN t_1.dispatch_number
                    ELSE ts.dispatch_number
                END AS dispatch_number,
            t_1.loading_date,
            t_1.estimated_delivery_date,
            t_1.status AS trip_status,
            tt.name AS trip_type,
            w.code AS warehouse_code,
            w.name AS warehouse_name,
            tc.name AS trucking_company,
            tr.plate_number,
            concat_ws(' '::text, d.first_name, d.last_name) AS driver_name,
            ts.id AS trip_stop_id,
            ts.stop_sequence,
            c_1.id AS customer_id,
            c_1.name AS customer_name,
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
            t_1.remarks AS trip_remarks,
            ts.remarks AS stop_remarks,
            li.remarks AS item_remarks,
                CASE
                    WHEN (ts.id IS NULL) THEN t_1.transaction_number
                    ELSE ts.transaction_number
                END AS transaction_number,
            t_1.trip_number,
            t_1.added_to_report,
            t_1.letter_status,
            t_1.truck_allocated_by,
            concat_ws(' '::text, allocated_by.first_name, allocated_by.last_name) AS truck_allocated_by_name,
            t_1.subcon_rate_manual,
            wh_departure.warehouse_departure_time,
            t_1.signed_dr_upload_date,
            t_1.transmittal_date,
            t_1.tms_date,
            t_1.tms_done_by,
            concat_ws(' '::text, tms_done.first_name, tms_done.last_name) AS tms_done_by_name,
            t_1.pod_ac_shipping_date,
            t_1.lbc_tracking_number,
            li.id AS trip_line_item_id,
            t_1.id AS _trip_id,
            ts.id AS _trip_stop_id,
            li.id AS _trip_line_item_id,
            tt.id AS _trip_type_id,
            t_1.warehouse_id AS _warehouse_id,
            ts.customer_id AS _customer_id,
            ts.store_id AS _store_id,
            tta.truck_id AS _truck_id,
            tta.driver_id AS _driver_id,
            tta.trucking_company_id AS _trucking_company_id,
            li.product_id AS _product_id,
            tta.id AS _assignment_id,
            t_1.truck_allocated_by AS _truck_allocated_by,
            t_1.tms_done_by AS _tms_done_by,
            ts.dr_number AS transaction_dr_number,
            ts.quantity AS transaction_quantity,
            ts.total_cbm AS transaction_total_cbm,
            COALESCE(t_1.archived_at, ts.archived_at) AS transaction_archived_at,
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
           FROM ((((((((((((((trips t_1
             LEFT JOIN trip_types tt ON ((tt.id = t_1.trip_type_id)))
             LEFT JOIN warehouses w ON ((w.id = t_1.warehouse_id)))
             LEFT JOIN active_convoy_assignments tta ON ((tta.trip_id = t_1.id)))
             LEFT JOIN trucks tr ON ((tr.id = tta.truck_id)))
             LEFT JOIN trucking_companies tc ON ((tc.id = tta.trucking_company_id)))
             LEFT JOIN drivers d ON ((d.id = tta.driver_id)))
             LEFT JOIN trip_stops ts ON ((ts.trip_id = t_1.id)))
             LEFT JOIN customers c_1 ON ((c_1.id = ts.customer_id)))
             LEFT JOIN customer_stores cs ON ((cs.id = ts.store_id)))
             LEFT JOIN trip_line_items li ON (((li.trip_stop_id = ts.id) AND (li.trip_id = t_1.id))))
             LEFT JOIN products p ON ((p.id = li.product_id)))
             LEFT JOIN profiles allocated_by ON ((allocated_by.id = t_1.truck_allocated_by)))
             LEFT JOIN profiles tms_done ON ((tms_done.id = t_1.tms_done_by)))
             LEFT JOIN ( SELECT trip_events.trip_id,
                    min(trip_events.event_time) AS warehouse_departure_time
                   FROM trip_events
                  WHERE (trip_events.event_type = 'WAREHOUSE_DEPARTURE'::text)
                  GROUP BY trip_events.trip_id) wh_departure ON ((wh_departure.trip_id = t_1.id)))) source
     LEFT JOIN trips t ON ((t.id = source._trip_id)))
     LEFT JOIN trip_stops s ON ((s.id = source._trip_stop_id)))
     LEFT JOIN v_trip_cargo_totals c ON ((c.trip_id = source._trip_id)))
     LEFT JOIN v_trip_assignment_totals a ON ((a.assignment_id = source._assignment_id)))) old_projection;
CREATE OR REPLACE VIEW public.v_transmittal_tracker_page AS SELECT old_projection.*, NULL::uuid AS assignment_id, NULL::text AS assigned_plate_number FROM ( WITH unique_primary AS (
         SELECT a_1.id,
            a_1.trip_id,
            a_1.truck_id,
            a_1.driver_id,
            a_1.trucking_company_id,
            a_1.assignment_type,
            a_1.assigned_at,
            a_1.unassigned_at,
            a_1.remarks,
            a_1.created_at,
            a_1.updated_at
           FROM trip_truck_assignments a_1
          WHERE ((a_1.assignment_type = 'PRIMARY'::text) AND (a_1.unassigned_at IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM trip_truck_assignments b
                  WHERE ((b.trip_id = a_1.trip_id) AND (b.assignment_type = 'PRIMARY'::text) AND (b.unassigned_at IS NULL) AND (b.id <> a_1.id))))))
        ), tracker_rows AS (
         SELECT s_1.id AS stop_id,
            ( SELECT fr.id
                   FROM (flex_rows fr
                     JOIN flex_tables ft ON ((ft.id = fr.table_id)))
                  WHERE (((ft.settings ->> 'system_key'::text) = 'alzhen_transmittal_tracker_v1'::text) AND (ft.archived_at IS NULL) AND (fr.row_kind = 'SOURCE'::text) AND (fr.source_entity_type = 'STOP'::text) AND (fr.archived_at IS NULL) AND (fr.source_entity_id = s_1.id))) AS source_row_id
           FROM trip_stops s_1
        )
 SELECT s.id AS trip_stop_id,
    s.trip_id,
    s.stop_sequence,
    COALESCE(s.dr_number, tracker_page_text_v1((c.value -> 'delivery_receipt_no_override'::text), COALESCE(li.single_dr, ''::text))) AS delivery_receipt_no,
    TRIM(BOTH FROM concat_ws(' '::text, NULLIF(d.first_name, ''::text), NULLIF(d.last_name, ''::text))) AS driver_name,
    tracker_page_text_v1((c.value -> 'transmittal_ref'::text), ''::text) AS transmittal_ref,
    tracker_page_text_v1((c.value -> 'warehouse_code_override'::text), COALESCE(TRIM(BOTH FROM w.code), ''::text)) AS warehouse_code,
    tracker_page_text_v1((c.value -> 'delivered_to_override'::text), COALESCE(NULLIF(st.name, ''::text), cu.name, ''::text)) AS delivered_to,
    tracker_page_text_v1((c.value -> 'plate_number_override'::text), COALESCE(TRIM(BOTH FROM tr.plate_number), ''::text)) AS plate_number,
    tracker_page_text_v1((c.value -> 'sales_order_no_override'::text), COALESCE(li.sales_orders, ''::text)) AS sales_order_no,
    tracker_page_text_v1((c.value -> 'date_created_override'::text), ''::text) AS date_created,
    tracker_page_text_v1((c.value -> 'tracker_status'::text), COALESCE(TRIM(BOTH FROM s.delivery_status), ''::text)) AS status,
    tracker_page_text_v1((c.value -> 'lbc_waybill_no'::text), COALESCE(TRIM(BOTH FROM t.lbc_tracking_number), ''::text)) AS lbc_waybill_no,
    tracker_page_text_v1((c.value -> 'lbc_shipping_date'::text), COALESCE("left"((t.pod_ac_shipping_date)::text, 10), ''::text)) AS shipping_date_via_lbc,
    tracker_page_text_v1((c.value -> 'tracker_remarks'::text), ''::text) AS remarks,
    tracker_page_text_v1((c.value -> 'loading_date_override'::text), COALESCE("left"((t.loading_date)::text, 10), ''::text)) AS loading_date,
    tracker_page_text_v1((c.value -> 'delivery_date_override'::text), COALESCE("left"((s.finish_unloading_time)::text, 10), ''::text)) AS date_delivered
   FROM ((((((((((trip_stops s
     JOIN trips t ON ((t.id = s.trip_id)))
     JOIN tracker_rows r ON ((r.stop_id = s.id)))
     LEFT JOIN warehouses w ON ((w.id = t.warehouse_id)))
     LEFT JOIN customer_stores st ON ((st.id = s.store_id)))
     LEFT JOIN customers cu ON ((cu.id = s.customer_id)))
     LEFT JOIN unique_primary a ON ((a.trip_id = s.trip_id)))
     LEFT JOIN trucks tr ON ((tr.id = a.truck_id)))
     LEFT JOIN drivers d ON ((d.id = a.driver_id)))
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT NULLIF(TRIM(BOTH FROM i.sap_so_number), ''::text), ', '::text ORDER BY NULLIF(TRIM(BOTH FROM i.sap_so_number), ''::text)) AS sales_orders,
                CASE
                    WHEN (count(DISTINCT NULLIF(TRIM(BOTH FROM i.dr_number), ''::text)) = 1) THEN min(NULLIF(TRIM(BOTH FROM i.dr_number), ''::text))
                    ELSE NULL::text
                END AS single_dr
           FROM trip_line_items i
          WHERE ((i.trip_stop_id = s.id) AND (i.trip_id = s.trip_id))) li ON (true))
     LEFT JOIN LATERAL ( SELECT tracker_page_cells_v1(jsonb_object_agg((co.settings ->> 'system_key'::text), ce.value) FILTER (WHERE ((co.settings ->> 'system_key'::text) IS NOT NULL)), count(*) FILTER (WHERE ((co.settings ->> 'system_key'::text) IS NOT NULL)), count(DISTINCT (co.settings ->> 'system_key'::text))) AS value
           FROM (flex_cells ce
             JOIN flex_columns co ON ((co.id = ce.column_id)))
          WHERE ((ce.row_id = r.source_row_id) AND (co.table_id = ( SELECT flex_rows.table_id
                   FROM flex_rows
                  WHERE (flex_rows.id = r.source_row_id))) AND (co.binding_scope = 'STOP'::text) AND (NOT co.is_archived))) c ON (true))
  WHERE ((r.source_row_id IS NOT NULL) OR (upper(TRIM(BOTH FROM s.delivery_status)) = ANY (ARRAY['COMPLETED'::text, 'COMPLETE'::text, 'DELIVERED'::text])))) old_projection;
CREATE OR REPLACE VIEW public.v_trip_booking AS SELECT old_projection.*, NULL::text AS stop_dispatch_reference FROM ( SELECT source.dispatch_number,
    source.loading_date,
    source.estimated_delivery_date,
    source.trip_type,
    source.warehouse_code,
    source.warehouse_name,
    source.stop_sequence,
    source.customer_name,
    source.store_name,
    source.plate_number,
    source.driver_name,
    source.trucking_company,
    source.dr_number,
    source.sap_so_number,
    source.customer_po_number,
    source.internal_po_number,
    source.sku,
    source.model_code,
    source.product_name,
    source.quantity,
    source.cbm,
    source.trip_status,
    source.delivery_status,
    source.remarks,
    source.transaction_number,
    source.trip_number,
    source.added_to_report,
    source.letter_status,
    source.truck_allocated_by,
    source.truck_allocated_by_name,
    source.product_category,
    source.customer_model,
    source.subcon_rate_manual,
    source.signed_dr_upload_date,
    source.transmittal_date,
    source.tms_date,
    source.tms_done_by,
    source.tms_done_by_name,
    source.pod_ac_shipping_date,
    source.lbc_tracking_number,
    source.invoice_number,
    source._trip_id,
    source._trip_stop_id,
    source._trip_line_item_id,
    source._product_id,
    source._trip_type_id,
    source._warehouse_id,
    source._customer_id,
    source._store_id,
    source._truck_id,
    source._driver_id,
    source._trucking_company_id,
    source._assignment_id,
    source._truck_allocated_by,
    source._tms_done_by,
    source._billing_id,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_type
            ELSE s.spreadsheet_issue_type
        END AS issue_report_type,
        CASE
            WHEN (source._trip_stop_id IS NULL) THEN t.spreadsheet_issue_reason
            ELSE s.spreadsheet_issue_reason
        END AS issue_reason,
    c.total_cbm AS trip_total_cbm,
    a.assigned_cbm,
    c.remaining_cbm AS remaining_unassigned_cbm,
    a.capacity_cbm AS truck_capacity_cbm,
        CASE
            WHEN (a.capacity_cbm > (0)::numeric) THEN ((a.assigned_cbm / a.capacity_cbm) * (100)::numeric)
            ELSE NULL::numeric
        END AS capacity_utilization
   FROM ((((( WITH trip_booking_scopes AS (
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
                    assignment.updated_at,
                    assignment.stop_scope
                   FROM trip_truck_assignments assignment
                  WHERE (assignment.unassigned_at IS NULL)
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
             LEFT JOIN active_convoy_assignments tta ON (((tta.trip_id = trips.id) AND ((trip_booking_scopes.trip_stop_id IS NULL) OR (tta.stop_scope = 'ALL'::text) OR (EXISTS ( SELECT 1
                   FROM trip_assignment_stops responsibility
                  WHERE ((responsibility.assignment_id = tta.id) AND (responsibility.trip_stop_id = trip_booking_scopes.trip_stop_id))))) AND (trip_booking_scopes.billing_id IS NULL))))
             LEFT JOIN trucks ON ((trucks.id = tta.truck_id)))
             LEFT JOIN drivers ON ((drivers.id = tta.driver_id)))
             LEFT JOIN trucking_companies ON ((trucking_companies.id = tta.trucking_company_id)))
             LEFT JOIN profiles ON ((profiles.id = drivers.profile_id)))
             LEFT JOIN profiles profiles_allocated ON ((profiles_allocated.id = trips.truck_allocated_by)))
             LEFT JOIN profiles profiles_tms ON ((profiles_tms.id = trips.tms_done_by)))
             LEFT JOIN billings ON (((billings.id = trip_booking_scopes.billing_id) AND (billings.trip_id = trips.id))))) source
     LEFT JOIN trips t ON ((t.id = source._trip_id)))
     LEFT JOIN trip_stops s ON ((s.id = source._trip_stop_id)))
     LEFT JOIN v_trip_cargo_totals c ON ((c.trip_id = source._trip_id)))
     LEFT JOIN v_trip_assignment_totals a ON ((a.assignment_id = source._assignment_id)))) old_projection;
CREATE OR REPLACE VIEW public.vw_store_calling_tracker AS SELECT old_projection.*, NULL::uuid AS assignment_id, NULL::text AS stop_dispatch_reference FROM ( WITH unique_active_primary_assignments AS (
         SELECT a.id,
            a.trip_id,
            a.truck_id,
            a.driver_id,
            a.trucking_company_id,
            a.assignment_type,
            a.assigned_at,
            a.unassigned_at,
            a.remarks,
            a.created_at,
            a.updated_at
           FROM trip_truck_assignments a
          WHERE ((a.assignment_type = 'PRIMARY'::text) AND (a.unassigned_at IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM trip_truck_assignments b
                  WHERE ((b.trip_id = a.trip_id) AND (b.assignment_type = 'PRIMARY'::text) AND (b.unassigned_at IS NULL) AND (b.id <> a.id))))))
        )
 SELECT sc.id AS store_call_id,
    t.id AS trip_id,
        CASE
            WHEN (sc.trip_stop_id IS NULL) THEN t.dispatch_number
            ELSE ts.dispatch_number
        END AS dispatch_number,
        CASE
            WHEN (sc.trip_stop_id IS NULL) THEN t.transaction_number
            ELSE ts.transaction_number
        END AS transaction_number,
    t.trip_number,
    tt.id AS trip_type_id,
    tt.code AS trip_type_code,
    tt.name AS trip_type,
    w.id AS warehouse_id,
    w.code AS warehouse_code,
    w.name AS ship_from,
    ts.id AS trip_stop_id,
    ts.stop_sequence,
    cs.id AS store_id,
    cs.name AS ship_to,
    cs.code AS store_code,
    c.id AS customer_id,
    c.name AS customer_name,
    cs.province,
    cs.city,
    cs.region,
    d.id AS driver_id,
    TRIM(BOTH FROM concat(COALESCE(d.first_name, ''::text), ' ', COALESCE(d.last_name, ''::text))) AS driver_name,
    tr.id AS truck_id,
    tr.plate_number,
    tc.id AS trucking_company_id,
    tc.name AS trucker_gc_name,
    sc.assigned_to AS assigned_to_id,
    TRIM(BOTH FROM concat(COALESCE(ap.first_name, ''::text), ' ', COALESCE(ap.last_name, ''::text))) AS assigned_to_name,
    sc.contact_id,
    COALESCE(sc.contact_name, scon.name) AS contact_name,
    COALESCE(sc.contact_number, scon.phone) AS contact_number,
    scon.email AS contact_email,
    scon."position" AS contact_position,
    sc.date_assigned,
    sc.date_of_contact,
    sc.time_texted,
    sc.time_called,
        CASE
            WHEN (sc.time_called IS NOT NULL) THEN sc.time_called
            WHEN (sc.time_texted IS NOT NULL) THEN sc.time_texted
            ELSE NULL::timestamp with time zone
        END AS time_contacted,
    sc.status AS contact_status,
    sc.confirmation_status,
    sc.remarks,
    ts.delivery_status,
    sc.created_at,
    sc.updated_at
   FROM ((((((((((((store_calls sc
     LEFT JOIN trips t ON ((t.id = sc.trip_id)))
     LEFT JOIN trip_types tt ON ((tt.id = t.trip_type_id)))
     LEFT JOIN warehouses w ON ((w.id = t.warehouse_id)))
     LEFT JOIN trip_stops ts ON (((ts.id = sc.trip_stop_id) AND ((sc.trip_id IS NULL) OR (ts.trip_id = sc.trip_id)))))
     LEFT JOIN customer_stores cs ON ((cs.id = ts.store_id)))
     LEFT JOIN customers c ON ((c.id = ts.customer_id)))
     LEFT JOIN profiles ap ON ((ap.id = sc.assigned_to)))
     LEFT JOIN store_contacts scon ON ((scon.id = sc.contact_id)))
     LEFT JOIN unique_active_primary_assignments tta ON ((tta.trip_id = t.id)))
     LEFT JOIN drivers d ON ((d.id = tta.driver_id)))
     LEFT JOIN trucks tr ON ((tr.id = tta.truck_id)))
     LEFT JOIN trucking_companies tc ON ((tc.id = COALESCE(tta.trucking_company_id, tr.trucking_company_id, d.trucking_company_id))))) old_projection;
COMMIT;
