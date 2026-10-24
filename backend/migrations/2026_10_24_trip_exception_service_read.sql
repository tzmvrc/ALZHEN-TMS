-- This legacy report was configured in the API but unreadable by its service role.
-- Browser roles stay unchanged; the existing authenticated report route gates access.
grant select on public.vw_trip_exceptions to service_role;
notify pgrst,'reload schema';
