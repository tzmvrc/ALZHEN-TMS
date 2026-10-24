-- Parent display references are returned with a page, avoiding a second network
-- lookup and allowing Trip No. sorting to use the identifier users actually see.
do $migration$
declare name text; definition text; trip_column text;
begin
 foreach name in array array['v_tms_combined','v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_store_calling','vw_store_calling_tracker','v_trip_source_master','v_trip_master_csv'] loop
  if to_regclass('public.'||name) is null then continue; end if;
  if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||name) and attname='_parent_trip_reference' and not attisdropped) then continue; end if;
  select attname into trip_column from pg_attribute where attrelid=to_regclass('public.'||name) and attname in ('_trip_id','trip_id') and atttypid='uuid'::regtype order by attname limit 1;
  if trip_column is null then continue; end if;
  definition:=rtrim(pg_get_viewdef(to_regclass('public.'||name),true),E';\n ');
  execute format('create or replace view public.%I as select m.*,parent.trip_reference _parent_trip_reference,parent.dispatch_number _parent_dispatch_number,parent.transaction_number _parent_transaction_number,parent.warehouse_id _parent_warehouse_id,parent.departure_from_warehouse_at _parent_departure_at from (%s) m left join public.trips parent on parent.id=m.%I',name,definition,trip_column);
 end loop;
end $migration$;
notify pgrst,'reload schema';
