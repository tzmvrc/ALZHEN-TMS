-- One scalar JSON array avoids PostgREST's row cap truncating multi-truck projections.
-- The existing set-returning function remains the single source of business logic.
CREATE OR REPLACE FUNCTION public.read_confirmed_operational_state_batch_v1(p_trips uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF p_trips IS NULL OR cardinality(p_trips)>200 THEN RAISE EXCEPTION 'Choose at most 200 trips per progress batch.' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'assignment_id',x->>'trip_stop_id'),'[]'::jsonb) INTO result FROM public.read_confirmed_operational_state_v1(p_trips) x;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_confirmed_operational_state_batch_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_confirmed_operational_state_batch_v1(uuid[]) TO service_role;
