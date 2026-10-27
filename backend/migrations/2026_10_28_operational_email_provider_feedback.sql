-- Provider-verified testing eligibility is backend-owned, independent of the editable intended recipient.
ALTER TABLE public.operational_email_settings ADD COLUMN IF NOT EXISTS testing_account_email text;
ALTER TABLE public.operational_email_settings ADD COLUMN IF NOT EXISTS testing_account_key_hash text;
ALTER TABLE public.operational_email_outbox ADD COLUMN IF NOT EXISTS provider_error_name text;
ALTER TABLE public.operational_email_outbox ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz;
ALTER TABLE public.operational_email_outbox ADD COLUMN IF NOT EXISTS delivery_observed_at timestamptz;
CREATE INDEX IF NOT EXISTS operational_email_provider_pending_idx ON public.operational_email_outbox(provider_checked_at NULLS FIRST)
 WHERE state='SENT' AND provider_status IN ('ACCEPTED','sent','queued','delivery_delayed','scheduled');
