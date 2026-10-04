CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_type text NOT NULL CHECK (notification_type = 'report_mention'),
  reference_type text NOT NULL CHECK (reference_type IN ('trip', 'store_call')),
  reference_id uuid NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_key uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_recipient_created_idx
  ON public.admin_notifications (recipient_profile_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_recipient_event_uq
  ON public.admin_notifications (recipient_profile_id, event_key);
CREATE INDEX IF NOT EXISTS admin_notifications_recipient_unread_idx
  ON public.admin_notifications (recipient_profile_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_notifications TO service_role;
