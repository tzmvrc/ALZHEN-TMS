# New-device security and Active Sessions

## Confirmed causes

The existing device identifier was already a random browser UUID; Chrome/Windows was descriptive metadata, not the registry key. The faults were in lifecycle integration:

- Device registration committed before a separate best-effort queue call, allowing session creation without durable notification creation.
- Forget cleared browser preferences without deleting server recognition. The notification table also had lifetime uniqueness on account/device, which would suppress another notification after forgetting and re-registering that device.
- Active Sessions did not include approximate location or an explicit Forget action distinct from Logout.
- Queued recipients were not refreshed from Auth immediately before sending. No evidence of mail being addressed to the viewing Admin was found, but recipient resolution is now enforced both in SQL and at delivery.
- Real-provider/inbox delivery had not previously been checked.

## Implementation

Registration now wraps the existing Active Sessions registration function and queues new-device notification in the same transaction. The SQL verifies that the device hash matches the persisted, active session and resolves the recipient from `auth.users`. Registry insertion is atomic per account/device; repeated, concurrent, restored and refreshed sessions do not create another alert. Notification uniqueness now includes the session, allowing another alert after explicit forgetting while preserving older notification history.

Authenticated Forget removes server recognition and revokes that account's sessions for that device. Normal Logout/revocation leaves recognition intact. Admin Active Sessions exposes these as separate controls. Signed-out local Forget rotates only the remembered account's browser identity; it cannot mutate server trust without authentication. Browser IDs are validated, normalized, and fall back to tab storage or a transient random ID when persistent storage is blocked.

The worker resolves the account's current Auth email again before SMTP delivery. The email uses the requested Security Alert subject, company logo, Philippine Time, browser/OS, approximate location or an explicit unavailable label, IP and security guidance. SMTP sending remains outside the login request. Bounded retries and uncertain-send holds are retained. SENT is written only after the provider explicitly accepts the intended recipient.

## Database

Confirmed project: `hdmknewarynwpbrhfgai`.

Applied `20261029111529_atomic_device_security`, source `backend/migrations/2026_11_22_atomic_device_security.sql`. It adds Active Sessions location, replaces the notification uniqueness rule, wraps registration atomically, and adds a restricted Forget RPC. Existing tables, historical notifications and operational records are preserved. No existing migration was rerun.

## Files changed

- `backend/migrations/2026_11_22_atomic_device_security.sql`
- `backend/src/services/device-session.service.ts`
- `backend/src/services/login-security.service.ts`
- `backend/src/routes/device-session.routes.ts`
- `frontend/src/services/device-identity.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/admin/DeviceSessionsModal.tsx`
- `backend/tests/atomic-device-security.test.ts`
- `backend/scripts/verify-device-security.cjs`
- `docs/device-security-live-2026-10-29.json` (safe fixture/results manifest)

## Verification and delivery evidence

- Actual Supabase/Auth/backend: first Laptop A login creates one notification; validation/refresh and repeat login do not duplicate it. Concurrent Laptop B logins with identical Chrome/Windows metadata create one new alert. Laptop C creates another. Forgetting A permits a fresh alert. Active Sessions includes simultaneous Staff devices.
- Actual Driver/Helper accounts share the same browser device UUID while retaining independent histories. Driver login from another device invalidates only that Driver's previous session; the Helper account remains independent.
- Four alerts were sent to a unique plus-address test account routed to the configured sender's inbox, explicitly authorized by the user. All four were accepted by the real configured SMTP provider and durably recorded SENT.
- Read-only Gmail IMAP EXAMINE/SEARCH confirmed one alert in INBOX by its exact Message-ID. Inbox delivery is confirmed for that message; the other three have SMTP acceptance confirmation only. No unrelated message content was fetched.
- Final database check: four SENT, zero PENDING/RETRY/SENDING/NEEDS_REVIEW. Existing FAILED records are TEST_ADDRESS safety blocks. Three isolated test accounts were deactivated and Auth-banned. Their IDs and result evidence are in the manifest; passwords remain process-memory only.
- Focused tests passed: atomic registration, Auth recipient, duplicate prevention, expiry retaining recognition, re-alert after Forget, registration rollback on queue failure, restricted RPC access. Five session regressions passed for midnight expiration, stale identifiers, matching logout, locked-account rejection and device/session policies.
- Playwright MCP verified two Chrome/Windows sessions, current-device indicator, location, and separate Forget confirmation using isolated UI fixtures. No operational writes were made by this UI check.
- Backend build and frontend TypeScript/build checks passed. Location-provider delivery remains conditional on configuration; unavailable location is displayed explicitly.

No commit, push or deployment was performed. The migration is live; application source uses the normal release/restart process.
