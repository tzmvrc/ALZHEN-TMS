 WITH unique_primary AS (
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
  WHERE ((r.source_row_id IS NOT NULL) OR (upper(TRIM(BOTH FROM s.delivery_status)) = ANY (ARRAY['COMPLETED'::text, 'COMPLETE'::text, 'DELIVERED'::text])));