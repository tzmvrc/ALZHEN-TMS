-- Approved fleet demonstration: data only, no schema/security changes.
-- Five independent 31-record graphs. UUID namespaces f1241024-0001..0005.
-- No real GPS, auth users, consent, sessions, attachments or financial records.
-- Normal FK/capacity/history/location/Realtime triggers remain enabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $fleet$
DECLARE
 tag constant text := '[ALZHEN_FLEET_DEMO_V1]';
 reviewer constant uuid := '8eaf7847-e806-493d-8338-ac0412153245';
 sample_time timestamptz := clock_timestamp();
 started timestamptz;
 delivery_day date;
 occupied integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_FLEET_DEMO_V1'));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN') THEN RAISE EXCEPTION 'Coordinate reviewer is not an Admin'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tms_dropdown_options WHERE field_key='trip_status' AND option_value='IN_PROGRESS' AND active) THEN RAISE EXCEPTION 'IN_PROGRESS status unavailable'; END IF;

 -- Scenario 1: Valenzuela -> Quezon City / Marikina; positions verified on Mapbox driving geometry.
 SELECT (SELECT count(*) FROM public.customers WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trucking_companies WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trucks WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.drivers WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.warehouses WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.customer_stores WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.products WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_types WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trips WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_truck_assignments WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_stops WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_line_items WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_assignment_stops WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_cargo_allocations WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.trip_events WHERE id::text LIKE 'f1241024-0001-4000-8000-%') + (SELECT count(*) FROM public.driver_trip_updates WHERE id::text LIKE 'f1241024-0001-4000-8000-%') INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='f1241024-0001-4000-8000-000000000100' AND dispatch_number='DEMO-FLEET-1-20261024' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='f1241024-0001-4000-8000-000000000100')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='f1241024-0001-4000-8000-000000000100')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='f1241024-0001-4000-8000-000000000101' AND trip_id='f1241024-0001-4000-8000-000000000100' AND truck_id='f1241024-0001-4000-8000-000000000003' AND driver_id='f1241024-0001-4000-8000-000000000004')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace 1; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario 1 already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-FLEET-1-20261024') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F01') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '4 hours';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date + 1;
  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-FLEET-1-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-FLEET-1-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000003','DEMO-F01','f1241024-0001-4000-8000-000000000002','Wing Van',45,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('f1241024-0001-4000-8000-000000000004','f1241024-0001-4000-8000-000000000002','DEMO Rafael','Cruz','DEMO-FLEET-1-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'f1241024-0001-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000005','DEMO-FLEET-1-WH','DEMO Fleet 1 Valenzuela warehouse','DEMO road waypoint in Valenzuela; no real premise or business affiliation','Valenzuela','Metro Manila','LUZON',14.70103,120.983025,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox Directions preparation; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('f1241024-0001-4000-8000-000000000006','DEMO-FLEET-1-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000011','f1241024-0001-4000-8000-000000000001','DEMO Fleet 1 North EDSA receiving point','DEMO-FLEET-1-STOP-1','DEMO road waypoint in North EDSA; no real premise','North EDSA','Metro Manila','LUZON',14.65651,121.028953,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.'),
    ('f1241024-0001-4000-8000-000000000012','f1241024-0001-4000-8000-000000000001','DEMO Fleet 1 Marikina receiving point','DEMO-FLEET-1-STOP-2','DEMO road waypoint in Marikina; no real premise','Marikina','Metro Manila','LUZON',14.632427,121.098396,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('f1241024-0001-4000-8000-000000000021','DEMO-FLEET-1-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('f1241024-0001-4000-8000-000000000022','DEMO-FLEET-1-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('f1241024-0001-4000-8000-000000000023','DEMO-FLEET-1-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_number,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('f1241024-0001-4000-8000-000000000100','DEMO-FLEET-1-20261024','DEMO-FLEET-1-TRIP-01',1,'f1241024-0001-4000-8000-000000000006','f1241024-0001-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-F1-AUTH','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. North EDSA delivered; Marikina pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000003','f1241024-0001-4000-8000-000000000004','f1241024-0001-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('f1241024-0001-4000-8000-000000000111','f1241024-0001-4000-8000-000000000100',1,'f1241024-0001-4000-8000-000000000001','f1241024-0001-4000-8000-000000000011','DEMO-FLEET-1-20261024','DEMO-FLEET-1-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('f1241024-0001-4000-8000-000000000112','f1241024-0001-4000-8000-000000000100',2,'f1241024-0001-4000-8000-000000000001','f1241024-0001-4000-8000-000000000012','DEMO-FLEET-1-20261024','DEMO-FLEET-1-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('f1241024-0001-4000-8000-000000000121','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000111','f1241024-0001-4000-8000-000000000021',10,0.72,7.20,'DEMO-F1-DR-01','DEMO-F1-SO-01','DEMO-REF320','f1241024-0001-4000-8000-000000000005',tag),
    ('f1241024-0001-4000-8000-000000000122','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000111','f1241024-0001-4000-8000-000000000022',20,0.18,3.60,'DEMO-F1-DR-02','DEMO-F1-SO-02','DEMO-TV55','f1241024-0001-4000-8000-000000000005',tag),
    ('f1241024-0001-4000-8000-000000000123','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000112','f1241024-0001-4000-8000-000000000021',8,0.72,5.76,'DEMO-F1-DR-03','DEMO-F1-SO-03','DEMO-REF320','f1241024-0001-4000-8000-000000000005',tag),
    ('f1241024-0001-4000-8000-000000000124','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000112','f1241024-0001-4000-8000-000000000023',12,0.42,5.04,'DEMO-F1-DR-04','DEMO-F1-SO-04','DEMO-WM9','f1241024-0001-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('f1241024-0001-4000-8000-000000000141','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000111','COMPLETED'),
    ('f1241024-0001-4000-8000-000000000142','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('f1241024-0001-4000-8000-000000000131','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000121',10,7.20),
    ('f1241024-0001-4000-8000-000000000132','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000122',20,3.60),
    ('f1241024-0001-4000-8000-000000000133','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000123',8,5.76),
    ('f1241024-0001-4000-8000-000000000134','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000101','f1241024-0001-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('f1241024-0001-4000-8000-000000000151','f1241024-0001-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.70103,120.983025,tag||' Demonstration loading completed.'),
    ('f1241024-0001-4000-8000-000000000152','f1241024-0001-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.70103,120.983025,tag||' Demonstration warehouse departure.'),
    ('f1241024-0001-4000-8000-000000000153','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.65651,121.028953,tag||' Demonstration stop arrival.'),
    ('f1241024-0001-4000-8000-000000000154','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.65651,121.028953,tag||' Demonstration first delivery completed.'),
    ('f1241024-0001-4000-8000-000000000155','f1241024-0001-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.646055,121.052727,tag||' [assignment:f1241024-0001-4000-8000-000000000101] SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='f1241024-0001-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='f1241024-0001-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='f1241024-0001-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('f1241024-0001-4000-8000-000000000161','f1241024-0001-4000-8000-000000000100','f1241024-0001-4000-8000-000000000004','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:f1241024-0001-4000-8000-000000000101]',started+interval '120 minutes');
 END IF;

 -- Scenario 2: Valenzuela -> Makati / Taguig; positions verified on Mapbox driving geometry.
 SELECT (SELECT count(*) FROM public.customers WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trucking_companies WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trucks WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.drivers WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.warehouses WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.customer_stores WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.products WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_types WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trips WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_truck_assignments WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_stops WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_line_items WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_assignment_stops WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_cargo_allocations WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.trip_events WHERE id::text LIKE 'f1241024-0002-4000-8000-%') + (SELECT count(*) FROM public.driver_trip_updates WHERE id::text LIKE 'f1241024-0002-4000-8000-%') INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='f1241024-0002-4000-8000-000000000100' AND dispatch_number='DEMO-FLEET-2-20261024' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='f1241024-0002-4000-8000-000000000100')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='f1241024-0002-4000-8000-000000000100')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='f1241024-0002-4000-8000-000000000101' AND trip_id='f1241024-0002-4000-8000-000000000100' AND truck_id='f1241024-0002-4000-8000-000000000003' AND driver_id='f1241024-0002-4000-8000-000000000004')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace 2; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario 2 already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-FLEET-2-20261024') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F02') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '4 hours';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date + 1;
  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-FLEET-2-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-FLEET-2-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000003','DEMO-F02','f1241024-0002-4000-8000-000000000002','Closed Van',30,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('f1241024-0002-4000-8000-000000000004','f1241024-0002-4000-8000-000000000002','DEMO Carlo','Reyes','DEMO-FLEET-2-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'f1241024-0002-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000005','DEMO-FLEET-2-WH','DEMO Fleet 2 Valenzuela warehouse','DEMO road waypoint in Valenzuela; no real premise or business affiliation','Valenzuela','Metro Manila','LUZON',14.70103,120.983025,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox Directions preparation; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('f1241024-0002-4000-8000-000000000006','DEMO-FLEET-2-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000011','f1241024-0002-4000-8000-000000000001','DEMO Fleet 2 Makati receiving point','DEMO-FLEET-2-STOP-1','DEMO road waypoint in Makati; no real premise','Makati','Metro Manila','LUZON',14.554602,121.026314,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.'),
    ('f1241024-0002-4000-8000-000000000012','f1241024-0002-4000-8000-000000000001','DEMO Fleet 2 Taguig receiving point','DEMO-FLEET-2-STOP-2','DEMO road waypoint in Taguig; no real premise','Taguig','Metro Manila','LUZON',14.55104,121.050967,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('f1241024-0002-4000-8000-000000000021','DEMO-FLEET-2-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('f1241024-0002-4000-8000-000000000022','DEMO-FLEET-2-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('f1241024-0002-4000-8000-000000000023','DEMO-FLEET-2-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_number,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('f1241024-0002-4000-8000-000000000100','DEMO-FLEET-2-20261024','DEMO-FLEET-2-TRIP-01',2,'f1241024-0002-4000-8000-000000000006','f1241024-0002-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-F2-AUTH','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. Makati delivered; Taguig pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000003','f1241024-0002-4000-8000-000000000004','f1241024-0002-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('f1241024-0002-4000-8000-000000000111','f1241024-0002-4000-8000-000000000100',1,'f1241024-0002-4000-8000-000000000001','f1241024-0002-4000-8000-000000000011','DEMO-FLEET-2-20261024','DEMO-FLEET-2-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('f1241024-0002-4000-8000-000000000112','f1241024-0002-4000-8000-000000000100',2,'f1241024-0002-4000-8000-000000000001','f1241024-0002-4000-8000-000000000012','DEMO-FLEET-2-20261024','DEMO-FLEET-2-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('f1241024-0002-4000-8000-000000000121','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000111','f1241024-0002-4000-8000-000000000021',10,0.72,7.20,'DEMO-F2-DR-01','DEMO-F2-SO-01','DEMO-REF320','f1241024-0002-4000-8000-000000000005',tag),
    ('f1241024-0002-4000-8000-000000000122','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000111','f1241024-0002-4000-8000-000000000022',20,0.18,3.60,'DEMO-F2-DR-02','DEMO-F2-SO-02','DEMO-TV55','f1241024-0002-4000-8000-000000000005',tag),
    ('f1241024-0002-4000-8000-000000000123','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000112','f1241024-0002-4000-8000-000000000021',8,0.72,5.76,'DEMO-F2-DR-03','DEMO-F2-SO-03','DEMO-REF320','f1241024-0002-4000-8000-000000000005',tag),
    ('f1241024-0002-4000-8000-000000000124','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000112','f1241024-0002-4000-8000-000000000023',12,0.42,5.04,'DEMO-F2-DR-04','DEMO-F2-SO-04','DEMO-WM9','f1241024-0002-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('f1241024-0002-4000-8000-000000000141','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000111','COMPLETED'),
    ('f1241024-0002-4000-8000-000000000142','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('f1241024-0002-4000-8000-000000000131','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000121',10,7.20),
    ('f1241024-0002-4000-8000-000000000132','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000122',20,3.60),
    ('f1241024-0002-4000-8000-000000000133','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000123',8,5.76),
    ('f1241024-0002-4000-8000-000000000134','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000101','f1241024-0002-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('f1241024-0002-4000-8000-000000000151','f1241024-0002-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.70103,120.983025,tag||' Demonstration loading completed.'),
    ('f1241024-0002-4000-8000-000000000152','f1241024-0002-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.70103,120.983025,tag||' Demonstration warehouse departure.'),
    ('f1241024-0002-4000-8000-000000000153','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.554602,121.026314,tag||' Demonstration stop arrival.'),
    ('f1241024-0002-4000-8000-000000000154','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.554602,121.026314,tag||' Demonstration first delivery completed.'),
    ('f1241024-0002-4000-8000-000000000155','f1241024-0002-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.548453,121.032638,tag||' [assignment:f1241024-0002-4000-8000-000000000101] SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='f1241024-0002-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='f1241024-0002-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='f1241024-0002-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('f1241024-0002-4000-8000-000000000161','f1241024-0002-4000-8000-000000000100','f1241024-0002-4000-8000-000000000004','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:f1241024-0002-4000-8000-000000000101]',started+interval '120 minutes');
 END IF;

 -- Scenario 3: Marikina -> Antipolo / Cainta; positions verified on Mapbox driving geometry.
 SELECT (SELECT count(*) FROM public.customers WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trucking_companies WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trucks WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.drivers WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.warehouses WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.customer_stores WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.products WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_types WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trips WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_truck_assignments WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_stops WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_line_items WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_assignment_stops WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_cargo_allocations WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.trip_events WHERE id::text LIKE 'f1241024-0003-4000-8000-%') + (SELECT count(*) FROM public.driver_trip_updates WHERE id::text LIKE 'f1241024-0003-4000-8000-%') INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='f1241024-0003-4000-8000-000000000100' AND dispatch_number='DEMO-FLEET-3-20261024' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='f1241024-0003-4000-8000-000000000100')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='f1241024-0003-4000-8000-000000000100')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='f1241024-0003-4000-8000-000000000101' AND trip_id='f1241024-0003-4000-8000-000000000100' AND truck_id='f1241024-0003-4000-8000-000000000003' AND driver_id='f1241024-0003-4000-8000-000000000004')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace 3; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario 3 already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-FLEET-3-20261024') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F03') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '4 hours';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date + 1;
  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-FLEET-3-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-FLEET-3-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000003','DEMO-F03','f1241024-0003-4000-8000-000000000002','Wing Van',45,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('f1241024-0003-4000-8000-000000000004','f1241024-0003-4000-8000-000000000002','DEMO Luis','Mendoza','DEMO-FLEET-3-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'f1241024-0003-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000005','DEMO-FLEET-3-WH','DEMO Fleet 3 Marikina warehouse','DEMO road waypoint in Marikina; no real premise or business affiliation','Marikina','Metro Manila','LUZON',14.632427,121.098396,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox Directions preparation; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('f1241024-0003-4000-8000-000000000006','DEMO-FLEET-3-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000011','f1241024-0003-4000-8000-000000000001','DEMO Fleet 3 Antipolo receiving point','DEMO-FLEET-3-STOP-1','DEMO road waypoint in Antipolo; no real premise','Antipolo','Rizal','LUZON',14.62547,121.176528,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.'),
    ('f1241024-0003-4000-8000-000000000012','f1241024-0003-4000-8000-000000000001','DEMO Fleet 3 Cainta receiving point','DEMO-FLEET-3-STOP-2','DEMO road waypoint in Cainta; no real premise','Cainta','Rizal','LUZON',14.578669,121.114525,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('f1241024-0003-4000-8000-000000000021','DEMO-FLEET-3-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('f1241024-0003-4000-8000-000000000022','DEMO-FLEET-3-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('f1241024-0003-4000-8000-000000000023','DEMO-FLEET-3-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_number,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('f1241024-0003-4000-8000-000000000100','DEMO-FLEET-3-20261024','DEMO-FLEET-3-TRIP-01',3,'f1241024-0003-4000-8000-000000000006','f1241024-0003-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-F3-AUTH','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. Antipolo delivered; Cainta pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000003','f1241024-0003-4000-8000-000000000004','f1241024-0003-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('f1241024-0003-4000-8000-000000000111','f1241024-0003-4000-8000-000000000100',1,'f1241024-0003-4000-8000-000000000001','f1241024-0003-4000-8000-000000000011','DEMO-FLEET-3-20261024','DEMO-FLEET-3-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('f1241024-0003-4000-8000-000000000112','f1241024-0003-4000-8000-000000000100',2,'f1241024-0003-4000-8000-000000000001','f1241024-0003-4000-8000-000000000012','DEMO-FLEET-3-20261024','DEMO-FLEET-3-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('f1241024-0003-4000-8000-000000000121','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000111','f1241024-0003-4000-8000-000000000021',10,0.72,7.20,'DEMO-F3-DR-01','DEMO-F3-SO-01','DEMO-REF320','f1241024-0003-4000-8000-000000000005',tag),
    ('f1241024-0003-4000-8000-000000000122','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000111','f1241024-0003-4000-8000-000000000022',20,0.18,3.60,'DEMO-F3-DR-02','DEMO-F3-SO-02','DEMO-TV55','f1241024-0003-4000-8000-000000000005',tag),
    ('f1241024-0003-4000-8000-000000000123','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000112','f1241024-0003-4000-8000-000000000021',8,0.72,5.76,'DEMO-F3-DR-03','DEMO-F3-SO-03','DEMO-REF320','f1241024-0003-4000-8000-000000000005',tag),
    ('f1241024-0003-4000-8000-000000000124','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000112','f1241024-0003-4000-8000-000000000023',12,0.42,5.04,'DEMO-F3-DR-04','DEMO-F3-SO-04','DEMO-WM9','f1241024-0003-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('f1241024-0003-4000-8000-000000000141','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000111','COMPLETED'),
    ('f1241024-0003-4000-8000-000000000142','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('f1241024-0003-4000-8000-000000000131','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000121',10,7.20),
    ('f1241024-0003-4000-8000-000000000132','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000122',20,3.60),
    ('f1241024-0003-4000-8000-000000000133','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000123',8,5.76),
    ('f1241024-0003-4000-8000-000000000134','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000101','f1241024-0003-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('f1241024-0003-4000-8000-000000000151','f1241024-0003-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.632427,121.098396,tag||' Demonstration loading completed.'),
    ('f1241024-0003-4000-8000-000000000152','f1241024-0003-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.632427,121.098396,tag||' Demonstration warehouse departure.'),
    ('f1241024-0003-4000-8000-000000000153','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.62547,121.176528,tag||' Demonstration stop arrival.'),
    ('f1241024-0003-4000-8000-000000000154','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.62547,121.176528,tag||' Demonstration first delivery completed.'),
    ('f1241024-0003-4000-8000-000000000155','f1241024-0003-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.592987,121.171633,tag||' [assignment:f1241024-0003-4000-8000-000000000101] SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='f1241024-0003-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='f1241024-0003-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='f1241024-0003-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('f1241024-0003-4000-8000-000000000161','f1241024-0003-4000-8000-000000000100','f1241024-0003-4000-8000-000000000004','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:f1241024-0003-4000-8000-000000000101]',started+interval '120 minutes');
 END IF;

 -- Scenario 4: Valenzuela -> Bulacan / Pampanga; positions verified on Mapbox driving geometry.
 SELECT (SELECT count(*) FROM public.customers WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trucking_companies WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trucks WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.drivers WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.warehouses WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.customer_stores WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.products WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_types WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trips WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_truck_assignments WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_stops WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_line_items WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_assignment_stops WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_cargo_allocations WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.trip_events WHERE id::text LIKE 'f1241024-0004-4000-8000-%') + (SELECT count(*) FROM public.driver_trip_updates WHERE id::text LIKE 'f1241024-0004-4000-8000-%') INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='f1241024-0004-4000-8000-000000000100' AND dispatch_number='DEMO-FLEET-4-20261024' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='f1241024-0004-4000-8000-000000000100')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='f1241024-0004-4000-8000-000000000100')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='f1241024-0004-4000-8000-000000000101' AND trip_id='f1241024-0004-4000-8000-000000000100' AND truck_id='f1241024-0004-4000-8000-000000000003' AND driver_id='f1241024-0004-4000-8000-000000000004')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace 4; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario 4 already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-FLEET-4-20261024') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F04') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '2 days';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date - 1;
  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-FLEET-4-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-FLEET-4-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000003','DEMO-F04','f1241024-0004-4000-8000-000000000002','Wing Van',45,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('f1241024-0004-4000-8000-000000000004','f1241024-0004-4000-8000-000000000002','DEMO Daniel','Garcia','DEMO-FLEET-4-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'f1241024-0004-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000005','DEMO-FLEET-4-WH','DEMO Fleet 4 Valenzuela warehouse','DEMO road waypoint in Valenzuela; no real premise or business affiliation','Valenzuela','Metro Manila','LUZON',14.70103,120.983025,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox Directions preparation; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('f1241024-0004-4000-8000-000000000006','DEMO-FLEET-4-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000011','f1241024-0004-4000-8000-000000000001','DEMO Fleet 4 Malolos, Bulacan receiving point','DEMO-FLEET-4-STOP-1','DEMO road waypoint in Malolos, Bulacan; no real premise','Malolos, Bulacan','Bulacan','LUZON',14.858809,120.815128,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.'),
    ('f1241024-0004-4000-8000-000000000012','f1241024-0004-4000-8000-000000000001','DEMO Fleet 4 San Fernando, Pampanga receiving point','DEMO-FLEET-4-STOP-2','DEMO road waypoint in San Fernando, Pampanga; no real premise','San Fernando, Pampanga','Pampanga','LUZON',15.032062,120.653981,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('f1241024-0004-4000-8000-000000000021','DEMO-FLEET-4-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('f1241024-0004-4000-8000-000000000022','DEMO-FLEET-4-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('f1241024-0004-4000-8000-000000000023','DEMO-FLEET-4-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_number,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('f1241024-0004-4000-8000-000000000100','DEMO-FLEET-4-20261024','DEMO-FLEET-4-TRIP-01',4,'f1241024-0004-4000-8000-000000000006','f1241024-0004-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-F4-AUTH','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. Malolos, Bulacan delivered; San Fernando, Pampanga pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000003','f1241024-0004-4000-8000-000000000004','f1241024-0004-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('f1241024-0004-4000-8000-000000000111','f1241024-0004-4000-8000-000000000100',1,'f1241024-0004-4000-8000-000000000001','f1241024-0004-4000-8000-000000000011','DEMO-FLEET-4-20261024','DEMO-FLEET-4-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('f1241024-0004-4000-8000-000000000112','f1241024-0004-4000-8000-000000000100',2,'f1241024-0004-4000-8000-000000000001','f1241024-0004-4000-8000-000000000012','DEMO-FLEET-4-20261024','DEMO-FLEET-4-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('f1241024-0004-4000-8000-000000000121','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000111','f1241024-0004-4000-8000-000000000021',10,0.72,7.20,'DEMO-F4-DR-01','DEMO-F4-SO-01','DEMO-REF320','f1241024-0004-4000-8000-000000000005',tag),
    ('f1241024-0004-4000-8000-000000000122','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000111','f1241024-0004-4000-8000-000000000022',20,0.18,3.60,'DEMO-F4-DR-02','DEMO-F4-SO-02','DEMO-TV55','f1241024-0004-4000-8000-000000000005',tag),
    ('f1241024-0004-4000-8000-000000000123','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000112','f1241024-0004-4000-8000-000000000021',8,0.72,5.76,'DEMO-F4-DR-03','DEMO-F4-SO-03','DEMO-REF320','f1241024-0004-4000-8000-000000000005',tag),
    ('f1241024-0004-4000-8000-000000000124','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000112','f1241024-0004-4000-8000-000000000023',12,0.42,5.04,'DEMO-F4-DR-04','DEMO-F4-SO-04','DEMO-WM9','f1241024-0004-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('f1241024-0004-4000-8000-000000000141','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000111','COMPLETED'),
    ('f1241024-0004-4000-8000-000000000142','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('f1241024-0004-4000-8000-000000000131','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000121',10,7.20),
    ('f1241024-0004-4000-8000-000000000132','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000122',20,3.60),
    ('f1241024-0004-4000-8000-000000000133','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000123',8,5.76),
    ('f1241024-0004-4000-8000-000000000134','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000101','f1241024-0004-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('f1241024-0004-4000-8000-000000000151','f1241024-0004-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.70103,120.983025,tag||' Demonstration loading completed.'),
    ('f1241024-0004-4000-8000-000000000152','f1241024-0004-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.70103,120.983025,tag||' Demonstration warehouse departure.'),
    ('f1241024-0004-4000-8000-000000000153','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.858809,120.815128,tag||' Demonstration stop arrival.'),
    ('f1241024-0004-4000-8000-000000000154','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.858809,120.815128,tag||' Demonstration first delivery completed.'),
    ('f1241024-0004-4000-8000-000000000155','f1241024-0004-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.860484,120.858821,tag||' [assignment:f1241024-0004-4000-8000-000000000101] SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='f1241024-0004-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='f1241024-0004-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='f1241024-0004-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('f1241024-0004-4000-8000-000000000161','f1241024-0004-4000-8000-000000000100','f1241024-0004-4000-8000-000000000004','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:f1241024-0004-4000-8000-000000000101]',started+interval '120 minutes');
 END IF;

 -- Scenario 5: Valenzuela -> Pasig / Mandaluyong; positions verified on Mapbox driving geometry.
 SELECT (SELECT count(*) FROM public.customers WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trucking_companies WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trucks WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.drivers WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.warehouses WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.customer_stores WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.products WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_types WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trips WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_truck_assignments WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_stops WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_line_items WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_assignment_stops WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_cargo_allocations WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.trip_events WHERE id::text LIKE 'f1241024-0005-4000-8000-%') + (SELECT count(*) FROM public.driver_trip_updates WHERE id::text LIKE 'f1241024-0005-4000-8000-%') INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='f1241024-0005-4000-8000-000000000100' AND dispatch_number='DEMO-FLEET-5-20261024' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='f1241024-0005-4000-8000-000000000100')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='f1241024-0005-4000-8000-000000000100')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='f1241024-0005-4000-8000-000000000101' AND trip_id='f1241024-0005-4000-8000-000000000100' AND truck_id='f1241024-0005-4000-8000-000000000003' AND driver_id='f1241024-0005-4000-8000-000000000004')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace 5; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario 5 already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='DEMO-FLEET-5-20261024') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F05') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '4 hours';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date + 1;
  INSERT INTO public.customers(id,name,code,address,email,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000001','DEMO Appliance Distribution PH','DEMO-FLEET-5-CUSTOMER','DEMO receiving network, Metro Manila','dispatch@example.invalid','ACTIVE',tag||' Fictional customer. No email automation.');
  INSERT INTO public.trucking_companies(id,name,code,email,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000002','DEMO ALZHEN Logistics','DEMO-FLEET-5-CARRIER','carrier@example.invalid','ACTIVE',tag||' Fictional carrier for dashboard review only.');
  INSERT INTO public.trucks(id,plate_number,trucking_company_id,truck_type,capacity_cbm,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000003','DEMO-F05','f1241024-0005-4000-8000-000000000002','Closed Van',30,'ACTIVE',tag||' Demonstration 10-wheel Wing Van. Plate is fictional, not a registered vehicle.');
  INSERT INTO public.drivers(id,trucking_company_id,first_name,last_name,license_number,status,notes,profile_id,assigned_truck_id) VALUES
    ('f1241024-0005-4000-8000-000000000004','f1241024-0005-4000-8000-000000000002','DEMO Marco','Bautista','DEMO-FLEET-5-LICENSE','ACTIVE',tag||' Fictional driver; no auth account, device consent or tracking session.',NULL,'f1241024-0005-4000-8000-000000000003');
  INSERT INTO public.warehouses(id,code,name,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000005','DEMO-FLEET-5-WH','DEMO Fleet 5 Valenzuela warehouse','DEMO road waypoint in Valenzuela; no real premise or business affiliation','Valenzuela','Metro Manila','LUZON',14.70103,120.983025,true,sample_time,reviewer,'ACTIVE',tag||' Road-snapped location from the existing Mapbox Directions preparation; verified only for this fictional road scenario.');
  INSERT INTO public.trip_types(id,code,name,description,active) VALUES
    ('f1241024-0005-4000-8000-000000000006','DEMO-FLEET-5-REGULAR','DEMO Regular Delivery',tag||' Two-stop Metro Manila appliance distribution.',true);
  INSERT INTO public.customer_stores(id,customer_id,name,code,address,city,province,region,latitude,longitude,location_verified,location_verified_at,location_verified_by,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000011','f1241024-0005-4000-8000-000000000001','DEMO Fleet 5 Pasig receiving point','DEMO-FLEET-5-STOP-1','DEMO road waypoint in Pasig; no real premise','Pasig','Metro Manila','LUZON',14.585299,121.060464,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.'),
    ('f1241024-0005-4000-8000-000000000012','f1241024-0005-4000-8000-000000000001','DEMO Fleet 5 Mandaluyong receiving point','DEMO-FLEET-5-STOP-2','DEMO road waypoint in Mandaluyong; no real premise','Mandaluyong','Metro Manila','LUZON',14.581909,121.039521,true,sample_time,reviewer,'ACTIVE',tag||' Fictional delivery site using an Mapbox-snapped demonstration road waypoint.');
  INSERT INTO public.products(id,sku,model_code,name,category,unit_cbm,status,notes) VALUES
    ('f1241024-0005-4000-8000-000000000021','DEMO-FLEET-5-REF','DEMO-REF320','DEMO 320L refrigerator','REF',0.72,'ACTIVE',tag),
    ('f1241024-0005-4000-8000-000000000022','DEMO-FLEET-5-TV','DEMO-TV55','DEMO 55-inch television','TV',0.18,'ACTIVE',tag),
    ('f1241024-0005-4000-8000-000000000023','DEMO-FLEET-5-WM','DEMO-WM9','DEMO 9kg washing machine','WM',0.42,'ACTIVE',tag);

  INSERT INTO public.trips(id,dispatch_number,trip_reference,trip_number,trip_type_id,warehouse_id,loading_date,estimated_delivery_date,status,authorization_letter,letter_status,remarks,request_received_at,departure_from_warehouse_at,created_at) VALUES
    ('f1241024-0005-4000-8000-000000000100','DEMO-FLEET-5-20261024','DEMO-FLEET-5-TRIP-01',5,'f1241024-0005-4000-8000-000000000006','f1241024-0005-4000-8000-000000000005',(started AT TIME ZONE 'Asia/Manila')::date,delivery_day,'IN_PROGRESS','DEMO-F5-AUTH','READY',tag||' DEMO ONLY. 50 units / 21.60 CBM. Pasig delivered; Mandaluyong pending. GPS is simulated. No real customer order.',started-interval '1 hour',started+interval '45 minutes',started);
  INSERT INTO public.trip_truck_assignments(id,trip_id,truck_id,driver_id,trucking_company_id,assignment_type,assigned_at,stop_scope,remarks) VALUES
    ('f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000003','f1241024-0005-4000-8000-000000000004','f1241024-0005-4000-8000-000000000002','PRIMARY',started,'ALL',tag||' Single demo truck attends both stops.');
  INSERT INTO public.trip_stops(id,trip_id,stop_sequence,customer_id,store_id,dispatch_number,transaction_number,delivery_status,arrival_time,start_unloading_time,finish_unloading_time,departure_time,quantity,total_cbm,remarks) VALUES
    ('f1241024-0005-4000-8000-000000000111','f1241024-0005-4000-8000-000000000100',1,'f1241024-0005-4000-8000-000000000001','f1241024-0005-4000-8000-000000000011','DEMO-FLEET-5-20261024','DEMO-FLEET-5-TXN-01','COMPLETED',started+interval '90 minutes',started+interval '100 minutes',started+interval '120 minutes',started+interval '130 minutes',30,10.80,tag||' Demonstration delivery completed. No real POD or financial posting.'),
    ('f1241024-0005-4000-8000-000000000112','f1241024-0005-4000-8000-000000000100',2,'f1241024-0005-4000-8000-000000000001','f1241024-0005-4000-8000-000000000012','DEMO-FLEET-5-20261024','DEMO-FLEET-5-TXN-02','PENDING',NULL,NULL,NULL,NULL,20,10.80,tag||' Demonstration next delivery. Call receiving desk; keep cartons dry.');
  INSERT INTO public.trip_line_items(id,trip_id,trip_stop_id,product_id,quantity,unit_cbm,cbm,dr_number,so_number,customer_model,source_warehouse_id,remarks) VALUES
    ('f1241024-0005-4000-8000-000000000121','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000111','f1241024-0005-4000-8000-000000000021',10,0.72,7.20,'DEMO-F5-DR-01','DEMO-F5-SO-01','DEMO-REF320','f1241024-0005-4000-8000-000000000005',tag),
    ('f1241024-0005-4000-8000-000000000122','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000111','f1241024-0005-4000-8000-000000000022',20,0.18,3.60,'DEMO-F5-DR-02','DEMO-F5-SO-02','DEMO-TV55','f1241024-0005-4000-8000-000000000005',tag),
    ('f1241024-0005-4000-8000-000000000123','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000112','f1241024-0005-4000-8000-000000000021',8,0.72,5.76,'DEMO-F5-DR-03','DEMO-F5-SO-03','DEMO-REF320','f1241024-0005-4000-8000-000000000005',tag),
    ('f1241024-0005-4000-8000-000000000124','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000112','f1241024-0005-4000-8000-000000000023',12,0.42,5.04,'DEMO-F5-DR-04','DEMO-F5-SO-04','DEMO-WM9','f1241024-0005-4000-8000-000000000005',tag);
  INSERT INTO public.trip_assignment_stops(id,trip_id,assignment_id,trip_stop_id,progress) VALUES
    ('f1241024-0005-4000-8000-000000000141','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000111','COMPLETED'),
    ('f1241024-0005-4000-8000-000000000142','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000112','PENDING');
  INSERT INTO public.trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) VALUES
    ('f1241024-0005-4000-8000-000000000131','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000121',10,7.20),
    ('f1241024-0005-4000-8000-000000000132','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000122',20,3.60),
    ('f1241024-0005-4000-8000-000000000133','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000123',8,5.76),
    ('f1241024-0005-4000-8000-000000000134','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000101','f1241024-0005-4000-8000-000000000124',12,5.04);
  INSERT INTO public.trip_events(id,trip_id,trip_stop_id,event_type,event_time,latitude,longitude,notes) VALUES
    ('f1241024-0005-4000-8000-000000000151','f1241024-0005-4000-8000-000000000100',NULL,'LOADING_FINISHED',started+interval '30 minutes',14.70103,120.983025,tag||' Demonstration loading completed.'),
    ('f1241024-0005-4000-8000-000000000152','f1241024-0005-4000-8000-000000000100',NULL,'DEPARTED_WAREHOUSE',started+interval '45 minutes',14.70103,120.983025,tag||' Demonstration warehouse departure.'),
    ('f1241024-0005-4000-8000-000000000153','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000111','ARRIVED',started+interval '90 minutes',14.585299,121.060464,tag||' Demonstration stop arrival.'),
    ('f1241024-0005-4000-8000-000000000154','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000111','UNLOADING_FINISHED',started+interval '120 minutes',14.585299,121.060464,tag||' Demonstration first delivery completed.'),
    ('f1241024-0005-4000-8000-000000000155','f1241024-0005-4000-8000-000000000100',NULL,'DEMO_SIMULATED_GPS',sample_time-interval '5 minutes',14.579539,121.05823,tag||' [assignment:f1241024-0005-4000-8000-000000000101] SIMULATED GPS: static street-coordinate sample after stop 1, not device telemetry or driver consent.');

  -- Fail closed if the seed is not a complete 50-unit / 21.60-CBM convoy.
  IF (SELECT sum(quantity) FROM public.trip_line_items WHERE trip_id='f1241024-0005-4000-8000-000000000100')<>50
     OR (SELECT sum(cbm) FROM public.trip_line_items WHERE trip_id='f1241024-0005-4000-8000-000000000100')<>21.60
     OR (SELECT sum(allocated_cbm) FROM public.trip_cargo_allocations WHERE trip_id='f1241024-0005-4000-8000-000000000100')<>21.60 THEN
    RAISE EXCEPTION 'Demo cargo totals did not match; all demo inserts rolled back.';
  END IF;
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('f1241024-0005-4000-8000-000000000161','f1241024-0005-4000-8000-000000000100','f1241024-0005-4000-8000-000000000004','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:f1241024-0005-4000-8000-000000000101]',started+interval '120 minutes');
 END IF;
END;
$fleet$;
COMMIT;
