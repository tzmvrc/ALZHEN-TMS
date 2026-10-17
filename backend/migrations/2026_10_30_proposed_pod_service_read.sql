-- PROPOSAL ONLY. Requires explicit approval before live execution.
-- Preflight on 2026-10-17: service_role has no SELECT on public.pod_records.
-- Enables protected backend reads, not approval writes or browser access.
-- Existing service-only POD views remain compatible; no RLS/policies change.
BEGIN;
SET LOCAL lock_timeout = '3s';
GRANT SELECT ON TABLE public.pod_records TO service_role;
COMMIT;

-- Recovery (requires approval):
-- REVOKE SELECT ON TABLE public.pod_records FROM service_role;
-- Recheck current privileges/dependencies before recovery. No data to restore.
