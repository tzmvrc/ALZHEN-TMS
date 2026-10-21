-- PROPOSAL ONLY. Requires 2026_11_03_proposed_tracking_route_cache.sql first.
-- No operational backfill, browser grants, Storage or publication changes.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.trip_route_cache
 ADD COLUMN distance_meters double precision,
 ADD COLUMN duration_seconds double precision,
 ADD COLUMN request_window timestamptz,
 ADD COLUMN window_requests integer NOT NULL DEFAULT 0;

CREATE FUNCTION public.tracking_assignment_v1(p_id uuid,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.trip_truck_assignments%ROWTYPE; d public.drivers%ROWTYPE; t public.trips%ROWTYPE;
BEGIN
 IF p_lock THEN SELECT * INTO a FROM public.trip_truck_assignments WHERE id=p_id FOR UPDATE;
 ELSE SELECT * INTO a FROM public.trip_truck_assignments WHERE id=p_id; END IF;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_lock THEN
  SELECT * INTO d FROM public.drivers WHERE id=a.driver_id FOR SHARE;
  -- Parent row lock also blocks FK-checked new stop inserts until this context
  -- decision completes, preventing a phantom destination during finalization.
  SELECT * INTO t FROM public.trips WHERE id=a.trip_id FOR UPDATE;
 ELSE
  SELECT * INTO d FROM public.drivers WHERE id=a.driver_id;
  SELECT * INTO t FROM public.trips WHERE id=a.trip_id;
 END IF;
 RETURN jsonb_build_object('id',a.id,'tripId',a.trip_id,'profileId',d.profile_id,'revision',a.collaboration_version,
  'active',a.unassigned_at IS NULL AND t.archived_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED') AND d.profile_id IS NOT NULL);
END $$;

CREATE FUNCTION public.tracking_write_v1(p_actor uuid,p_assignment uuid,p_revision bigint,p_session uuid,p_action text,
 p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL,p_captured timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; previous public.trip_tracking_locations%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor AND role='TRUCKER' FOR SHARE) OR p_session IS NULL THEN
  RAISE EXCEPTION 'Tracking requires the authenticated trucker.' USING ERRCODE='42501'; END IF;
 a:=public.tracking_assignment_v1(p_assignment,true);
 IF p_action='STOP' THEN
  UPDATE public.trip_tracking_locations SET enabled=false,disabled_at=clock_timestamp(),revision=revision+1
   WHERE assignment_id=p_assignment AND profile_id=p_actor AND tracking_session_id=p_session AND enabled;
  RETURN FOUND;
 END IF;
 IF a IS NULL OR NOT (a->>'active')::boolean OR (a->>'profileId')::uuid<>p_actor OR (a->>'revision')::bigint<>p_revision THEN
  RAISE EXCEPTION 'Assignment changed or is not available to this trucker.' USING ERRCODE='42501'; END IF;
 IF p_action='START' THEN
  INSERT INTO public.trip_tracking_locations(assignment_id,profile_id,tracking_session_id) VALUES(p_assignment,p_actor,p_session)
  ON CONFLICT(assignment_id) DO UPDATE SET profile_id=p_actor,tracking_session_id=p_session,enabled=true,
   consented_at=clock_timestamp(),disabled_at=NULL,latitude=NULL,longitude=NULL,accuracy_meters=NULL,captured_at=NULL,received_at=NULL,
   revision=public.trip_tracking_locations.revision+1;
  RETURN true;
 END IF;
 IF p_action<>'CAPTURE' OR p_lat IS NULL OR p_lng IS NULL OR p_accuracy IS NULL OR p_captured IS NULL
  OR NOT(p_lat BETWEEN -90 AND 90) OR NOT(p_lng BETWEEN -180 AND 180) OR NOT(p_accuracy>=0 AND p_accuracy<100000)
  OR p_captured<clock_timestamp()-interval '2 minutes' OR p_captured>clock_timestamp()+interval '2 minutes' THEN
  RAISE EXCEPTION 'Invalid or stale GPS capture.' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.trip_tracking_locations WHERE assignment_id=p_assignment FOR UPDATE;
 IF NOT FOUND OR NOT previous.enabled OR previous.profile_id<>p_actor OR previous.tracking_session_id<>p_session
  OR previous.captured_at>=p_captured THEN RETURN false; END IF;
 IF previous.received_at>clock_timestamp()-interval '5 seconds' THEN RAISE EXCEPTION 'GPS rate limit reached.' USING ERRCODE='54000'; END IF;
 UPDATE public.trip_tracking_locations SET latitude=p_lat,longitude=p_lng,accuracy_meters=p_accuracy,
  captured_at=p_captured,received_at=clock_timestamp(),revision=revision+1 WHERE assignment_id=p_assignment;
 RETURN true;
END $$;

-- Context token changes on assignment, remaining stop order/status, or destination coordinates.
-- GPS origin is intentionally outside the token: marker movement never reroutes.
CREATE FUNCTION public.tracking_route_context_v1(p_assignment uuid,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; points jsonb; origin jsonb; plate text; dispatch text;
BEGIN
 a:=public.tracking_assignment_v1(p_assignment,p_lock); IF a IS NULL THEN RETURN NULL; END IF;
 IF p_lock THEN
  PERFORM 1 FROM public.trip_stops WHERE trip_id=(a->>'tripId')::uuid ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.customer_stores WHERE id IN (SELECT store_id FROM public.trip_stops WHERE trip_id=(a->>'tripId')::uuid) ORDER BY id FOR SHARE;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(st.name,'Destination'),'latitude',CASE WHEN coalesce((to_jsonb(st)->>'location_verified')::boolean,false) THEN st.latitude ELSE NULL END,'longitude',CASE WHEN coalesce((to_jsonb(st)->>'location_verified')::boolean,false) THEN st.longitude ELSE NULL END)
  ORDER BY s.stop_sequence,s.id),'[]'::jsonb) INTO points FROM public.trip_stops s
  LEFT JOIN public.customer_stores st ON st.id=s.store_id
  WHERE s.trip_id=(a->>'tripId')::uuid AND s.archived_at IS NULL AND coalesce(s.delivery_status,'PENDING') NOT IN ('COMPLETED','DELIVERED','CANCELLED');
 SELECT jsonb_build_object('id','position','latitude',l.latitude,'longitude',l.longitude,'captured_at',l.captured_at,
  'accuracy_meters',l.accuracy_meters,'revision',l.revision) INTO origin FROM public.trip_tracking_locations l
  WHERE l.assignment_id=p_assignment AND l.profile_id=(a->>'profileId')::uuid AND l.enabled AND l.captured_at IS NOT NULL;
 SELECT tr.plate_number,t.dispatch_number INTO plate,dispatch FROM public.trip_truck_assignments ta
  JOIN public.trucks tr ON tr.id=ta.truck_id JOIN public.trips t ON t.id=ta.trip_id WHERE ta.id=p_assignment;
 RETURN a||jsonb_build_object('destinations',points,'origin',origin,'plate_number',plate,'dispatch_number',dispatch,
  'context_token',md5(jsonb_build_array(a,points)::text));
