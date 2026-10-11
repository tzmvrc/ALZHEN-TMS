-- PROPOSAL ONLY — do not apply automatically.
-- One-time migration for application-enforced ADMIN/STAFF Manila-midnight
-- expiration, plus explicit service-role access for the existing trucker
-- single-device session table. Review live grants and table definitions first.
-- If this migration partially fails, inspect the created objects and grants
-- before retrying; do not blindly rerun it.

CREATE TABLE public.admin_staff_session_days (
  session_hash text PRIMARY KEY
    CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_staff_session_days_profile_idx
  ON public.admin_staff_session_days (profile_id);

ALTER TABLE public.admin_staff_session_days ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.admin_staff_session_days
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_staff_session_days
  TO service_role;

-- The application uses the service-role backend client for this table only.
-- Browser roles must not receive access; RLS remains enabled without policies.
REVOKE ALL PRIVILEGES ON TABLE public.trucker_active_sessions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trucker_active_sessions
  TO service_role;
