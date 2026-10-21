-- Run through an approved PostgreSQL read-only connection; not applied by Codex.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname='public' AND viewname IN ('v_dispatch_monitoring','v_dispatch_report','v_trip_booking','vw_store_calling_tracker','v_store_calling','v_transmittal_tracker_page');
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('trips','trip_stops','trip_line_items','trip_truck_assignments','store_calls','flex_rows','flex_cells');
SELECT conrelid::regclass,confrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND (conrelid IN ('public.store_calls'::regclass,'public.trip_stops'::regclass) OR confrelid IN ('public.store_calls'::regclass,'public.trip_stops'::regclass));
SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.store_calls'::regclass,'public.trip_stops'::regclass);
SELECT relname,n_live_tup,n_dead_tup,seq_scan,idx_scan FROM pg_stat_user_tables WHERE relname IN ('trips','trip_stops','store_calls','trip_line_items','flex_rows','flex_cells');
SELECT state,wait_event_type,wait_event,count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type,wait_event;
SELECT count(*) FILTER(WHERE NOT granted) AS waiting_locks FROM pg_locks;
SELECT name,setting FROM pg_settings WHERE name IN ('max_connections','statement_timeout','idle_in_transaction_session_timeout');
EXPLAIN (FORMAT JSON) SELECT * FROM public.v_dispatch_monitoring ORDER BY loading_date DESC,trip_id,_trip_stop_id,_assignment_id LIMIT 50;
EXPLAIN (FORMAT JSON) SELECT * FROM public.v_dispatch_report ORDER BY loading_date DESC LIMIT 50;
EXPLAIN (FORMAT JSON) SELECT * FROM public.v_trip_booking ORDER BY loading_date DESC LIMIT 50;
EXPLAIN (FORMAT JSON) SELECT * FROM public.v_store_calling ORDER BY date_assigned DESC LIMIT 50;
EXPLAIN (FORMAT JSON) SELECT trip_stop_id FROM public.v_transmittal_tracker_page ORDER BY trip_stop_id LIMIT 50;
ROLLBACK;
