-- Preserve the installed writer, grants, assignment authorization and lock order.
-- Reuse its trip/assignment locks to make explicit destination departures once-only.
DO $migration$
DECLARE definition text; anchor text := ' if lat is not null or lng is not null then';
BEGIN
 SELECT pg_get_functiondef('public.submit_delivery_event_v1(uuid,uuid,uuid,jsonb)'::regprocedure) INTO definition;
 IF position('explicit_destination_transit_v1' IN definition)>0 THEN RETURN; END IF;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected delivery writer definition'; END IF;
 definition := replace(definition,anchor,$guard$
 -- explicit_destination_transit_v1: assignment/trip locks are already held.
 if k='IN_TRANSIT' then
  if sid is null then raise exception 'Choose the next assigned delivery stop.' using errcode='22023'; end if;
  select * into saved from public.trip_events where assignment_id=a.id and trip_stop_id=sid and event_type='IN_TRANSIT' order by event_time,id limit 1;
  if found then return to_jsonb(saved); end if;
  if exists(select 1 from public.trip_events where assignment_id=a.id and trip_stop_id=sid and event_type in ('ARRIVED','STOP_DEPARTURE')) then
   raise exception 'This destination has already been reached.' using errcode='P0409';
  end if;
 end if;
$guard$ || anchor);
 EXECUTE definition;
END $migration$;
