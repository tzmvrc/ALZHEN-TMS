-- PROPOSAL ONLY: approval required. Repair the protected backend view read.
-- Existing vw_pod_drive_files is owned by postgres and uses owner privileges.
-- Only service_role receives SELECT; anon/authenticated/base grants/RLS stay as-is.
-- Realtime already uses admin_change_signals, so private POD tables need not be
-- published. No operational records or private Storage objects are changed.
-- Recovery: REVOKE SELECT ON public.vw_pod_drive_files FROM service_role;
BEGIN;
GRANT SELECT ON public.vw_pod_drive_files TO service_role;
COMMIT;
