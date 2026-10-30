-- Demonstration only: one dispatch, two numbered trips, two trucks, three stores.
-- All new records use the DEMO-MULTI namespace. Re-running leaves the completed demo unchanged.
BEGIN;
DO $demo$
DECLARE
  marker constant text := '[ALZHEN_MULTI_TRIP_DEMO_V1]';
  dispatch constant text := 'DEMO-MULTI-261028';
  demo_warehouse uuid;
  demo_customer uuid;
  demo_product uuid;
  first_truck uuid;
  second_truck uuid;
  first_store uuid;
  second_store uuid;
  third_store uuid;
  first_trip uuid;
  second_trip uuid;
  first_stop uuid;
  second_stop uuid;
  third_stop uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.trips WHERE dispatch_number=dispatch) THEN
    IF (SELECT count(*) FROM public.trips WHERE dispatch_number=dispatch AND remarks LIKE '%'||marker||'%')=2
       AND (SELECT count(*) FROM public.trips WHERE dispatch_number=dispatch)=2 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Demo dispatch name is already in use by another record';
  END IF;
  IF EXISTS (SELECT 1 FROM public.warehouses WHERE code='DEMO-MULTI-WH')
     OR EXISTS (SELECT 1 FROM public.customers WHERE code='DEMO-MULTI-CUSTOMER')
     OR EXISTS (SELECT 1 FROM public.customer_stores WHERE code LIKE 'DEMO-MULTI-STORE-%')
     OR EXISTS (SELECT 1 FROM public.products WHERE sku='DEMO-MULTI-PRODUCT')
     OR EXISTS (SELECT 1 FROM public.trucks WHERE plate_number IN ('DEMO-MULTI-TRUCK-1','DEMO-MULTI-TRUCK-2')) THEN
    RAISE EXCEPTION 'Demo namespace is already in use; no records were added';
  END IF;

  INSERT INTO public.warehouses(code,name,province,city,notes)
    VALUES('DEMO-MULTI-WH','Demo Multi-Trip Warehouse','Metro Manila','Quezon City',marker)
    RETURNING id INTO demo_warehouse;
  INSERT INTO public.customers(code,name,notes)
    VALUES('DEMO-MULTI-CUSTOMER','Demo Multi-Trip Customer',marker)
    RETURNING id INTO demo_customer;
  INSERT INTO public.customer_stores(customer_id,code,name,province,city,notes)
    VALUES(demo_customer,'DEMO-MULTI-STORE-1','Demo North Store','Metro Manila','Quezon City',marker)
    RETURNING id INTO first_store;
  INSERT INTO public.customer_stores(customer_id,code,name,province,city,notes)
    VALUES(demo_customer,'DEMO-MULTI-STORE-2','Demo Central Store','Metro Manila','Mandaluyong',marker)
    RETURNING id INTO second_store;
  INSERT INTO public.customer_stores(customer_id,code,name,province,city,notes)
    VALUES(demo_customer,'DEMO-MULTI-STORE-3','Demo South Store','Metro Manila','Makati',marker)
    RETURNING id INTO third_store;
  INSERT INTO public.products(sku,model_code,name,category,unit_cbm,notes)
    VALUES('DEMO-MULTI-PRODUCT','DEMO-MULTI-BOX','Demo Sample Box','DEMO',0.25,marker)
    RETURNING id INTO demo_product;
  INSERT INTO public.trucks(plate_number,truck_type,capacity_cbm,notes)
    VALUES('DEMO-MULTI-TRUCK-1','Demo Truck',10,marker)
    RETURNING id INTO first_truck;
  INSERT INTO public.trucks(plate_number,truck_type,capacity_cbm,notes)
    VALUES('DEMO-MULTI-TRUCK-2','Demo Truck',10,marker)
    RETURNING id INTO second_truck;

  INSERT INTO public.trips(dispatch_number,trip_number,warehouse_id,loading_date,estimated_delivery_date,status,remarks)
    VALUES(dispatch,1,demo_warehouse,'2026-10-28','2026-10-29','PLANNED',marker||' Trip 1: North and Central stores; Truck 1.')
    RETURNING id INTO first_trip;
  INSERT INTO public.trips(dispatch_number,trip_number,warehouse_id,loading_date,estimated_delivery_date,status,remarks)
    VALUES(dispatch,2,demo_warehouse,'2026-10-28','2026-10-29','PLANNED',marker||' Trip 2: South store; Truck 2.')
    RETURNING id INTO second_trip;
  INSERT INTO public.trip_truck_assignments(trip_id,truck_id,assignment_type,stop_scope,remarks)
    VALUES(first_trip,first_truck,'PRIMARY','ALL',marker);
  INSERT INTO public.trip_truck_assignments(trip_id,truck_id,assignment_type,stop_scope,remarks)
    VALUES(second_trip,second_truck,'PRIMARY','ALL',marker);

  INSERT INTO public.trip_stops(trip_id,stop_sequence,customer_id,store_id,dispatch_number,dr_number,delivery_status,quantity,total_cbm,remarks)
    VALUES(first_trip,1,demo_customer,first_store,dispatch,'DEMO-MULTI-DR-1','PENDING',4,1,marker)
    RETURNING id INTO first_stop;
  INSERT INTO public.trip_stops(trip_id,stop_sequence,customer_id,store_id,dispatch_number,dr_number,delivery_status,quantity,total_cbm,remarks)
    VALUES(first_trip,2,demo_customer,second_store,dispatch,'DEMO-MULTI-DR-2','PENDING',6,1.5,marker)
    RETURNING id INTO second_stop;
  INSERT INTO public.trip_stops(trip_id,stop_sequence,customer_id,store_id,dispatch_number,dr_number,delivery_status,quantity,total_cbm,remarks)
    VALUES(second_trip,1,demo_customer,third_store,dispatch,'DEMO-MULTI-DR-3','PENDING',8,2,marker)
    RETURNING id INTO third_stop;
  INSERT INTO public.trip_line_items(trip_id,trip_stop_id,product_id,customer_model,quantity,cbm,dr_number,unit_cbm,remarks)
    VALUES(first_trip,first_stop,demo_product,'DEMO-MULTI-BOX',4,1,'DEMO-MULTI-DR-1',0.25,marker),
          (first_trip,second_stop,demo_product,'DEMO-MULTI-BOX',6,1.5,'DEMO-MULTI-DR-2',0.25,marker),
          (second_trip,third_stop,demo_product,'DEMO-MULTI-BOX',8,2,'DEMO-MULTI-DR-3',0.25,marker);
END $demo$;
COMMIT;
