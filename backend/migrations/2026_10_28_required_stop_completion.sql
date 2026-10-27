-- A selected-stop convoy cannot close the parent while another required stop
-- has no truck responsibility. This changes no historical source records.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.refresh_confirmed_delivery_state_v1(uuid)'::regprocedure) INTO definition;
 IF position('required.trip_id=p_trip' in definition)=0 THEN
 definition:=replace(definition,
  'THEN ''COMPLETED'' ELSE ''IN_PROGRESS'' END;',
  'AND NOT EXISTS(SELECT 1 FROM public.trip_stops required WHERE required.trip_id=p_trip AND required.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(states) saved WHERE (saved->>''trip_stop_id'')::uuid=required.id)) THEN ''COMPLETED'' ELSE ''IN_PROGRESS'' END;');
 END IF;
 EXECUTE definition;
END $migration$;
