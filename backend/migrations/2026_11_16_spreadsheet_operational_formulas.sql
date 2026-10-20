-- Phase 4.2: presentation-only operational formulas. No operational row updates.
-- Reversal requires separately preserving authored overlay metadata before dropping new objects.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('alzhen_spreadsheet_operational_formulas'));
CREATE TABLE public.spreadsheet_cell_formulas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_key text NOT NULL CHECK (length(table_key) BETWEEN 1 AND 120),
 row_identity text NOT NULL CHECK (length(row_identity) BETWEEN 1 AND 1000),
 column_key text NOT NULL CHECK (column_key ~ '^[a-zA-Z0-9_]+$'),
 formula_expression text,
 reference_bindings jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_deleted boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK (version>0 AND version<2147483647),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(table_key,row_identity,column_key),
 CHECK ((is_deleted AND formula_expression IS NULL) OR (NOT is_deleted AND left(formula_expression,1)='=' AND length(formula_expression) BETWEEN 2 AND 2000 AND formula_expression IS NOT NULL)),
 CHECK(jsonb_typeof(reference_bindings)='object' AND octet_length(reference_bindings::text)<=131072)
);
ALTER TABLE public.spreadsheet_cell_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY spreadsheet_formulas_management_read ON public.spreadsheet_cell_formulas FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND upper(role) IN ('ADMIN','STAFF')));
REVOKE ALL ON public.spreadsheet_cell_formulas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spreadsheet_cell_formulas TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.spreadsheet_cell_formulas TO service_role;
ALTER TABLE public.spreadsheet_cell_formulas REPLICA IDENTITY FULL;
CREATE FUNCTION public.save_spreadsheet_formulas_v1(p_actor uuid,p_table text,p_changes jsonb)
RETURNS SETOF public.spreadsheet_cell_formulas LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE change jsonb; current_version integer; changed public.spreadsheet_cell_formulas; ids uuid[]='{}'; bad_graph boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND upper(role) IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Formula access denied' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN ('trips','report:combined','report:dispatch-monitoring','report:dispatch','report:trip-booking','report:store-calling','report:pod-status','report:pod-drive-files','report:trip-exceptions','transmittal-tracker','operations')
 OR jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid formula batch' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('spreadsheet-formula:'||p_table));
 IF (SELECT count(*) FROM jsonb_array_elements(p_changes))<>(SELECT count(DISTINCT (c->>'row_identity',c->>'column_key')) FROM jsonb_array_elements(p_changes)c) THEN RAISE EXCEPTION 'Duplicate formula target' USING ERRCODE='22023'; END IF;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes) ORDER BY value->>'row_identity',value->>'column_key' LOOP
  SELECT version INTO current_version FROM public.spreadsheet_cell_formulas WHERE table_key=p_table AND row_identity=change->>'row_identity' AND column_key=change->>'column_key' FOR UPDATE;
  IF COALESCE(current_version,0)<>(change->>'expected_version')::integer THEN RAISE EXCEPTION 'Formula version conflict' USING ERRCODE='40001'; END IF;
  INSERT INTO public.spreadsheet_cell_formulas(table_key,row_identity,column_key,formula_expression,reference_bindings,is_deleted,created_by,updated_by)
  VALUES(p_table,change->>'row_identity',change->>'column_key',change->>'expression',COALESCE(change->'references','{}'::jsonb),change->>'expression' IS NULL,p_actor,p_actor)
  ON CONFLICT(table_key,row_identity,column_key) DO UPDATE SET formula_expression=EXCLUDED.formula_expression,reference_bindings=EXCLUDED.reference_bindings,is_deleted=EXCLUDED.is_deleted,version=spreadsheet_cell_formulas.version+1,updated_by=p_actor,updated_at=now()
  RETURNING * INTO changed;
  ids=array_append(ids,changed.id);
 END LOOP;
 -- Serialized graph validation includes the complete resulting batch, not a stale preview.
 WITH RECURSIVE edges AS (
  SELECT f.id a,g.id b FROM public.spreadsheet_cell_formulas f CROSS JOIN LATERAL jsonb_each(f.reference_bindings) r, public.spreadsheet_cell_formulas g
  WHERE g.table_key=f.table_key AND g.row_identity=r.value->>'rowId' AND g.column_key=r.value->>'columnId' AND NOT g.is_deleted AND f.table_key=p_table AND NOT f.is_deleted
 ), walk AS (
  SELECT a,b FROM edges
  UNION SELECT w.a,e.b FROM walk w JOIN edges e ON e.a=w.b
 ) SELECT EXISTS(SELECT 1 FROM walk WHERE a=b) INTO bad_graph;
 IF bad_graph THEN RAISE EXCEPTION 'Circular formula dependencies' USING ERRCODE='23514'; END IF;
 RETURN QUERY SELECT * FROM public.spreadsheet_cell_formulas WHERE id=ANY(ids);
END $fn$;
REVOKE ALL ON FUNCTION public.save_spreadsheet_formulas_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_spreadsheet_formulas_v1(uuid,text,jsonb) TO service_role;
DO $publication$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='spreadsheet_cell_formulas') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.spreadsheet_cell_formulas; END IF;
END $publication$;
COMMIT;
