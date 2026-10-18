CREATE FUNCTION fixture_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
ALTER TABLE backloads ADD created_by uuid, ADD submitted_by uuid;
ALTER TABLE profiles ADD role text;
-- Disposable ONLY. Role distribution is deliberately varied.

INSERT INTO profiles VALUES(fixture_id(91),'Alice','Admin','ADMIN'),(fixture_id(92),'Beth','Staff','STAFF'),(fixture_id(93),'Carl','Trucker','TRUCKER');
UPDATE offloads SET created_by=CASE WHEN right(id::text,3)::int%3=0 THEN fixture_id(91) WHEN right(id::text,3)::int%3=1 THEN fixture_id(92) END,
 submitted_by=fixture_id(93),reported_by=fixture_id(92);
UPDATE offloads SET created_by=NULL,submitted_by=NULL,reported_by=fixture_id(91) WHERE id='00000000-0000-4000-8000-000000000103';
DO $$ DECLARE count_expected integer;BEGIN
 IF EXISTS(SELECT FROM v_operations_report_page v JOIN offloads o ON o.id=v.source_record_id LEFT JOIN profiles p ON p.id=coalesce(o.created_by,o.submitted_by) WHERE v.source_type='OFFLOAD' AND v.reported_by IS DISTINCT FROM nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'')) THEN RAISE EXCEPTION 'Original attribution mismatch';END IF;
 SELECT count(*) INTO count_expected FROM offloads WHERE coalesce(created_by,submitted_by)=fixture_id(91);
 IF (SELECT count(*) FROM v_operations_report_page WHERE source_type='OFFLOAD' AND search_text ILIKE '%Alice Admin%')<>count_expected OR count_expected<25 THEN RAISE EXCEPTION 'Cross-page Admin search incorrect';END IF;
 IF (SELECT reported_by FROM v_operations_report_page WHERE source_record_id=fixture_id(103)) IS NOT NULL THEN RAISE EXCEPTION 'Missing creator invented';END IF;
 IF (SELECT reported_by FROM v_operations_report_page WHERE source_type='OFFLOAD' ORDER BY reported_by_sort NULLS LAST,source_record_id LIMIT 1) IS DISTINCT FROM 'Alice Admin' THEN RAISE EXCEPTION 'Creator sorting incorrect';END IF;
 IF (SELECT reported_by FROM v_operations_report_page WHERE source_type='OFFLOAD' AND reported_by IS NOT NULL ORDER BY reported_by_sort DESC LIMIT 1) IS DISTINCT FROM 'Carl Trucker' THEN RAISE EXCEPTION 'Trucker sorting incorrect';END IF;
 IF has_table_privilege('authenticated','v_operations_report_page','SELECT') OR NOT has_table_privilege('service_role','v_operations_report_page','SELECT') THEN RAISE EXCEPTION 'View grants changed';END IF;
END $$;
SELECT 'ADMIN/STAFF/TRUCKER original attribution, delegated reporter separation, unknown creator, global search and sort passed' AS passed;
