-- Disposable database only: proves original submitters, not last editors or delegates.
INSERT INTO backloads(id,trip_id,event_type,reason,created_by,submitted_by)
 SELECT fixture_id(800+n),fixture_id(1),'Backload','Fixture',fixture_id(90+n),fixture_id(93) FROM generate_series(1,3)n;
DO $$ BEGIN
 IF (SELECT count(*) FROM v_operations_report_page WHERE source_type='BACKLOAD' AND reported_by IN ('Alice Admin','Beth Staff','Carl Trucker'))<>3 THEN RAISE EXCEPTION 'Backload original attribution mismatch';END IF;
 IF (SELECT count(*) FROM v_operations_report_page WHERE source_type='BACKLOAD' AND search_text ILIKE '%Alice Admin%')<>1 THEN RAISE EXCEPTION 'Backload creator search mismatch';END IF;
 IF (SELECT reported_by FROM v_operations_report_page WHERE source_type='BACKLOAD' ORDER BY reported_by_sort NULLS LAST,source_record_id LIMIT 1)<>'Alice Admin' THEN RAISE EXCEPTION 'Backload sort mismatch';END IF;
 IF (SELECT reported_by FROM v_operations_report_page WHERE source_type='BACKLOAD' AND source_record_id=fixture_id(202)) IS NOT NULL THEN RAISE EXCEPTION 'Historical creator invented';END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='v_operations_report_page')<>28 THEN RAISE EXCEPTION 'Column contract changed';END IF;
 IF has_table_privilege('authenticated','v_operations_report_page','SELECT') THEN RAISE EXCEPTION 'Browser access broadened';END IF;
END $$;
SELECT 'Backload creator, search, sorting, historical fallback, 28-column contract and private grants passed' passed;
