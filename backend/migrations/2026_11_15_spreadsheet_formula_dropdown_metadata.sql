-- Phase 4. Additive metadata only. No operational values or historical rows are changed.
-- Existing service-only access, RLS, grants and admin change-signal triggers remain intact.
-- Rollback (separately authorized): remove these constraints/columns only after preserving
-- newly authored formula/color metadata; do not restore from an operational-data snapshot.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('alzhen_phase4_spreadsheet_metadata'));
ALTER TABLE public.flex_cells ADD COLUMN IF NOT EXISTS formula jsonb;
ALTER TABLE public.tms_dropdown_options ADD COLUMN IF NOT EXISTS color text;
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.flex_cells'::regclass AND conname='flex_cells_formula_metadata_check') THEN
  ALTER TABLE public.flex_cells ADD CONSTRAINT flex_cells_formula_metadata_check CHECK (
   formula IS NULL OR (jsonb_typeof(formula)='object' AND jsonb_typeof(formula->'expression')='string'
    AND length(formula->>'expression') BETWEEN 2 AND 2000 AND left(formula->>'expression',1)='='
    AND jsonb_typeof(formula->'references')='object' AND octet_length(formula::text)<=131072
    AND value IS NULL AND formula ? 'expression' AND formula ? 'references')
  );
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tms_dropdown_options'::regclass AND conname='tms_dropdown_options_color_check') THEN
  ALTER TABLE public.tms_dropdown_options ADD CONSTRAINT tms_dropdown_options_color_check CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
 END IF;
END $migration$;
COMMIT;
