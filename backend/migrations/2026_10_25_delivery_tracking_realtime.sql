-- Relay latest-location changes between backend instances. No browser grants,
-- policies, historical telemetry publication or operational data changes.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'trip_tracking_locations') then
    alter publication supabase_realtime add table public.trip_tracking_locations;
  end if;
end $$;
