-- Run after operations-pagination.sql and the proposal, in a disposable DB only.
DO $$
BEGIN
 IF (SELECT count(*) FROM v_operations_report_page)<>128 THEN RAISE EXCEPTION 'source count/multiplication'; END IF;
 IF (SELECT count(DISTINCT (source_type,source_record_id)) FROM v_operations_report_page)<>128 THEN RAISE EXCEPTION 'duplicate physical IDs'; END IF;
 IF (SELECT count(*) FROM v_operations_report_page WHERE search_text ILIKE '%Needle%')<>1 THEN RAISE EXCEPTION 'global search'; END IF;
 IF (SELECT count(*) FROM v_operations_report_page WHERE report_type='Offload')<>125 THEN RAISE EXCEPTION 'classification filter'; END IF;
 IF (SELECT count(*) FROM (SELECT source_record_id FROM v_operations_report_page ORDER BY source_type,source_record_id LIMIT 25 OFFSET 50) p)<>25 THEN RAISE EXCEPTION 'third page'; END IF;
 IF (SELECT count(*) FROM (SELECT source_record_id FROM v_operations_report_page ORDER BY source_type,source_record_id LIMIT 25 OFFSET 125) p)<>3 THEN RAISE EXCEPTION 'last page beyond 100'; END IF;
 IF EXISTS(SELECT FROM v_operations_report_page WHERE plate_number IS NOT NULL OR driver_name IS NOT NULL) THEN RAISE EXCEPTION 'ambiguous assignment'; END IF;
 IF (SELECT quantity FROM v_operations_report_page WHERE source_record_id='00000000-0000-4000-8000-000000000174')<>0 THEN RAISE EXCEPTION 'zero lost'; END IF;
 IF (SELECT dr_number FROM v_operations_report_page WHERE source_record_id='00000000-0000-4000-8000-000000000174')<>'DR-2' THEN RAISE EXCEPTION 'stop identity'; END IF;
 IF has_table_privilege('authenticated','v_operations_report_page','SELECT') OR has_table_privilege('anon','v_operations_report_page','SELECT') THEN RAISE EXCEPTION 'browser grant'; END IF;
 IF NOT has_table_privilege('service_role','v_operations_report_page','SELECT') THEN RAISE EXCEPTION 'service grant'; END IF;
 IF NOT (operations_natural_sort_v1('DSP-2')<operations_natural_sort_v1('DSP-10')) THEN RAISE EXCEPTION 'numeric-aware sort'; END IF;
 IF NOT (operations_natural_sort_v1('DR 0')<operations_natural_sort_v1('DR 1')) THEN RAISE EXCEPTION 'zero sort'; END IF;
 IF has_function_privilege('authenticated','operations_natural_sort_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'browser helper grant'; END IF;
END $$;
BEGIN;
INSERT INTO operations_report_conversions VALUES('OFFLOAD','00000000-0000-4000-8000-000000000174');
DO $$ BEGIN IF EXISTS(SELECT FROM v_operations_report_page WHERE source_type='OFFLOAD' AND source_record_id='00000000-0000-4000-8000-000000000174') THEN RAISE EXCEPTION 'converted source visible'; END IF; END $$;
ROLLBACK;
SET ROLE service_role;
SELECT count(*) AS service_visible_rows FROM public.v_operations_report_page;
RESET ROLE;
EXPLAIN (ANALYZE,BUFFERS) SELECT source_type,source_record_id FROM public.v_operations_report_page WHERE report_type='Offload' AND search_text ILIKE '%Needle%' ORDER BY date DESC NULLS LAST,source_type,source_record_id LIMIT 25 OFFSET 0;
