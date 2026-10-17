-- Disposable local DB ONLY. Deliberately retains all synthetic data for diagnosis.
DO $$
DECLARE ctx jsonb; result boolean; original jsonb; original_definition text; expected_revision bigint;
 a uuid:='00000000-0000-4000-8000-000000000050'; actor uuid:='00000000-0000-4000-8000-000000000001';
 token uuid:='00000000-0000-4000-8000-000000000090'; before_token text;
BEGIN
 IF EXISTS(SELECT FROM trip_tracking_locations) THEN RAISE EXCEPTION 'Fixture must start without GPS'; END IF;
 ctx:=planned_route_context_v1(a,false);
 IF ctx->'origin'->>'id'<>'00000000-0000-4000-8000-000000000080' OR jsonb_array_length(ctx->'destinations')<>2
  OR ctx->'destinations'->0->>'id'<>'00000000-0000-4000-8000-000000000071' THEN RAISE EXCEPTION 'Wrong warehouse/stop order'; END IF;
 IF has_function_privilege('authenticated','planned_route_write_v1(uuid,uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text)','EXECUTE')
  OR has_function_privilege('anon','planned_route_context_v1(uuid,boolean)','EXECUTE')
  OR NOT has_function_privilege('service_role','planned_route_write_v1(uuid,uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text)','EXECUTE') THEN RAISE EXCEPTION 'RPC grants wrong'; END IF;
 BEGIN
  PERFORM planned_route_write_v1('00000000-0000-4000-8000-000000000002',a,'CLAIM',token,ctx->>'context_token',repeat('a',64));
  RAISE EXCEPTION 'Trucker must not claim'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Existing remaining cache survives planned claims and finishes byte-for-byte,
 -- excluding only the explicitly shared usage counters.
 INSERT INTO trip_route_cache(assignment_id,destination_fingerprint,route_geometry,revision,calculated_at,next_routine_at,distance_meters,duration_seconds)
 VALUES(a,repeat('b',64),'{"type":"LineString","coordinates":[[123,10],[124,11]]}',7,clock_timestamp(),clock_timestamp()+interval '1 hour',100,20);
 SELECT to_jsonb(r)-ARRAY['planned_fingerprint','planned_geometry','planned_calculated_at','planned_expires_at','planned_distance_meters','planned_duration_seconds','planned_lease_token','planned_lease_expires_at','planned_retry_after','planned_error','planned_revision','directions_requests','request_window','window_requests'] INTO original FROM trip_route_cache r WHERE assignment_id=a;
 result:=planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('a',64));IF NOT result THEN RAISE EXCEPTION 'Claim failed without GPS'; END IF;
 result:=planned_route_write_v1(actor,a,'CLAIM','00000000-0000-4000-8000-000000000091',ctx->>'context_token',repeat('a',64));IF result THEN RAISE EXCEPTION 'Duplicate lease succeeded'; END IF;
 result:=planned_route_write_v1(actor,a,'FINISH',token,ctx->>'context_token',repeat('a',64),p_geometry:='{"type":"LineString","coordinates":[[122,9],[122.5,9.5],[124,11],[123,10]]}',p_distance:=200,p_duration:=40);IF NOT result THEN RAISE EXCEPTION 'Finish failed'; END IF;
 IF original IS DISTINCT FROM (SELECT to_jsonb(r)-ARRAY['planned_fingerprint','planned_geometry','planned_calculated_at','planned_expires_at','planned_distance_meters','planned_duration_seconds','planned_lease_token','planned_lease_expires_at','planned_retry_after','planned_error','planned_revision','directions_requests','request_window','window_requests'] FROM trip_route_cache r WHERE assignment_id=a) THEN RAISE EXCEPTION 'Remaining cache changed'; END IF;
 IF NOT EXISTS(SELECT FROM trip_route_cache WHERE planned_expires_at>planned_calculated_at AND planned_expires_at-planned_calculated_at<=interval '1 hour 1 second') THEN RAISE EXCEPTION 'Expiry missing'; END IF;
 SELECT planned_revision INTO expected_revision FROM trip_route_cache WHERE assignment_id=a;
 PERFORM planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('a',64),expected_revision);
 before_token:=ctx->>'context_token';UPDATE warehouses SET longitude=121.5;
 IF (planned_route_context_v1(a,false)->>'context_token')=before_token THEN RAISE EXCEPTION 'Warehouse did not invalidate'; END IF;
 IF planned_route_write_v1(actor,a,'FINISH',token,before_token,repeat('a',64),p_geometry:='{"type":"LineString","coordinates":[[122,9],[124,11]]}',p_distance:=10,p_duration:=1) THEN RAISE EXCEPTION 'Stale context committed'; END IF;
 PERFORM planned_route_write_v1(actor,a,'FAIL',token,NULL,NULL,p_error:='ROUTE_UNAVAILABLE');
 IF NOT EXISTS(SELECT FROM trip_route_cache WHERE planned_geometry IS NOT NULL AND planned_error='ROUTE_UNAVAILABLE') THEN RAISE EXCEPTION 'Failed refresh destroyed cache'; END IF;
 -- Clear only synthetic retry metadata, then test shared budget against both RPCs.
 UPDATE trip_route_cache SET planned_retry_after=NULL,request_window=date_trunc('minute',clock_timestamp()),window_requests=30;
 ctx:=planned_route_context_v1(a,false);SELECT planned_revision INTO expected_revision FROM trip_route_cache WHERE assignment_id=a;
 IF planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('a',64),expected_revision) THEN RAISE EXCEPTION 'Shared budget bypass'; END IF;
 IF EXISTS(SELECT FROM trip_tracking_locations) THEN RAISE EXCEPTION 'Planned routing wrote GPS'; END IF;
