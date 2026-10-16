SET ROLE service_role;
SELECT * FROM public.vw_pod_drive_files;
RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('service_role','public.pod_drive_files','SELECT') THEN RAISE EXCEPTION 'Base grants broadened'; END IF;
 IF has_table_privilege('authenticated','public.vw_pod_drive_files','SELECT') OR has_table_privilege('anon','public.vw_pod_drive_files','SELECT') THEN RAISE EXCEPTION 'Browser read broadened'; END IF;
 IF NOT has_table_privilege('service_role','public.vw_pod_drive_files','SELECT') THEN RAISE EXCEPTION 'View grant missing'; END IF;
END $$;
