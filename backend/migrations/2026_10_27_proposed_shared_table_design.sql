-- PROPOSAL: requires explicit approval. Existing layout storage is reused.
-- Existing rows receive empty design metadata; no business records are changed.
-- No grants, RLS, publications, indexes or existing width/revision rules change.
-- Recovery: deploy previous consumers; the unused additive column may remain.
-- Removing it later would lose design metadata and requires separate review.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.shared_table_column_widths
 ADD COLUMN design jsonb NOT NULL DEFAULT '{}'::jsonb
 CONSTRAINT shared_table_column_design_check CHECK (
  jsonb_typeof(design)='object' AND octet_length(design::text)<=262144
 );
COMMIT;
