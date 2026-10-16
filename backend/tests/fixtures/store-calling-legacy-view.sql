-- Captured live definition before the proposed fix. NEW disposable database only.
CREATE OR REPLACE VIEW public.vw_store_calling_tracker AS
SELECT sc.id AS store_call_id,
    t.id AS trip_id,
    t.dispatch_number,
    t.transaction_number,
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
            WHEN sc.time_called IS NOT NULL THEN sc.time_called
            WHEN sc.time_texted IS NOT NULL THEN sc.time_texted
            ELSE NULL::timestamp with time zone
        END AS time_contacted,
    sc.status AS contact_status,
    sc.confirmation_status,
    sc.remarks,
    ts.delivery_status,
    sc.created_at,
    sc.updated_at
   FROM store_calls sc
     LEFT JOIN trips t ON t.id = sc.trip_id
     LEFT JOIN trip_types tt ON tt.id = t.trip_type_id
     LEFT JOIN warehouses w ON w.id = t.warehouse_id
     LEFT JOIN trip_stops ts ON ts.id = sc.trip_stop_id
     LEFT JOIN customer_stores cs ON cs.id = ts.store_id
     LEFT JOIN customers c ON c.id = ts.customer_id
     LEFT JOIN profiles ap ON ap.id = sc.assigned_to
     LEFT JOIN store_contacts scon ON scon.id = sc.contact_id
     LEFT JOIN trip_truck_assignments tta ON tta.trip_id = t.id AND tta.unassigned_at IS NULL
     LEFT JOIN drivers d ON d.id = tta.driver_id
     LEFT JOIN trucks tr ON tr.id = tta.truck_id
     LEFT JOIN trucking_companies tc ON tc.id = COALESCE(tta.trucking_company_id, tr.trucking_company_id, d.trucking_company_id);