END $$;

CREATE FUNCTION public.tracking_route_write_v1(p_assignment uuid,p_action text,p_token uuid,p_context text,p_fingerprint text,
 p_expected bigint DEFAULT 0,p_geometry jsonb DEFAULT NULL,p_distance double precision DEFAULT NULL,p_duration double precision DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx jsonb; r public.trip_route_cache%ROWTYPE; used integer; minute_start timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 ctx:=public.tracking_route_context_v1(p_assignment,true);
 IF p_action='CLAIM' THEN
  IF p_token IS NULL OR ctx IS NULL OR NOT (ctx->>'active')::boolean OR ctx->>'context_token' IS DISTINCT FROM p_context OR ctx->'origin'='null'::jsonb
   OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  -- Company-wide provider budget shared by all Node replicas; metadata only.
  PERFORM pg_advisory_xact_lock(771004219);
  SELECT coalesce(sum(window_requests),0) INTO used FROM public.trip_route_cache WHERE request_window=minute_start;
  IF used>=30 THEN RETURN false; END IF;
  SELECT * INTO r FROM public.trip_route_cache WHERE assignment_id=p_assignment FOR UPDATE;
  IF FOUND AND (r.revision<>p_expected OR r.lease_expires_at>clock_timestamp() OR r.retry_after>clock_timestamp()) THEN RETURN false; END IF;
  IF NOT FOUND AND p_expected<>0 THEN RETURN false; END IF;
  INSERT INTO public.trip_route_cache(assignment_id,destination_fingerprint,lease_token,lease_expires_at,revision,directions_requests,request_window,window_requests)
   VALUES(p_assignment,p_fingerprint,p_token,clock_timestamp()+interval '1 minute',1,1,minute_start,1)
  ON CONFLICT(assignment_id) DO UPDATE SET lease_token=p_token,lease_expires_at=clock_timestamp()+interval '1 minute',
   revision=public.trip_route_cache.revision+1,directions_requests=public.trip_route_cache.directions_requests+1,
   request_window=minute_start,window_requests=CASE WHEN public.trip_route_cache.request_window=minute_start THEN public.trip_route_cache.window_requests+1 ELSE 1 END;
  RETURN true;
 END IF;
 SELECT * INTO r FROM public.trip_route_cache WHERE assignment_id=p_assignment FOR UPDATE;
 IF NOT FOUND OR r.lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF p_action='FAIL' THEN
  UPDATE public.trip_route_cache SET lease_token=NULL,lease_expires_at=NULL,
   retry_after=clock_timestamp()+CASE WHEN p_error='ROUTE_RATE_LIMITED' THEN interval '5 minutes' ELSE interval '1 minute' END,
   last_error_code=left(p_error,100),revision=revision+1 WHERE assignment_id=p_assignment; RETURN true;
 END IF;
 IF p_action<>'FINISH' OR ctx IS NULL OR NOT (ctx->>'active')::boolean OR ctx->>'context_token' IS DISTINCT FROM p_context
  OR r.lease_expires_at<clock_timestamp() THEN RETURN false; END IF;
 IF p_geometry IS NULL OR p_geometry->>'type' IS DISTINCT FROM 'LineString' OR jsonb_typeof(p_geometry->'coordinates') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_geometry->'coordinates') NOT BETWEEN 2 AND 20000 OR octet_length(p_geometry::text)>1048576
  OR p_distance IS NULL OR p_duration IS NULL OR NOT(p_distance BETWEEN 0 AND 1000000000 AND p_duration BETWEEN 0 AND 1000000000) THEN
  RAISE EXCEPTION 'Invalid road route.' USING ERRCODE='22023'; END IF;
 UPDATE public.trip_route_cache SET destination_fingerprint=p_fingerprint,route_geometry=p_geometry,distance_meters=p_distance,duration_seconds=p_duration,
  calculated_at=clock_timestamp(),next_routine_at=clock_timestamp()+interval '1 hour',lease_token=NULL,lease_expires_at=NULL,
  retry_after=NULL,last_error_code=NULL,revision=revision+1 WHERE assignment_id=p_assignment;
 RETURN true;
