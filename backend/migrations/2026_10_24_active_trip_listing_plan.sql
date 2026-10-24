-- Match active transaction semantics without planning the full report join.
create or replace view public.v_active_trip_listing as
select t.* from public.trips t
where t.archived_at is null and exists(
 select 1 from (values (1)) singleton(n)
 left join public.trip_truck_assignments a on a.trip_id=t.id and a.unassigned_at is null
 left join public.trip_stops s on s.trip_id=t.id and
 (a.id is null or a.stop_scope='ALL' or exists(
 select 1 from public.trip_assignment_stops responsibility
 where responsibility.assignment_id=a.id and responsibility.trip_stop_id=s.id))
 where s.archived_at is null
);
notify pgrst,'reload schema';
