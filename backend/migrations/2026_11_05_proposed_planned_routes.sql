-- PROPOSAL ONLY. Do not apply without approval of this exact file/checksum.
-- Additive planned variant in the EXISTING assignment cache. No GPS, Storage,
-- publication, browser grants, operational backfill or remaining RPC replacement.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.trip_route_cache
 ADD COLUMN planned_fingerprint text CHECK(planned_fingerprint ~ '^[a-f0-9]{64}$'),
 ADD COLUMN planned_geometry jsonb,
 ADD COLUMN planned_calculated_at timestamptz,
 ADD COLUMN planned_expires_at timestamptz,
 ADD COLUMN planned_distance_meters double precision CHECK(planned_distance_meters BETWEEN 0 AND 1000000000),
 ADD COLUMN planned_duration_seconds double precision CHECK(planned_duration_seconds BETWEEN 0 AND 1000000000),
 ADD COLUMN planned_lease_token uuid,
 ADD COLUMN planned_lease_expires_at timestamptz,
 ADD COLUMN planned_retry_after timestamptz,
 ADD COLUMN planned_error text,
 ADD COLUMN planned_revision bigint NOT NULL DEFAULT 0 CHECK(planned_revision>=0);

-- Trip identity is obtained through the existing assignment FK, never a second
-- independently editable trip_id. Unlike GPS tracking, a planned assignment does
-- not need an enabled location session or a driver profile with a recent fix.
CREATE FUNCTION public.planned_route_context_v1(p_assignment uuid,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; t public.trips%ROWTYPE; w public.warehouses%ROWTYPE; origin jsonb; points jsonb;
BEGIN
 a:=public.tracking_assignment_v1(p_assignment,p_lock);
 IF a IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.trips WHERE id=(a->>'tripId')::uuid;
 IF p_lock THEN
  PERFORM 1 FROM public.trip_stops WHERE trip_id=t.id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.customer_stores WHERE id IN(SELECT store_id FROM public.trip_stops WHERE trip_id=t.id) ORDER BY id FOR SHARE;
  SELECT * INTO w FROM public.warehouses WHERE id=t.warehouse_id FOR SHARE;
 ELSE SELECT * INTO w FROM public.warehouses WHERE id=t.warehouse_id; END IF;
 origin:=jsonb_build_object('id',w.id,'latitude',w.latitude,'longitude',w.longitude);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'latitude',st.latitude,'longitude',st.longitude,'stopSequence',s.stop_sequence)
  ORDER BY s.stop_sequence NULLS LAST,s.id),'[]'::jsonb) INTO points
 FROM public.trip_stops s LEFT JOIN public.customer_stores st ON st.id=s.store_id
 WHERE s.trip_id=t.id AND s.archived_at IS NULL;
 RETURN jsonb_build_object('id',p_assignment,'tripId',t.id,
  'active',t.archived_at IS NULL AND t.status NOT IN('COMPLETED','CANCELLED') AND EXISTS(SELECT FROM public.trip_truck_assignments WHERE id=p_assignment AND unassigned_at IS NULL),
  'origin',origin,'destinations',points,
  'context_token',md5(jsonb_build_array(a,t.warehouse_id,origin,points)::text));
END $$;

