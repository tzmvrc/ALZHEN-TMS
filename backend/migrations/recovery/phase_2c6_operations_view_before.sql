-- Captured read-only before Phase 2C.6; schema recovery only, not a data backup.
-- Restore only with operator authorization. No table data is changed.
BEGIN;
CREATE OR REPLACE VIEW public.v_operations_report_page AS
WITH sources AS (
         SELECT 'LOADING'::text AS source_type,
            loading_reports.id AS source_record_id,
            loading_reports.trip_id,
            NULL::uuid AS trip_stop_id,
            loading_reports.event_type,
            NULL::timestamp with time zone AS event_date,
            NULL::text AS reason,
            NULL::numeric AS number_of_boxes,
            NULL::text AS comments,
            NULL::uuid AS reporter_id
           FROM loading_reports
        UNION ALL
         SELECT 'UNLOADING'::text,
            unloading_reports.id,
            unloading_reports.trip_id,
            unloading_reports.trip_stop_id,
            unloading_reports.event_type,
            NULL::timestamp with time zone,
            NULL::text,
            NULL::numeric,
            NULL::text,
            NULL::uuid
           FROM unloading_reports
        UNION ALL
         SELECT 'BACKLOAD'::text,
            backloads.id,
            backloads.trip_id,
            backloads.trip_stop_id,
            backloads.event_type,
            NULL::timestamp with time zone,
            backloads.reason,
            backloads.number_of_boxes,
            backloads.comments,
            NULL::uuid
           FROM backloads
        UNION ALL
         SELECT 'OFFLOAD'::text,
            offloads.id,
            offloads.trip_id,
            offloads.trip_stop_id,
            offloads.event_type,
            COALESCE(offloads.reported_at, (offloads.report_date::timestamp without time zone AT TIME ZONE 'Asia/Manila'::text), offloads.created_at) AS "coalesce",
            offloads.reason,
            offloads.number_of_boxes,
            offloads.comments,
            COALESCE(offloads.created_by, offloads.submitted_by) AS "coalesce"
           FROM offloads
        ), unique_primary AS (
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
            a.updated_at,
            a.collaboration_version
           FROM trip_truck_assignments a
          WHERE a.assignment_type = 'PRIMARY'::text AND a.unassigned_at IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM trip_truck_assignments b
                  WHERE b.trip_id = a.trip_id AND b.assignment_type = 'PRIMARY'::text AND b.unassigned_at IS NULL AND b.id <> a.id))
        ), projected AS (
         SELECT t.trip_number,
            r.source_type,
            r.source_record_id,
            r.trip_id,
            r.trip_stop_id,
            r.event_type AS report_type,
                CASE
                    WHEN r.source_type = 'UNLOADING'::text THEN s.finish_unloading_time
                    ELSE r.event_date
                END AS date,
            COALESCE(
                CASE
                    WHEN r.trip_stop_id IS NULL THEN t.dispatch_number
                    ELSE s.dispatch_number
                END, t.trip_number::text) AS trip,
            truck.plate_number,
            NULLIF(COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' '::text, d.first_name, d.last_name)), ''::text), TRIM(BOTH FROM concat_ws(' '::text, dp.first_name, dp.last_name))), ''::text) AS driver_name,
            route.value ||
                CASE
                    WHEN s.stop_sequence IS NOT NULL THEN ' · Stop '::text || s.stop_sequence::text
                    ELSE ''::text
                END AS route,
                CASE
                    WHEN r.source_type = 'OFFLOAD'::text THEN COALESCE(NULLIF(TRIM(BOTH FROM s.dr_number), ''::text), oi.dr_number)
                    ELSE li.dr_number
                END AS dr_number,
                CASE
                    WHEN r.source_type = 'OFFLOAD'::text THEN oi.quantity
                    WHEN r.source_type = 'BACKLOAD'::text THEN r.number_of_boxes
                    ELSE li.quantity
                END AS quantity,
                CASE
                    WHEN r.source_type = 'OFFLOAD'::text THEN oi.total_cbm
                    WHEN r.source_type = 'BACKLOAD'::text THEN NULL::numeric
                    ELSE li.cbm
                END AS total_cbm,
                CASE
                    WHEN r.source_type = 'LOADING'::text THEN t.remarks
                    WHEN r.source_type = 'UNLOADING'::text THEN s.remarks
                    WHEN r.source_type = 'BACKLOAD'::text THEN COALESCE(r.comments, r.reason)
                    ELSE r.comments
                END AS remarks,
            NULLIF(TRIM(BOTH FROM concat_ws(' '::text, rp.first_name, rp.last_name)), ''::text) AS reported_by,
            r.reason,
            r.comments,
            r.number_of_boxes
           FROM sources r
             JOIN trips t ON t.id = r.trip_id
             LEFT JOIN trip_stops s ON s.id = r.trip_stop_id AND s.trip_id = r.trip_id
             LEFT JOIN unique_primary a ON a.trip_id = t.id
             LEFT JOIN trucks truck ON truck.id = a.truck_id
             LEFT JOIN drivers d ON d.id = a.driver_id
             LEFT JOIN profiles dp ON dp.id = d.profile_id
             LEFT JOIN profiles rp ON rp.id = r.reporter_id
             LEFT JOIN LATERAL ( SELECT sum(l.quantity) AS quantity,
                    sum(l.cbm) AS cbm,
                    string_agg(DISTINCT NULLIF(TRIM(BOTH FROM l.dr_number), ''::text), ', '::text ORDER BY (NULLIF(TRIM(BOTH FROM l.dr_number), ''::text))) AS dr_number
                   FROM trip_line_items l
                  WHERE l.trip_id = r.trip_id AND (r.trip_stop_id IS NULL OR s.id IS NOT NULL AND l.trip_stop_id = s.id)) li ON true
             LEFT JOIN LATERAL ( SELECT sum(i.quantity) AS quantity,
                    sum(i.total_cbm) AS total_cbm,
                    string_agg(DISTINCT NULLIF(TRIM(BOTH FROM i.dr_number), ''::text), ', '::text ORDER BY (NULLIF(TRIM(BOTH FROM i.dr_number), ''::text))) AS dr_number
                   FROM offload_items i
                  WHERE r.source_type = 'OFFLOAD'::text AND i.offload_id = r.source_record_id) oi ON true
             LEFT JOIN LATERAL ( SELECT COALESCE(NULLIF(TRIM(BOTH FROM w.name), ''::text), 'Warehouse not set'::text) || COALESCE(' → '::text || string_agg(COALESCE(NULLIF(TRIM(BOTH FROM cs.name), ''::text), NULLIF(TRIM(BOTH FROM c.name), ''::text), 'Stop '::text || COALESCE(rs.stop_sequence::text, '(sequence unavailable)'::text)), ' → '::text ORDER BY rs.stop_sequence, rs.id), ''::text) AS value
                   FROM trip_stops rs
                     LEFT JOIN customer_stores cs ON cs.id = rs.store_id
                     LEFT JOIN customers c ON c.id = rs.customer_id
                     RIGHT JOIN ( SELECT wh.name
                           FROM ( VALUES (1)) seed(n)
                             LEFT JOIN warehouses wh ON wh.id = t.warehouse_id) w ON rs.trip_id = t.id
                  GROUP BY w.name) route ON true
          WHERE NOT (EXISTS ( SELECT 1
                   FROM operations_report_conversions cv
                  WHERE cv.source_type = r.source_type AND cv.source_id = r.source_record_id))
        )
 SELECT trip_number,
    source_type,
    source_record_id,
    trip_id,
    trip_stop_id,
    report_type,
    date,
    trip,
    plate_number,
    driver_name,
    route,
    dr_number,
    quantity,
    total_cbm,
    remarks,
    reported_by,
    reason,
    comments,
    number_of_boxes,
    operations_natural_sort_v1(trip) AS trip_sort,
    operations_natural_sort_v1(plate_number) AS plate_number_sort,
    operations_natural_sort_v1(driver_name) AS driver_name_sort,
    operations_natural_sort_v1(route) AS route_sort,
    operations_natural_sort_v1(dr_number) AS dr_number_sort,
    operations_natural_sort_v1(report_type) AS report_type_sort,
    operations_natural_sort_v1(remarks) AS remarks_sort,
    operations_natural_sort_v1(reported_by) AS reported_by_sort,
    concat_ws(' '::text, trip_number::text, trip, plate_number, driver_name, route, dr_number, quantity::text, total_cbm::text, report_type, remarks, reported_by, reason, comments, number_of_boxes::text) AS search_text
   FROM projected p;
COMMIT;