END $$;

CREATE FUNCTION public.prune_tracking_v1() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DELETE FROM public.trip_tracking_locations WHERE coalesce(disabled_at,received_at,consented_at)<now()-interval '24 hours';
 DELETE FROM public.trip_route_cache r WHERE coalesce(calculated_at,lease_expires_at,request_window)<now()-interval '7 days' AND NOT EXISTS
  (SELECT 1 FROM public.trip_truck_assignments a JOIN public.trips t ON t.id=a.trip_id
   WHERE a.id=r.assignment_id AND a.unassigned_at IS NULL AND t.archived_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED'));
$$;
CREATE FUNCTION public.tracking_feed_v1(p_actor uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN
  RAISE EXCEPTION 'Management tracking access required.' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid tracking page size.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('context',public.tracking_route_context_v1(page.id,false),'cache',to_jsonb(r)) ORDER BY page.id),'[]'::jsonb)
 INTO result FROM (SELECT a.id FROM public.trip_truck_assignments a JOIN public.trips t ON t.id=a.trip_id
  JOIN public.trip_tracking_locations l ON l.assignment_id=a.id AND l.enabled AND l.captured_at IS NOT NULL
  JOIN public.drivers d ON d.id=a.driver_id AND d.profile_id=l.profile_id
  WHERE a.unassigned_at IS NULL AND t.archived_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED')
   AND (p_after IS NULL OR a.id>p_after) ORDER BY a.id LIMIT p_limit+1) page
 LEFT JOIN public.trip_route_cache r ON r.assignment_id=page.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tracking_assignment_v1(uuid,boolean),public.tracking_write_v1(uuid,uuid,bigint,uuid,text,double precision,double precision,double precision,timestamptz),
 public.tracking_route_context_v1(uuid,boolean),public.tracking_route_write_v1(uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text),public.prune_tracking_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_assignment_v1(uuid,boolean),public.tracking_write_v1(uuid,uuid,bigint,uuid,text,double precision,double precision,double precision,timestamptz),
 public.tracking_route_context_v1(uuid,boolean),public.tracking_route_write_v1(uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text),public.prune_tracking_v1() TO service_role;
REVOKE ALL ON FUNCTION public.tracking_feed_v1(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_feed_v1(uuid,uuid,integer) TO service_role;
COMMIT;
-- Rollback: disable TRACKING_ENABLED and worker, retain tables. No live test writes.
