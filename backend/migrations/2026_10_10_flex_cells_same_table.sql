-- Proposal: enforce that every flexible cell's row and column share one table.
-- This migration has not been executed. Review and apply manually after backup.

CREATE OR REPLACE FUNCTION public.enforce_flex_cell_same_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  row_table_id uuid;
  column_table_id uuid;
BEGIN
  SELECT table_id INTO row_table_id
  FROM public.flex_rows
  WHERE id = NEW.row_id;

  SELECT table_id INTO column_table_id
  FROM public.flex_columns
  WHERE id = NEW.column_id;

  IF row_table_id IS NULL
     OR column_table_id IS NULL
     OR row_table_id <> column_table_id THEN
    RAISE EXCEPTION 'Flexible cell row and column must belong to the same table'
      USING ERRCODE = '23514', CONSTRAINT = 'flex_cells_same_table_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flex_cells_same_table_check ON public.flex_cells;
CREATE TRIGGER flex_cells_same_table_check
BEFORE INSERT OR UPDATE OF row_id, column_id
ON public.flex_cells
FOR EACH ROW
EXECUTE FUNCTION public.enforce_flex_cell_same_table();
