create or replace view public.v_active_trip_listing as
select t.* from public.trips t where exists (
 select 1 from public.v_dispatch_monitoring m where m.trip_id=t.id and m.transaction_archived_at is null
);
revoke all on public.v_active_trip_listing from public,anon,authenticated;
grant select on public.v_active_trip_listing to service_role;
notify pgrst,'reload schema';
