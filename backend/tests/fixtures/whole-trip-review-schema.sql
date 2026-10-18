-- Disposable only, after original deletion schema/RPC and catalog definition.
ALTER TABLE trips ADD dispatch_number text;
ALTER TABLE trip_images ADD trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL, ADD pod_record_id uuid REFERENCES pod_records(id) ON DELETE SET NULL;
ALTER TABLE pod_records ADD transmittal_reference text;
CREATE TABLE trip_tracking_locations(assignment_id uuid PRIMARY KEY REFERENCES trip_truck_assignments(id) ON DELETE CASCADE, enabled boolean, latitude double precision,longitude double precision);
CREATE TABLE trip_route_cache(assignment_id uuid PRIMARY KEY REFERENCES trip_truck_assignments(id) ON DELETE CASCADE,route_geometry jsonb);
CREATE TABLE driver_trip_updates(id uuid PRIMARY KEY,trip_id uuid NOT NULL,driver_id uuid,pod_image_url text,pod_image_path text);
CREATE TABLE pod_review_events(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,receipt_id uuid,decision text);
-- Live service_role has no SELECT on these: preview must still succeed via definer.
REVOKE ALL ON pod_records,pod_drive_files,backload_items FROM service_role;
CREATE FUNCTION fixture_id(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION fixture_trip(n bigint,stops integer DEFAULT 2) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s uuid; pod uuid:=fixture_id(n*100+1); offload uuid:=fixture_id(n*100+2); backload uuid:=fixture_id(n*100+4); assignment uuid:=fixture_id(n*1000+1);
BEGIN
 INSERT INTO trips VALUES(fixture_id(n),'DISPATCH-'||n);
 INSERT INTO driver_trip_updates VALUES(fixture_id(n*100+99),fixture_id(n),fixture_id(3),NULL,NULL);
 INSERT INTO trip_truck_assignments VALUES(assignment,fixture_id(n));
 INSERT INTO trip_tracking_locations VALUES(assignment,true,14.5,121);
 INSERT INTO trip_route_cache VALUES(assignment,'{"type":"LineString","coordinates":[[121,14.5],[121.1,14.6]]}');
 IF stops=0 THEN RETURN; END IF;
 FOR i IN 1..stops LOOP
  s:=fixture_id(n*10+i);INSERT INTO trip_stops(id,trip_id,dr_number) VALUES(s,fixture_id(n),'DR-'||n||'-'||i);
  INSERT INTO trip_line_items VALUES(fixture_id(n*100+20+i),fixture_id(n),s);
 END LOOP;
 s:=fixture_id(n*10+1);
 INSERT INTO pod_records VALUES(pod,fixture_id(n),s,'TRANSMITTAL-'||n);
 INSERT INTO offloads VALUES(offload,fixture_id(n),s,'Fixture');
 INSERT INTO offload_items(id,offload_id,trip_line_item_id) VALUES(fixture_id(n*100+3),offload,fixture_id(n*100+21));
 INSERT INTO backloads VALUES(backload,fixture_id(n),s);
 INSERT INTO backload_items VALUES(fixture_id(n*100+5),backload,fixture_id(n*100+21));
 INSERT INTO loading_reports VALUES(fixture_id(n*100+6),fixture_id(n));
 INSERT INTO unloading_reports VALUES(fixture_id(n*100+7),fixture_id(n),s);
 INSERT INTO report_receipts(id,trip_id,trip_stop_id,offload_id,storage_path) VALUES(fixture_id(n*100+91),fixture_id(n),s,offload,'operations/'||fixture_id(n)||'/offload/'||offload||'/'||fixture_id(n*100+91)||'.jpg');
 INSERT INTO trip_images VALUES(fixture_id(n*100+90),fixture_id(n),'trips/'||fixture_id(n)||'/'||fixture_id(n*100+90)||'.jpg',s,pod);
 INSERT INTO pod_review_events VALUES(fixture_id(n*100+80),fixture_id(n),s,fixture_id(n*100+90),'APPROVED');
 INSERT INTO flex_rows VALUES(fixture_id(n*100+81),'SOURCE','STOP',s);
 INSERT INTO flex_cells VALUES(fixture_id(n*100+82),fixture_id(n*100+81),'"TRANS-REF"');
 INSERT INTO trip_events VALUES(fixture_id(n*100+31),fixture_id(n),s);
 INSERT INTO store_calls VALUES(fixture_id(n*100+32),fixture_id(n),s);
 INSERT INTO incidents VALUES(fixture_id(n*100+33),fixture_id(n),s);
 INSERT INTO demurrages VALUES(fixture_id(n*100+34),fixture_id(n),s);
END $$;

-- Historical orphan predates the new NOT VALID FK; installation must preserve it.
INSERT INTO driver_trip_updates VALUES('00000000-0000-4000-8000-000900000001','00000000-0000-4000-8000-000900000002',NULL,NULL,NULL);
