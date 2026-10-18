-- PROPOSAL ONLY. Requires separate approval. Application retains receipt protection until activation.
-- Verify service-only RPC/journal privileges and run disposable parent/attachment tests.
-- Recovery: disable consumer; retain journal for pending Storage retries. Do not drop pending jobs.
-- Adds a durable, private cleanup journal and callable deletion transaction.
-- Installation deletes no operational data. Do not invoke with production
-- records for testing. Recovery: retain the journal/snapshots and disable the
-- new API consumer; deleted Storage bytes are not recoverable from SQL.
BEGIN;
CREATE TABLE public.backload_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backload_id uuid NOT NULL UNIQUE,
  trip_id uuid NOT NULL,
  trip_stop_id uuid,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('PENDING_STORAGE','COMPLETE')),
  storage_paths text[] NOT NULL DEFAULT '{}',
  snapshot jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((state='COMPLETE') = (completed_at IS NOT NULL))
);
CREATE INDEX backload_deletion_pending_idx ON public.backload_deletion_jobs(created_at, id) WHERE state='PENDING_STORAGE';
ALTER TABLE public.backload_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backload_deletion_jobs FROM anon, authenticated;
GRANT SELECT ON public.backload_deletion_jobs TO service_role;
GRANT UPDATE(state,attempts,last_error,completed_at) ON public.backload_deletion_jobs TO service_role;

CREATE FUNCTION public.delete_backload_with_cleanup_v1(p_backload_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_report public.backloads%ROWTYPE;
  v_job public.backload_deletion_jobs%ROWTYPE;
  v_receipts jsonb;
  v_items jsonb;
  v_paths text[];
  v_prefix text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role IN ('ADMIN','STAFF')) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only ADMIN or STAFF may delete Backload reports.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('backload_delete:'||p_backload_id::text,0));
  SELECT * INTO v_job FROM public.backload_deletion_jobs WHERE backload_id=p_backload_id;
  IF FOUND THEN RETURN to_jsonb(v_job); END IF;
  SELECT * INTO v_report FROM public.backloads WHERE id=p_backload_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Backload report not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.operations_report_conversions WHERE
    (source_type='BACKLOAD' AND source_id=p_backload_id) OR (target_type='BACKLOAD' AND target_id=p_backload_id)) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='This report is protected by conversion history.';
  END IF;
  -- Parent lock matches receipt/conversion writers. New receipt writes cannot
  -- attach after the deletion; failed uploads retain existing compensation.
  PERFORM id FROM public.report_receipts WHERE backload_id=p_backload_id FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb), coalesce(array_agg(storage_path ORDER BY id),'{}'::text[])
    INTO v_receipts,v_paths FROM public.report_receipts r WHERE backload_id=p_backload_id;
  v_prefix := 'operations/'||v_report.trip_id::text||'/backload/'||p_backload_id::text||'/';
  IF EXISTS (SELECT 1 FROM unnest(v_paths) p WHERE
      p IS NULL OR left(p,length(v_prefix))<>v_prefix OR substring(p from length(v_prefix)+1) !~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Receipt storage ownership requires review; nothing was deleted.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.report_receipts r WHERE r.backload_id IS DISTINCT FROM p_backload_id AND r.storage_path=ANY(v_paths)) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Receipt is shared by another report; nothing was deleted.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documents d CROSS JOIN unnest(v_paths) p WHERE position(p in coalesce(d.file_path,''))>0) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='A receipt is referenced by a retained document; nothing was deleted.';
  END IF;
  PERFORM id FROM public.backload_items WHERE backload_id=p_backload_id FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) INTO v_items FROM public.backload_items i WHERE backload_id=p_backload_id;
  INSERT INTO public.backload_deletion_jobs(backload_id,trip_id,trip_stop_id,requested_by,state,storage_paths,snapshot,completed_at)
    VALUES(p_backload_id,v_report.trip_id,v_report.trip_stop_id,p_actor_id,
      CASE WHEN cardinality(v_paths)=0 THEN 'COMPLETE' ELSE 'PENDING_STORAGE' END,v_paths,
      jsonb_build_object('actor_profile_id',p_actor_id,'report',to_jsonb(v_report),'items',v_items,'receipts',v_receipts),
      CASE WHEN cardinality(v_paths)=0 THEN now() ELSE NULL END) RETURNING * INTO v_job;
  DELETE FROM public.report_receipts WHERE backload_id=p_backload_id;
  DELETE FROM public.backloads WHERE id=p_backload_id;
  -- Existing FK cascades delete only this Backload's item rows. No trip, stop,
  -- assignment, document, conversion record or other report is selected.
  RETURN to_jsonb(v_job);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_backload_with_cleanup_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_backload_with_cleanup_v1(uuid,uuid) TO service_role;
COMMIT;
