-- Shared presentation preferences only. No operational records or local
-- preferences are copied/backfilled. Rollback: stop API consumers; retain
-- this table to preserve saved widths. Direct browser access is denied.
BEGIN;
CREATE TABLE public.shared_table_column_widths (
  table_key text NOT NULL CHECK (length(table_key) BETWEEN 1 AND 120),
  column_key text NOT NULL CHECK (length(column_key) BETWEEN 1 AND 160),
  width_px integer NOT NULL CHECK (width_px BETWEEN 60 AND 1600),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (table_key, column_key)
);
ALTER TABLE public.shared_table_column_widths ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_table_column_widths FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shared_table_column_widths TO service_role;
COMMENT ON TABLE public.shared_table_column_widths IS
  'Shared Admin/Staff widths. Backend authorization and revision compare-and-swap required; no direct browser access.';
COMMIT;
