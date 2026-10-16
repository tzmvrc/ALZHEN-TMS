-- Disposable database only; never run on Supabase or an existing database.
CREATE TABLE public.shared_table_column_widths(
 table_key text NOT NULL CHECK(length(table_key) BETWEEN 1 AND 120),
 column_key text NOT NULL CHECK(length(column_key) BETWEEN 1 AND 160),
 width_px integer NOT NULL CHECK(width_px BETWEEN 60 AND 1600),
 revision integer NOT NULL CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid,
 PRIMARY KEY(table_key,column_key));
ALTER TABLE public.shared_table_column_widths ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.shared_table_column_widths TO service_role;
INSERT INTO public.shared_table_column_widths(table_key,column_key,width_px,revision) VALUES('trips','route',480,3);
