create or replace view public.v_trip_route_labels as
select t.id as trip_id,
coalesce(nullif(btrim(w.name),''),'Warehouse not set') ||
coalesce(' '||chr(8594)||' '||destinations.labels,'') as route
from public.trips t
left join public.warehouses w on w.id=t.warehouse_id
left join lateral (
 select string_agg(coalesce(nullif(btrim(s.name),''),nullif(btrim(c.name),''),
 'Stop '||coalesce(st.stop_sequence::text,'(sequence unavailable)')),
 ' '||chr(8594)||' ' order by st.stop_sequence nulls last,st.id) labels
 from public.trip_stops st left join public.customer_stores s on s.id=st.store_id
 left join public.customers c on c.id=st.customer_id where st.trip_id=t.id
) destinations on true;
revoke all on public.v_trip_route_labels from public,anon,authenticated;
grant select on public.v_trip_route_labels to service_role;
notify pgrst,'reload schema';
