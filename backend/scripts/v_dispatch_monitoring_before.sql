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