-- Extend the existing deletion journal; no second queue or browser grants.
ALTER TABLE public.transaction_deletion_jobs
 ADD COLUMN IF NOT EXISTS cleanup_lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
 ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS transaction_cleanup_due_idx ON public.transaction_deletion_jobs(next_attempt_at)
 WHERE state='PENDING_STORAGE';
CREATE OR REPLACE FUNCTION public.claim_transaction_image_cleanup_v1(p_operation uuid DEFAULT NULL,p_actor uuid DEFAULT NULL)
RETURNS SETOF public.transaction_deletion_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_operation IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL) THEN
  RAISE EXCEPTION 'Management authorization required.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY WITH due AS (
  SELECT id FROM public.transaction_deletion_jobs WHERE state='PENDING_STORAGE'
   AND (cleanup_lease_until IS NULL OR cleanup_lease_until<clock_timestamp())
   AND (p_operation IS NOT NULL AND id=p_operation OR p_operation IS NULL AND next_attempt_at<=clock_timestamp())
  ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 5
 ) UPDATE public.transaction_deletion_jobs j SET cleanup_lease_until=clock_timestamp()+interval '3 minutes',last_attempt_at=clock_timestamp()
 FROM due WHERE due.id=j.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_transaction_image_cleanup_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transaction_image_cleanup_v1(uuid,uuid) TO service_role;
