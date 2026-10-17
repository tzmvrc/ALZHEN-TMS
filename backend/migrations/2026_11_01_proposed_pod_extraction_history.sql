-- PROPOSAL ONLY. Durable private AI attempt history; no jobs/backfill are created.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TABLE public.pod_extraction_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 receipt_id uuid NOT NULL REFERENCES public.trip_images(id) ON DELETE CASCADE,
 actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ocr_version integer NOT NULL CHECK(ocr_version>=0),
 input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 original_ocr_text text NOT NULL CHECK(length(original_ocr_text) BETWEEN 1 AND 40000),
 model text NOT NULL CHECK(model='gemini-2.5-flash'),
 external_consent_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('PROCESSING','COMPLETED','FAILED')),
 lease_token uuid NOT NULL, lease_expires_at timestamptz NOT NULL,
 interpretation jsonb, matching jsonb, error_code text,
 requested_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 CHECK (interpretation IS NULL OR jsonb_typeof(interpretation)='object'),
 CHECK (matching IS NULL OR jsonb_typeof(matching)='object'),
 CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,80}$'),
 CHECK ((state='PROCESSING' AND finished_at IS NULL AND interpretation IS NULL AND error_code IS NULL)
     OR (state='COMPLETED' AND finished_at IS NOT NULL AND interpretation IS NOT NULL AND error_code IS NULL)
     OR (state='FAILED' AND finished_at IS NOT NULL AND interpretation IS NULL AND error_code IS NOT NULL))
);
CREATE INDEX pod_extraction_completed_idx ON public.pod_extraction_runs(receipt_id,ocr_version,input_sha256,model,actor_profile_id,finished_at DESC) WHERE state='COMPLETED';
CREATE INDEX pod_extraction_lease_idx ON public.pod_extraction_runs(lease_expires_at) WHERE state='PROCESSING';
ALTER TABLE public.pod_extraction_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pod_extraction_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pod_extraction_runs TO service_role;
CREATE FUNCTION public.guard_pod_extraction_history_v1() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Actor FK may be nulled when an account is permanently deleted; that is not
 -- permission to change document/source/provider history or a terminal result.
 IF ROW(NEW.receipt_id,NEW.request_id,NEW.ocr_version,NEW.input_sha256,NEW.original_ocr_text,NEW.model,NEW.external_consent_at,NEW.requested_at)
   IS DISTINCT FROM ROW(OLD.receipt_id,OLD.request_id,OLD.ocr_version,OLD.input_sha256,OLD.original_ocr_text,OLD.model,OLD.external_consent_at,OLD.requested_at)
 THEN RAISE EXCEPTION 'Extraction source history is immutable.' USING ERRCODE='55000'; END IF;
 IF NEW.actor_profile_id IS DISTINCT FROM OLD.actor_profile_id AND NEW.actor_profile_id IS NOT NULL THEN
  RAISE EXCEPTION 'Extraction actor is immutable.' USING ERRCODE='55000';
 END IF;
 IF OLD.state<>'PROCESSING' AND ROW(NEW.state,NEW.interpretation,NEW.matching,NEW.error_code,NEW.finished_at,NEW.lease_token,NEW.lease_expires_at)
  IS DISTINCT FROM ROW(OLD.state,OLD.interpretation,OLD.matching,OLD.error_code,OLD.finished_at,OLD.lease_token,OLD.lease_expires_at)
 THEN RAISE EXCEPTION 'Terminal extraction attempts are immutable. Create a new retry attempt.' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pod_extraction_history_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pod_extraction_history_guard BEFORE UPDATE ON public.pod_extraction_runs FOR EACH ROW EXECUTE FUNCTION public.guard_pod_extraction_history_v1();
COMMIT;
-- Activation requires a separate durable claim/finalize integration: request-ID
-- replay, actor-scoped cache lookup, lease-token CAS and expired-job recovery.
-- Do not turn this table into an unprotected generic write API.
-- Recovery: stop workers, revoke INSERT/UPDATE service grants; retain history.
-- Explicit document/transaction deletion removes owned derived OCR via FK CASCADE.
-- No browser access, publication, operational-value or verified-review changes.
