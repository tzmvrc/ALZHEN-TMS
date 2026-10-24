-- PREPARED ONLY. NOT EXECUTED. Retires only the five graphs from home_fleet_demo.sql.
-- Review the current impact before running. Any new/shared dependency aborts everything.
-- Uses the existing authorized whole-trip deletion function; never disables guards.
-- Normal deletion journals / audit history remain. There are no demo Storage files.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $cleanup$
DECLARE
 reviewer constant uuid := '8eaf7847-e806-493d-8338-ac0412153245';
 owned uuid[] := '{}'; trip_ids uuid[] := '{}'; live_ids uuid[]; prefix text;
 suffix integer; scenario integer; relation record; unexpected boolean; impact jsonb; n integer;
 master_tables text[] := ARRAY['customers','trucking_companies','trucks','drivers','warehouses','customer_stores','products','trip_types'];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_FLEET_DEMO_V1'));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN') THEN RAISE EXCEPTION 'Existing Admin reviewer required'; END IF;
 FOR scenario IN 1..5 LOOP
  prefix := 'f1241024-'||lpad(scenario::text,4,'0')||'-4000-8000-';
  FOREACH suffix IN ARRAY ARRAY[1,2,3,4,5,6,11,12,21,22,23,100,101,111,112,121,122,123,124,131,132,133,134,141,142,151,152,153,154,155,161] LOOP
   owned := array_append(owned,(prefix||lpad(suffix::text,12,'0'))::uuid);
  END LOOP;
  trip_ids := array_append(trip_ids,(prefix||'000000000100')::uuid);
  IF EXISTS(SELECT 1 FROM public.trips WHERE id=(prefix||'000000000100')::uuid
    AND (dispatch_number IS DISTINCT FROM 'DEMO-FLEET-'||scenario||'-20261024' OR coalesce(remarks,'') NOT LIKE '%[ALZHEN_FLEET_DEMO_V1]%')) THEN
   RAISE EXCEPTION 'Demo trip identity changed; cleanup blocked';
  END IF;
 END LOOP;
 -- Do not allow deleting real driver-update rows: legacy driver_id has no FK.
 IF EXISTS(SELECT 1 FROM public.driver_trip_updates WHERE driver_id=ANY(owned)
   AND (NOT(id=ANY(owned)) OR coalesce(notes,'') NOT LIKE '%[ALZHEN_FLEET_DEMO_V1]%' OR pod_image_path IS NOT NULL OR pod_image_url IS NOT NULL)) THEN
  RAISE EXCEPTION 'Driver now has additional activity or attachments; cleanup blocked';
 END IF;
 -- Reject foreign records referencing any dedicated master, even ON DELETE SET NULL relationships.
 FOR relation IN
  SELECT cn.nspname child_schema,cc.relname child_table,ca.attname child_column,
         pn.nspname parent_schema,pc.relname parent_table,pa.attname parent_column
  FROM pg_constraint c JOIN pg_class cc ON cc.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=cc.relnamespace
  JOIN pg_class pc ON pc.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pc.relnamespace
  JOIN pg_attribute ca ON ca.attrelid=cc.oid AND ca.attnum=c.conkey[1]
  JOIN pg_attribute pa ON pa.attrelid=pc.oid AND pa.attnum=c.confkey[1]
  WHERE c.contype='f' AND pn.nspname='public' AND pc.relname=ANY(master_tables)
   AND array_length(c.conkey,1)=1
 LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=relation.child_schema AND table_name=relation.child_table AND column_name='id') THEN
   RAISE EXCEPTION 'Cannot prove ownership for referencing table %; review manually',relation.child_table;
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I child JOIN %I.%I parent ON child.%I=parent.%I WHERE parent.id=ANY($1) AND NOT(child.id::text=ANY($2)))',
   relation.child_schema,relation.child_table,relation.parent_schema,relation.parent_table,relation.child_column,relation.parent_column)
   INTO unexpected USING owned,owned::text[];
  IF unexpected THEN RAISE EXCEPTION 'Shared dependency in %; demo masters preserved',relation.child_table; END IF;
 END LOOP;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO live_ids FROM public.trips WHERE id=ANY(trip_ids);
 n := cardinality(live_ids);
 IF n>0 THEN
  FOREACH prefix IN ARRAY ARRAY['trip_stops','trip_line_items','trip_truck_assignments','trip_assignment_stops','trip_cargo_allocations','trip_events','driver_trip_updates'] LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE trip_id=ANY($1) AND NOT(id=ANY($2)))',prefix)
    INTO unexpected USING live_ids,owned;
   IF unexpected THEN RAISE EXCEPTION 'Additional records in %; cleanup blocked',prefix; END IF;
  END LOOP;
  impact := public.preview_whole_trip_deletion_v1(live_ids,reviewer);
  IF impact IS NULL OR jsonb_array_length(impact->'blockers')<>0
   OR (impact->'counts'->>'trip_stops')::integer<>n*2
   OR (impact->'counts'->>'trip_line_items')::integer<>n*4
   OR (impact->'counts'->>'trip_truck_assignments')::integer<>n
   OR (impact->'counts'->>'trip_events')::integer<>n*5
   OR (impact->'counts'->>'driver_trip_updates')::integer<>n
   OR EXISTS(SELECT 1 FROM jsonb_each_text(impact->'counts') WHERE value::numeric>0 AND key NOT IN
    ('trip_stops','trip_line_items','trip_truck_assignments','trip_events','driver_trip_updates','trip_assignment_stops','trip_cargo_allocations','cached_routes'))
  THEN RAISE EXCEPTION 'Demo impact changed or unrelated activity exists; cleanup blocked'; END IF;
  PERFORM public.delete_whole_trips_v1(live_ids,reviewer);
 END IF;
 -- Exact owned IDs only. Check tags before deleting masters. FK checks remain authoritative.
 FOREACH prefix IN ARRAY master_tables LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=ANY($1) AND coalesce(%I,'''') NOT LIKE ''%%[ALZHEN_FLEET_DEMO_V1]%%'')',prefix,CASE WHEN prefix='trip_types' THEN 'description' ELSE 'notes' END)
   INTO unexpected USING owned;
  IF unexpected THEN RAISE EXCEPTION 'Master ownership tag changed in %',prefix; END IF;
 END LOOP;
 DELETE FROM public.drivers WHERE id=ANY(owned);
 DELETE FROM public.trucks WHERE id=ANY(owned);
 DELETE FROM public.customer_stores WHERE id=ANY(owned);
 DELETE FROM public.products WHERE id=ANY(owned);
 DELETE FROM public.warehouses WHERE id=ANY(owned);
 DELETE FROM public.trip_types WHERE id=ANY(owned);
 DELETE FROM public.customers WHERE id=ANY(owned);
 DELETE FROM public.trucking_companies WHERE id=ANY(owned);
END;
$cleanup$;
COMMIT;
