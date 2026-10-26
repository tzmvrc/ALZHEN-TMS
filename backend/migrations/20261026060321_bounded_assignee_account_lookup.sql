-- Applied to hdmknewarynwpbrhfgai; service-only bounded account eligibility.
-- The existing save-time authorization remains authoritative.
SET LOCAL lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.eligible_assignment_profile_ids_v1(p_ids uuid[])
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF coalesce(cardinality(p_ids),0)>500 THEN RAISE EXCEPTION 'At most 500 candidate profiles are supported'; END IF;
 RETURN QUERY SELECT u.id FROM auth.users u WHERE u.id=ANY(p_ids) AND u.banned_until IS NULL AND u.deleted_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.eligible_assignment_profile_ids_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_assignment_profile_ids_v1(uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';
