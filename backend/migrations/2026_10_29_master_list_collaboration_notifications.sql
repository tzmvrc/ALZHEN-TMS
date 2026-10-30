BEGIN;

ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_notification_type_check;
ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_notification_type_check
  CHECK (notification_type IN ('report_mention','pod_approved','pod_rejected','master_list_edit'));

COMMIT;
