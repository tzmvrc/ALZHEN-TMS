-- PROPOSAL ONLY. Private latest fix/route data, not a new assignment source.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TABLE public.trip_tracking_locations (
 assignment_id uuid PRIMARY KEY REFERENCES public.trip_truck_assignments(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 tracking_session_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT true,
 consented_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz,
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180),
 accuracy_meters double precision CHECK(accuracy_meters>=0 AND accuracy_meters<100000),
 captured_at timestamptz, received_at timestamptz,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 CHECK ((latitude IS NULL AND longitude IS NULL AND captured_at IS NULL AND received_at IS NULL)
  OR (latitude IS NOT NULL AND longitude IS NOT NULL AND accuracy_meters IS NOT NULL AND captured_at IS NOT NULL AND received_at IS NOT NULL))
);
CREATE TABLE public.trip_route_cache (
 assignment_id uuid PRIMARY KEY REFERENCES public.trip_truck_assignments(id) ON DELETE CASCADE,
 destination_fingerprint text NOT NULL CHECK(destination_fingerprint ~ '^[a-f0-9]{64}$'),
 route_geometry jsonb CHECK(route_geometry IS NULL OR coalesce(jsonb_typeof(route_geometry)='object' AND route_geometry->>'type'='LineString' AND jsonb_typeof(route_geometry->'coordinates')='array',false)),
 calculated_at timestamptz, next_routine_at timestamptz,
 lease_token uuid, lease_expires_at timestamptz,
 retry_after timestamptz, last_error_code text,
 directions_requests integer NOT NULL DEFAULT 0 CHECK(directions_requests>=0),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
ALTER TABLE public.trip_tracking_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_route_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_tracking_locations,public.trip_route_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.trip_tracking_locations,public.trip_route_cache TO service_role;
COMMIT;
-- NO publication changes or direct browser grants. Protected APIs must derive
-- actor from JWT, verify current assignment and trip, then use session/revision
-- CAS. Marker invalidations go through authorized trip rooms; geometry lookup
-- uses destination fingerprint, per-assignment lease and ~hourly refresh.
-- API/RPC activation remains a separate reviewed checkpoint: tables alone do
-- not enforce assignment/capture ordering and must not be exposed generically.
-- Recovery: disable tracking/workers and revoke write grants; retain last known
-- positions/routes until approved retention/recovery decision. No old data changed.
