DO $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.shared_table_column_widths WHERE table_key='trips' AND column_key='route' AND width_px=480 AND revision=3 AND design='{}'::jsonb) THEN RAISE EXCEPTION 'Existing width changed'; END IF;
 IF has_table_privilege('authenticated','public.shared_table_column_widths','SELECT') OR has_table_privilege('anon','public.shared_table_column_widths','SELECT') THEN RAISE EXCEPTION 'Unexpected public privilege'; END IF;
 BEGIN UPDATE public.shared_table_column_widths SET design='[]'; RAISE EXCEPTION 'Array accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
BEGIN;
UPDATE public.shared_table_column_widths SET design='{"color":"#abcdef","cells":{"stop-a":{"bold":true}}}' WHERE table_key='trips' AND column_key='route';
ROLLBACK;
DO $$ BEGIN IF (SELECT design FROM public.shared_table_column_widths WHERE table_key='trips' AND column_key='route')<>'{}'::jsonb THEN RAISE EXCEPTION 'Rollback failed'; END IF; END $$;
