-- Each related scope is already constrained to exactly one record. LIMIT 1
-- preserves that rule and prevents a flattened Cartesian nested-loop plan.
do $migration$
declare definition text; alias text;
begin
 definition:=rtrim(pg_get_viewdef('public.v_trip_master_csv'::regclass,true),E';\n ');
 foreach alias in array array['inc','bl','offl','pod','billing'] loop
  if position('LIMIT 1) '||alias||' ON true' in definition)>0 then continue; end if;
  if position(') '||alias||' ON true' in definition)=0 then raise exception 'Unexpected Master List lateral shape: %',alias; end if;
  definition:=replace(definition,') '||alias||' ON true',' LIMIT 1) '||alias||' ON true');
 end loop;
 execute 'create or replace view public.v_trip_master_csv as '||definition;
end $migration$;
create index if not exists spreadsheet_billings_trip_idx on public.billings(trip_id,id);
notify pgrst,'reload schema';
