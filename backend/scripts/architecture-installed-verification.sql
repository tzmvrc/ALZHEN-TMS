-- Read-only installation verification; contains no operational writes.
SELECT 'view' AS kind,c.relname AS name,md5(replace(pg_get_viewdef(c.oid),chr(13),'')) AS hash
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_tms_combined','vw_store_calling_tracker','v_transmittal_tracker_page')
UNION ALL
SELECT 'function',p.proname,md5(replace(pg_get_functiondef(p.oid),chr(13),''))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('save_trip_cargo_allocations_v1','set_trip_assignment_stops_v1','update_assignment_stop_progress_v1','trip_for_source_binding_v1','trip_for_formula_target_v1','guard_trip_presentation_source_v1','guard_assignment_stop_history_v1','delete_whole_trips_v1','preview_whole_trip_deletion_v1','delete_store_call_record_v1','delete_empty_trip_stop_v1')
ORDER BY kind,name;
