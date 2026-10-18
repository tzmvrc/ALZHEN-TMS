-- Disposable fixture ONLY, after Operations schema, original pagination and proposal.
INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000091','Original','Creator'),('00000000-0000-4000-8000-000000000092','Other','Reporter');
UPDATE offloads SET created_by='00000000-0000-4000-8000-000000000091',reported_by='00000000-0000-4000-8000-000000000092';
DO $$ BEGIN
 IF EXISTS(SELECT FROM v_operations_report_page WHERE source_type='OFFLOAD' AND reported_by IS DISTINCT FROM 'Original Creator') THEN RAISE EXCEPTION 'Delegate replaced actual creator'; END IF;
 IF (SELECT count(*) FROM v_operations_report_page WHERE source_type='OFFLOAD' AND search_text ILIKE '%Original Creator%')<>125 THEN RAISE EXCEPTION 'Creator search failed across pages'; END IF;
END $$;
UPDATE offloads SET created_by=NULL,submitted_by=NULL;
DO $$ BEGIN IF EXISTS(SELECT FROM v_operations_report_page WHERE source_type='OFFLOAD' AND reported_by IS NOT NULL) THEN RAISE EXCEPTION 'Unknown creator fabricated from reporter'; END IF;END $$;