END $$;
DO $$
DECLARE ctx jsonb; a uuid:='00000000-0000-4000-8000-000000000050'; actor uuid:='00000000-0000-4000-8000-000000000004'; token uuid:='00000000-0000-4000-8000-000000000094'; old_context text;
BEGIN
 UPDATE trip_route_cache SET planned_retry_after=NULL,request_window=NULL,window_requests=0;
 old_context:=planned_route_context_v1(a,false)->>'context_token';
 UPDATE trip_stops SET stop_sequence=99 WHERE id='00000000-0000-4000-8000-000000000071';
 IF planned_route_context_v1(a,false)->>'context_token'=old_context THEN RAISE EXCEPTION 'Stop order failed to invalidate'; END IF;
 UPDATE trip_stops SET stop_sequence=1 WHERE id='00000000-0000-4000-8000-000000000071';
 UPDATE warehouses SET latitude=NULL;
 ctx:=planned_route_context_v1(a,false);
 BEGIN PERFORM planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('d',64),3); RAISE EXCEPTION 'Missing warehouse accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE warehouses SET latitude=9;
 UPDATE customer_stores SET longitude=NULL WHERE id='00000000-0000-4000-8000-000000000060';
 ctx:=planned_route_context_v1(a,false);
 BEGIN PERFORM planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('d',64),3); RAISE EXCEPTION 'Missing store accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE customer_stores SET longitude=123 WHERE id='00000000-0000-4000-8000-000000000060';
 INSERT INTO trip_stops(id,trip_id,store_id,stop_sequence,delivery_status)
 SELECT ('00000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000060',i+3,'PENDING' FROM generate_series(1,23) i;
 ctx:=planned_route_context_v1(a,false);
 BEGIN PERFORM planned_route_write_v1(actor,a,'CLAIM',token,ctx->>'context_token',repeat('d',64),3); RAISE EXCEPTION 'Over-limit trip accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Retain synthetic overflow stops as archives rather than deleting records.
 UPDATE trip_stops SET archived_at=clock_timestamp() WHERE id::text LIKE '00000000-0000-4000-8001-%';
 IF EXISTS(SELECT FROM fixture_original_rpcs f JOIN pg_proc p ON p.oid=to_regprocedure(f.signature) WHERE pg_get_functiondef(p.oid)<>f.definition) THEN RAISE EXCEPTION 'Existing RPC definition changed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_class WHERE oid='trip_route_cache'::regclass AND relrowsecurity) OR has_table_privilege('authenticated','trip_route_cache','SELECT') THEN RAISE EXCEPTION 'Privacy boundary changed'; END IF;
 IF EXISTS(SELECT FROM trip_tracking_locations) THEN RAISE EXCEPTION 'GPS mutated'; END IF;
END $$;
-- Existing RPC still has its original signature and original-cache behavior.
SELECT 'planned route separation, scope, ordering, expiry, grants, stale context, budget and no GPS passed' AS result;
