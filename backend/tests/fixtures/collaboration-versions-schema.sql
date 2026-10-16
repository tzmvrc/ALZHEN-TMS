-- NEW disposable database only. Representative schema, not production data.
DO $$ DECLARE source text; BEGIN
 FOREACH source IN ARRAY ARRAY['trips','trip_stops','trip_line_items','trip_truck_assignments','store_calls','billings'] LOOP
  EXECUTE format('CREATE TABLE public.%I(id uuid PRIMARY KEY, value text)',source);
 END LOOP;
END $$;
