 SELECT sc.id AS store_call_id,
        CASE
            WHEN (sc.trip_stop_id IS NULL) THEN t.dispatch_number
            ELSE ts.dispatch_number
        END AS dispatch_number,
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
     LEFT JOIN trip_truck_assignments tta ON (((tta.trip_id = t.id) AND (tta.assignment_type = 'PRIMARY'::text) AND (tta.unassigned_at IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM trip_truck_assignments other
          WHERE ((other.trip_id = tta.trip_id) AND (other.assignment_type = 'PRIMARY'::text) AND (other.unassigned_at IS NULL) AND (other.id <> tta.id))))))))
     LEFT JOIN trucks tr ON ((tr.id = tta.truck_id)))
     LEFT JOIN drivers d ON ((d.id = tta.driver_id)))
     LEFT JOIN trucking_companies tc ON ((tc.id = tta.trucking_company_id)))
     LEFT JOIN profiles assigned ON ((assigned.id = sc.assigned_to)));