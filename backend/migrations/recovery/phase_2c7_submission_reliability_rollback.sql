-- Recovery proposal ONLY. Never an automatic startup/cleanup script.
-- Stop report creation/upload consumers first. If any new requests/reservations
-- exist, keep the additive schema: this script refuses to destroy retry evidence.
-- Restores pre-2C.7 schema/grants only when no new workflow data exists.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$BEGIN
 IF EXISTS(SELECT FROM public.operations_submission_requests)
  OR EXISTS(SELECT FROM public.report_receipts WHERE upload_request_id IS NOT NULL OR upload_status='PENDING') THEN
  RAISE EXCEPTION 'Retained retry/upload evidence exists. Keep the schema and reconcile it before recovery.';
 END IF;
END $$;
DROP TRIGGER pending_operations_receipt_guard_trg ON public.report_receipts;
DROP TRIGGER backload_receipt_capacity_trg ON public.report_receipts;
DROP FUNCTION public.complete_operations_receipt_v1(uuid,uuid);
DROP FUNCTION public.reserve_operations_receipt_v1(uuid,uuid,text,uuid,text,text,bigint,text);
DROP FUNCTION public.submit_operations_report_v1(uuid,uuid,text,jsonb,jsonb,jsonb);
DROP FUNCTION public.lock_operations_submission_scope_v1(uuid,uuid,uuid);
DROP FUNCTION public.guard_pending_operations_receipt_v1();
DROP FUNCTION public.check_backload_receipt_capacity_v1();
REVOKE UPDATE(upload_status,received_at) ON public.report_receipts FROM service_role;
DROP INDEX public.report_receipts_upload_request_uidx;
ALTER TABLE public.report_receipts DROP COLUMN upload_request_id,DROP COLUMN upload_sha256,DROP COLUMN upload_status;
DROP TABLE public.operations_submission_requests;
COMMIT;
