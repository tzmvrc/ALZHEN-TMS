-- Move quick-filter predicates into PostgreSQL, before range/count.
create or replace view public.v_trip_filter_flags as
select t.id trip_id,
upper(btrim(coalesce(t.status,''))) not in ('CANCELLED','CANCELED','CLOSED','ARCHIVED','REJECTED')
and (case when exists(select 1 from public.trip_stops s where s.trip_id=t.id)
then exists(select 1 from public.trip_stops s where s.trip_id=t.id and s.departure_time is null and coalesce(s.delivery_status,'') !~* 'COMPLET|DELIVER|FINISH')
else upper(btrim(coalesce(t.status,''))) not in ('COMPLETED','CANCELLED','CANCELED','CLOSED','FINISHED','ARCHIVED','REJECTED') end) as ongoing,
upper(coalesce(t.status,'')) in ('IN_PROGRESS','IN PROGRESS','IN_TRANSIT','IN TRANSIT','DISPATCHED','LOADING','UNLOADING','ONGOING','STARTED','DELAYED','ON_HOLD') in_progress,
upper(coalesce(t.status,'')) in ('COMPLETED','DELIVERED','DONE','CLOSED') completed,
exists(select 1 from public.offloads r where r.trip_id=t.id) offload,
exists(select 1 from public.backloads r where r.trip_id=t.id) backload,
exists(select 1 from public.demurrages r where r.trip_id=t.id) demurrage
from public.trips t;
revoke all on public.v_trip_filter_flags from public,anon,authenticated;
grant select on public.v_trip_filter_flags to service_role;
do $migration$
declare name text; definition text; trip_column text;
begin
 foreach name in array array['v_tms_combined','v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_store_calling','vw_store_calling_tracker','v_trip_source_master','v_trip_master_csv'] loop
  if to_regclass('public.'||name) is null then continue; end if;
  if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||name) and attname='_filter_ongoing' and not attisdropped) then continue; end if;
  select attname into trip_column from pg_attribute where attrelid=to_regclass('public.'||name) and attname in ('_trip_id','trip_id') and atttypid='uuid'::regtype order by attname limit 1;
  if trip_column is null then continue; end if;
  definition:=rtrim(pg_get_viewdef(to_regclass('public.'||name),true),E';\n ');
  execute format('create or replace view public.%I as select m.*,coalesce(f.ongoing,false) _filter_ongoing,coalesce(f.in_progress,false) _filter_in_progress,coalesce(f.completed,false) _filter_completed,coalesce(f.offload,false) _filter_offload,coalesce(f.backload,false) _filter_backload,coalesce(f.demurrage,false) _filter_demurrage from (%s) m left join public.v_trip_filter_flags f on f.trip_id=m.%I',name,definition,trip_column);
 end loop;
end $migration$;
create index if not exists spreadsheet_demurrages_trip_idx on public.demurrages(trip_id);
notify pgrst,'reload schema';
