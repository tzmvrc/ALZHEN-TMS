-- Approved by the user for execution on 2026-10-24.
-- Inspected public-schema metadata: 2026-10-24. No schema changes.
-- Exactly one isolated demo graph. No UPDATE, UPSERT, auth user, login, consent,
-- tracking session, trip_tracking_locations row, or fabricated route cache.
-- Normal FK, uniqueness, convoy capacity, history and Realtime triggers stay enabled.
-- Coordinates reuse the existing Mapbox-generated Metro Manila road fixture.
-- DEMO receiving points near the named malls are fictional business locations.
-- Seed ownership: [ALZHEN_HOME_DEMO_V1], UUID prefix d0241024-0000-4000-8000-.
-- Existing operational records are never overwritten. Rerun fails and rolls back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $demo$
DECLARE
  tag constant text := '[ALZHEN_HOME_DEMO_V1]';
  reviewer constant uuid := '8eaf7847-e806-493d-8338-ac0412153245';
  sample_time timestamptz := clock_timestamp();
  started timestamptz := sample_time - interval '4 hours';
  delivery_day date := (sample_time AT TIME ZONE 'Asia/Manila')::date + 1;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_HOME_DEMO_V1'));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN') THEN
    RAISE EXCEPTION 'Approved coordinate reviewer is not an existing Admin.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-HOME-20261024') THEN
    RAISE EXCEPTION 'Demo dispatch already exists. No records were changed.';
  END IF;
  IF EXISTS (
    SELECT id FROM public.customers WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trucking_companies WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trucks WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.drivers WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.warehouses WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.customer_stores WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.products WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_types WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trips WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_truck_assignments WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_stops WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_line_items WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_cargo_allocations WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_assignment_stops WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
    UNION ALL SELECT id FROM public.trip_events WHERE id::text LIKE 'd0241024-0000-4000-8000-%'
  ) THEN RAISE EXCEPTION 'Reserved demo UUID namespace is occupied. Review before retrying.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tms_dropdown_options WHERE field_key='trip_status' AND option_value='IN_PROGRESS' AND active) THEN
    RAISE EXCEPTION 'The existing IN_PROGRESS trip status is not active. Do not invent or change status options.';
  END IF;

  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-HOME-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-HOME-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000003','DEMO-1024','d0241024-0000-4000-8000-000000000002','Wing Van',45,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('d0241024-0000-4000-8000-000000000004','d0241024-0000-4000-8000-000000000002','DEMO Miguel','Santos','DEMO-NOT-A-REAL-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'d0241024-0000-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000005','DEMO-HOME-WH','DEMO Valenzuela consolidation warehouse','DEMO street waypoint in Valenzuela; not a real customer premise','Valenzuela','Metro Manila','LUZON',14.701028,120.983014,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox demo fixture; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('d0241024-0000-4000-8000-000000000006','DEMO-HOME-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000011','d0241024-0000-4000-8000-000000000001','DEMO North EDSA receiving point','DEMO-HOME-STOP-1','DEMO receiving point near SM City North EDSA; no business affiliation','Quezon City','Metro Manila','LUZON',14.656510,121.028953,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an existing Mapbox road waypoint.'),
    ('d0241024-0000-4000-8000-000000000012','d0241024-0000-4000-8000-000000000001','DEMO Ermita receiving point','DEMO-HOME-STOP-2','DEMO receiving point near Robinsons Place Manila; no business affiliation','Manila','Metro Manila','LUZON',14.578818,120.983034,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an existing Mapbox road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('d0241024-0000-4000-8000-000000000021','DEMO-HOME-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('d0241024-0000-4000-8000-000000000022','DEMO-HOME-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('d0241024-0000-4000-8000-000000000023','DEMO-HOME-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('d0241024-0000-4000-8000-000000000100','DEMO-HOME-20261024','DEMO-HOME-TRIP-01','d0241024-0000-4000-8000-000000000006','d0241024-0000-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-AUTH-1024','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. North EDSA delivered; Ermita pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000003','d0241024-0000-4000-8000-000000000004','d0241024-0000-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('d0241024-0000-4000-8000-000000000111','d0241024-0000-4000-8000-000000000100',1,'d0241024-0000-4000-8000-000000000001','d0241024-0000-4000-8000-000000000011','DEMO-HOME-20261024','DEMO-HOME-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('d0241024-0000-4000-8000-000000000112','d0241024-0000-4000-8000-000000000100',2,'d0241024-0000-4000-8000-000000000001','d0241024-0000-4000-8000-000000000012','DEMO-HOME-20261024','DEMO-HOME-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('d0241024-0000-4000-8000-000000000121','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000111','d0241024-0000-4000-8000-000000000021',10,0.72,7.20,'DEMO-DR-01','DEMO-SO-01','DEMO-REF320','d0241024-0000-4000-8000-000000000005',tag),
    ('d0241024-0000-4000-8000-000000000122','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000111','d0241024-0000-4000-8000-000000000022',20,0.18,3.60,'DEMO-DR-02','DEMO-SO-02','DEMO-TV55','d0241024-0000-4000-8000-000000000005',tag),
    ('d0241024-0000-4000-8000-000000000123','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000112','d0241024-0000-4000-8000-000000000021',8,0.72,5.76,'DEMO-DR-03','DEMO-SO-03','DEMO-REF320','d0241024-0000-4000-8000-000000000005',tag),
    ('d0241024-0000-4000-8000-000000000124','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000112','d0241024-0000-4000-8000-000000000023',12,0.42,5.04,'DEMO-DR-04','DEMO-SO-04','DEMO-WM9','d0241024-0000-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('d0241024-0000-4000-8000-000000000141','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000111','COMPLETED'),
    ('d0241024-0000-4000-8000-000000000142','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('d0241024-0000-4000-8000-000000000131','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000121',10,7.20),
    ('d0241024-0000-4000-8000-000000000132','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000122',20,3.60),
    ('d0241024-0000-4000-8000-000000000133','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000123',8,5.76),
    ('d0241024-0000-4000-8000-000000000134','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000101','d0241024-0000-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('d0241024-0000-4000-8000-000000000151','d0241024-0000-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.701028,120.983014,tag||' Demonstration loading completed.'),
    ('d0241024-0000-4000-8000-000000000152','d0241024-0000-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.701028,120.983014,tag||' Demonstration warehouse departure.'),
    ('d0241024-0000-4000-8000-000000000153','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.656510,121.028953,tag||' Demonstration stop arrival.'),
    ('d0241024-0000-4000-8000-000000000154','d0241024-0000-4000-8000-000000000100','d0241024-0000-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.656510,121.028953,tag||' Demonstration first delivery completed.'),
    ('d0241024-0000-4000-8000-000000000155','d0241024-0000-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.636887,121.025503,tag||' SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='d0241024-0000-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='d0241024-0000-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='d0241024-0000-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
END;
$demo$;
COMMIT;
-- After approval/application: open this trip in Home and select
-- Calculate demo road route. The authorized existing /tracking/roads/:id/planned
-- API calls Mapbox Directions and maintains its existing one-hour lease/cache guards.
-- The trip reference is generated by the existing generate_trip_reference trigger.
