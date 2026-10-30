-- The Master List delivery columns read POD values through the server client.
-- Keep this grant limited to the server role; no browser role receives access.
GRANT SELECT ON TABLE public.pod_records TO service_role;
