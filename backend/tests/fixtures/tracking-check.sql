-- Disposable local PostgreSQL ONLY, after schema + both UNAPPLIED proposals.
DO $$
DECLARE actor uuid:='00000000-0000-4000-8000-000000000002';a uuid:='00000000-0000-4000-8000-000000000050';
 s uuid:=gen_random_uuid();old_session uuid;ctx jsonb;token uuid:=gen_random_uuid();f text:=repeat('a',64);result boolean;
BEGIN
 IF NOT public.tracking_write_v1(actor,a,0,s,'START') THEN RAISE EXCEPTION 'start'; END IF;
 IF NOT public.tracking_write_v1(actor,a,0,s,'CAPTURE',10,123,4,clock_timestamp()) THEN RAISE EXCEPTION 'capture'; END IF;
 IF public.tracking_write_v1(actor,a,0,s,'CAPTURE',10,123,4,now()-interval '1 second') THEN RAISE EXCEPTION 'old capture won'; END IF;
 BEGIN PERFORM public.tracking_write_v1('00000000-0000-4000-8000-000000000003',a,0,s,'CAPTURE',10,123,4,now());RAISE EXCEPTION 'unrelated driver accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 old_session:=s;s:=gen_random_uuid();PERFORM public.tracking_write_v1(actor,a,0,s,'START');
 IF public.tracking_write_v1(actor,a,0,old_session,'STOP') THEN RAISE EXCEPTION 'old tab stopped new session'; END IF;
 PERFORM public.tracking_write_v1(actor,a,0,s,'CAPTURE',10,123,4,clock_timestamp());
 ctx:=public.tracking_route_context_v1(a,false);
 IF ctx->'destinations'->0->>'id'<>'00000000-0000-4000-8000-000000000071' THEN RAISE EXCEPTION 'stop order'; END IF;
 IF NOT public.tracking_route_write_v1(a,'CLAIM',token,ctx->>'context_token',f,0) THEN RAISE EXCEPTION 'claim'; END IF;
 IF public.tracking_route_write_v1(a,'CLAIM',gen_random_uuid(),ctx->>'context_token',f,0) THEN RAISE EXCEPTION 'duplicate lease'; END IF;
 UPDATE customer_stores SET latitude=10.5 WHERE id='00000000-0000-4000-8000-000000000060';
 IF public.tracking_route_write_v1(a,'FINISH',token,ctx->>'context_token',f,0,'{"type":"LineString","coordinates":[[123,10],[124,11]]}',100,10) THEN RAISE EXCEPTION 'old destination route committed'; END IF;
 IF jsonb_array_length(public.tracking_feed_v1('00000000-0000-4000-8000-000000000001'))<>1 THEN RAISE EXCEPTION 'feed missing'; END IF;
 BEGIN PERFORM public.tracking_feed_v1(actor);RAISE EXCEPTION 'trucker management feed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.tracking_feed_v1('00000000-0000-4000-8000-000000000001',NULL,NULL);RAISE EXCEPTION 'unbounded feed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF has_function_privilege('authenticated','public.tracking_write_v1(uuid,uuid,bigint,uuid,text,double precision,double precision,double precision,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'browser GPS write exposed'; END IF;
 UPDATE trip_truck_assignments SET collaboration_version=1;
 BEGIN PERFORM public.tracking_write_v1(actor,a,0,s,'CAPTURE',10,123,4,clock_timestamp());RAISE EXCEPTION 'stale assignment revision';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT 'tracking atomic assertions passed' AS result;