CREATE FUNCTION public.planned_route_write_v1(p_actor uuid,p_assignment uuid,p_action text,p_token uuid,p_context text,p_fingerprint text,
 p_expected bigint DEFAULT 0,p_geometry jsonb DEFAULT NULL,p_distance double precision DEFAULT NULL,p_duration double precision DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx jsonb; r public.trip_route_cache%ROWTYPE; used integer; minute_start timestamptz:=date_trunc('minute',clock_timestamp()); point jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor AND role IN('ADMIN','STAFF') FOR SHARE) THEN
  RAISE EXCEPTION 'Management routing access required.' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('CLAIM','FINISH','FAIL') OR p_token IS NULL THEN
  RAISE EXCEPTION 'Invalid planned routing action.' USING ERRCODE='22023'; END IF;
 ctx:=public.planned_route_context_v1(p_assignment,true);
 IF p_action IN('CLAIM','FINISH') THEN
  IF ctx IS NULL OR NOT coalesce((ctx->>'active')::boolean,false) OR ctx->>'context_token' IS DISTINCT FROM p_context
   OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  IF jsonb_array_length(ctx->'destinations') NOT BETWEEN 1 AND 24 THEN
   RAISE EXCEPTION 'Planned route requires 1 to 24 delivery stops; none may be omitted.' USING ERRCODE='22023'; END IF;
  FOR point IN SELECT ctx->'origin' UNION ALL SELECT value FROM jsonb_array_elements(ctx->'destinations') LOOP
   IF jsonb_typeof(point->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(point->'longitude') IS DISTINCT FROM 'number'
    OR NOT((point->>'latitude')::numeric BETWEEN -90 AND 90 AND (point->>'longitude')::numeric BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Warehouse or delivery-stop coordinates missing or invalid.' USING ERRCODE='22023'; END IF;
  END LOOP;
 END IF;
 IF p_action='CLAIM' THEN
  -- Same advisory lock and SAME counters as existing remaining-route RPC: combined
  -- company-wide budget is 30 requests/minute, not 30 per route variant/replica.
  PERFORM pg_advisory_xact_lock(771004219);
  SELECT coalesce(sum(window_requests),0) INTO used FROM public.trip_route_cache WHERE request_window=minute_start;
  IF used>=30 THEN RETURN false; END IF;
  SELECT * INTO r FROM public.trip_route_cache WHERE assignment_id=p_assignment FOR UPDATE;
  IF FOUND AND (r.planned_revision<>p_expected OR r.planned_lease_expires_at>clock_timestamp() OR r.planned_retry_after>clock_timestamp()) THEN RETURN false; END IF;
  IF NOT FOUND AND p_expected<>0 THEN RETURN false; END IF;
  -- Zero sentinel is used ONLY for a new remaining-cache placeholder; remaining
  -- route_geometry stays NULL. Its original revision/lease/fingerprint are never
  -- updated by a planned refresh of an existing row.
  INSERT INTO public.trip_route_cache(assignment_id,destination_fingerprint,planned_lease_token,planned_lease_expires_at,planned_revision,directions_requests,request_window,window_requests)
   VALUES(p_assignment,repeat('0',64),p_token,clock_timestamp()+interval '1 minute',1,1,minute_start,1)
  ON CONFLICT(assignment_id) DO UPDATE SET planned_lease_token=p_token,planned_lease_expires_at=clock_timestamp()+interval '1 minute',
   planned_revision=public.trip_route_cache.planned_revision+1,directions_requests=public.trip_route_cache.directions_requests+1,
   request_window=minute_start,window_requests=CASE WHEN public.trip_route_cache.request_window=minute_start THEN public.trip_route_cache.window_requests+1 ELSE 1 END;
  RETURN true;
 END IF;
 SELECT * INTO r FROM public.trip_route_cache WHERE assignment_id=p_assignment FOR UPDATE;
 IF NOT FOUND OR r.planned_lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF p_action='FAIL' THEN
  UPDATE public.trip_route_cache SET planned_lease_token=NULL,planned_lease_expires_at=NULL,
   planned_retry_after=clock_timestamp()+CASE WHEN p_error='ROUTE_RATE_LIMITED' THEN interval '5 minutes' ELSE interval '1 minute' END,
   planned_error=left(coalesce(p_error,'ROUTE_UNAVAILABLE'),100),planned_revision=planned_revision+1 WHERE assignment_id=p_assignment;
  RETURN true;
 END IF;
 IF r.planned_lease_expires_at IS NULL OR r.planned_lease_expires_at<clock_timestamp() THEN RETURN false; END IF;
 IF p_geometry IS NULL OR p_geometry->>'type' IS DISTINCT FROM 'LineString' OR jsonb_typeof(p_geometry->'coordinates') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_geometry->'coordinates') NOT BETWEEN 2 AND 20000 OR octet_length(p_geometry::text)>1048576
  OR p_distance IS NULL OR p_duration IS NULL OR NOT(p_distance BETWEEN 0 AND 1000000000 AND p_duration BETWEEN 0 AND 1000000000) THEN
  RAISE EXCEPTION 'Invalid planned road route.' USING ERRCODE='22023'; END IF;
 FOR point IN SELECT value FROM jsonb_array_elements(p_geometry->'coordinates') LOOP
  IF jsonb_typeof(point) IS DISTINCT FROM 'array' OR jsonb_array_length(point)<>2
   OR jsonb_typeof(point->0) IS DISTINCT FROM 'number' OR jsonb_typeof(point->1) IS DISTINCT FROM 'number'
   OR NOT((point->>0)::numeric BETWEEN -180 AND 180 AND (point->>1)::numeric BETWEEN -90 AND 90) THEN
   RAISE EXCEPTION 'Invalid planned route coordinate order or bounds.' USING ERRCODE='22023'; END IF;
 END LOOP;
 UPDATE public.trip_route_cache SET planned_fingerprint=p_fingerprint,planned_geometry=p_geometry,
  planned_distance_meters=p_distance,planned_duration_seconds=p_duration,planned_calculated_at=clock_timestamp(),planned_expires_at=clock_timestamp()+interval '1 hour',
  planned_lease_token=NULL,planned_lease_expires_at=NULL,planned_retry_after=NULL,planned_error=NULL,planned_revision=planned_revision+1
 WHERE assignment_id=p_assignment;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.planned_route_context_v1(uuid,boolean),public.planned_route_write_v1(uuid,uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planned_route_context_v1(uuid,boolean),public.planned_route_write_v1(uuid,uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text) TO service_role;
COMMIT;
-- Verification / rollback: docs/planned-route-approval.md. Existing RLS, PK/FK,
-- remaining functions, table grants and Realtime publications are unchanged.
