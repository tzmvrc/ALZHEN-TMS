-- PROPOSAL ONLY. Read-only backend diagnostics returned 42501 for this view.
-- Existing fallback remains usable. No operational records are changed.
-- Review the view's ownership/security options before approval.
BEGIN;
GRANT SELECT ON public.vw_store_calling_tracker TO service_role;
COMMIT;
