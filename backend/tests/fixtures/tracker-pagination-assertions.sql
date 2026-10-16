\set ON_ERROR_STOP on
BEGIN;
INSERT INTO trips VALUES ('00000000-0000-4000-8000-000000000001',null,'2026-10-15','LBC-1',null);
INSERT INTO trip_stops SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001',n,null,null,'DR-'||n,CASE WHEN n=13 THEN 'PLANNED' ELSE 'COMPLETED' END,null FROM generate_series(11,13) n;
INSERT INTO flex_tables VALUES ('00000000-0000-4000-8000-000000000020','{"system_key":"alzhen_transmittal_tracker_v1"}',null);
INSERT INTO flex_rows VALUES('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','SOURCE','STOP','00000000-0000-4000-8000-000000000013',null);
INSERT INTO flex_columns VALUES('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000020','{"system_key":"transmittal_ref"}','STOP',false);
INSERT INTO flex_cells VALUES('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','"REF-THREE"');
INSERT INTO trip_truck_assignments VALUES('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001',null,null,'PRIMARY',null),('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001',null,null,'PRIMARY',null);
DO $$ BEGIN
 IF (SELECT count(*) FROM v_transmittal_tracker_page)<>3 THEN RAISE EXCEPTION 'assignment multiplied rows'; END IF;
 IF (SELECT count(DISTINCT trip_stop_id) FROM v_transmittal_tracker_page)<>3 THEN RAISE EXCEPTION 'source identities lost'; END IF;
 IF (SELECT delivery_receipt_no FROM v_transmittal_tracker_page ORDER BY trip_stop_id LIMIT 1 OFFSET 1)<>'DR-12' THEN RAISE EXCEPTION 'page targets wrong stop'; END IF;
 IF (SELECT count(*) FROM v_transmittal_tracker_page WHERE transmittal_ref='REF-THREE')<>1 THEN RAISE EXCEPTION 'reference crossed stops'; END IF;
 IF tracker_page_text_v1('"plain"','fallback')<>'plain' OR tracker_page_text_v1('null','fallback')<>'fallback' OR tracker_page_text_v1('""','fallback')<>'' OR tracker_page_text_v1('{"__alzhen_tracker_empty_override_v1__":true}','fallback')<>'' THEN RAISE EXCEPTION 'override semantics changed'; END IF;
 IF tracker_page_text_v1(to_jsonb('{"__alzhen_transmittal_pod_values_v1":{"pod1":"A","pod2":"B"}}'::text),'fallback')<>'fallback' THEN RAISE EXCEPTION 'legacy conflict chose arbitrary value'; END IF;
 IF tracker_page_text_v1(to_jsonb('{"__alzhen_transmittal_pod_values_v1":{"pod1":"A","pod2":"A"}}'::text),'fallback')<>'A' THEN RAISE EXCEPTION 'legacy agreement lost'; END IF;
 IF has_table_privilege('authenticated','v_transmittal_tracker_page','SELECT') OR has_function_privilege('authenticated','tracker_page_text_v1(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'browser access exposed'; END IF;
 IF NOT has_table_privilege('service_role','v_transmittal_tracker_page','SELECT') THEN RAISE EXCEPTION 'service view blocked'; END IF;
 BEGIN PERFORM tracker_page_cells_v1('{}',2,1); RAISE EXCEPTION 'duplicate fields accepted'; EXCEPTION WHEN cardinality_violation THEN NULL; END;
END; $$;
UPDATE trip_stops SET dr_number='ONLY-SECOND' WHERE stop_sequence=12;
DO $$ BEGIN IF (SELECT count(*) FROM v_transmittal_tracker_page WHERE delivery_receipt_no='ONLY-SECOND')<>1 THEN RAISE EXCEPTION 'sibling update leak'; END IF; END; $$;
DELETE FROM trip_stops WHERE stop_sequence=12;
DO $$ BEGIN IF (SELECT count(*) FROM v_transmittal_tracker_page)<>2 THEN RAISE EXCEPTION 'deleted transaction reappeared'; END IF; END; $$;
ROLLBACK;
