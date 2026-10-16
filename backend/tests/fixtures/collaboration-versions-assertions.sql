BEGIN;
DO $$ DECLARE source text; actual bigint; BEGIN
 FOREACH source IN ARRAY ARRAY['trips','trip_stops','trip_line_items','trip_truck_assignments','store_calls','billings'] LOOP
  EXECUTE format('INSERT INTO public.%I(id,value) VALUES (''00000000-0000-4000-8000-000000000001'',''original'') RETURNING collaboration_version',source) INTO actual;
  IF actual<>0 THEN RAISE EXCEPTION 'Wrong initial version'; END IF;
  EXECUTE format('UPDATE public.%I SET value=''first'' RETURNING collaboration_version',source) INTO actual;
  IF actual<>1 THEN RAISE EXCEPTION 'First version not one'; END IF;
  EXECUTE format('UPDATE public.%I SET value=''second'',collaboration_version=0 RETURNING collaboration_version',source) INTO actual;
  IF actual<>2 THEN RAISE EXCEPTION 'Caller changed server version'; END IF;
 END LOOP;
END $$;
SAVEPOINT failed_write;
UPDATE trip_stops SET value='rolled back';
ROLLBACK TO failed_write;
DO $$ BEGIN
 IF (SELECT collaboration_version FROM trip_stops)<>2 THEN RAISE EXCEPTION 'Rolled-back update advanced version'; END IF;
 IF has_function_privilege('anon','public.bump_collaboration_version_v1()','EXECUTE') OR has_function_privilege('authenticated','public.bump_collaboration_version_v1()','EXECUTE') THEN RAISE EXCEPTION 'Helper exposed'; END IF;
END $$;
ROLLBACK;
