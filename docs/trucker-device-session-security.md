# Trucker interface and device-session security

Implemented October 26, 2026. No commit, push, deployment, credential change, new demo trip, or operational milestone was performed for this task.

## Delivered behavior

- The Trucker header uses the existing company logo, followed by My Trip / History / Reports navigation.
- The backend resolves one current trip using the authenticated profile's driver, its master truck, and the existing latest-assignment ordering. Completed/cancelled assignments are excluded; completing an assignment can expose the next valid assignment. No assignment records are deleted.
- The summary shows dispatch, truck, status, origin, next stop, route, assigned CBM and stop count. Three action cards open Add Status, Upload POD and Submit Report. Cargo and DR details remain available in a compact disclosure.
- The next-action panel uses saved milestones and the existing backend-enforced transitions. Queued or ambiguous submissions do not advance progress until acknowledged.
- Location sharing requires consent. Permission denial, missing capabilities, timeouts, stopped watchers, stale fixes and failed saves retain the warning. Obtaining a fix or clicking Retry does not show active sharing until its save succeeds. A stationary driver sends a bounded fresh fix at least once per minute when the browser provides one. Foreground recovery retries previously enabled capture.
- Profile and Settings both expose Logout. Successful logout revokes the tracked session, removes its legacy authorization record, signs out the local Supabase session and clears the application's caches and identifier. Local sign-out does not sign other Admin devices out.
- Remember Me retains only the email. Valid Supabase and application sessions restore through bootstrap without creating another device record.
- Admin Users sheets show backend-derived Active Sessions counts. The modal shows available browser/OS labels, login time, last activity, expiry, active status and the current-device marker when the viewer is inspecting its own matching session.
- Icon controls offer session-specific logout, password change using the established isolated Admin password-verification guard, and account lock/unlock. Destructive actions require confirmation. Password changes revoke application sessions before the Auth update; a failed update explicitly reports that sessions were revoked but the password was not confirmed.
- Locking persists on the profile and revokes all its application sessions in one database transaction. New logins, protected requests and socket authorization reject the locked account. Unlocking never restores old sessions. A locked-account screen replaces protected content.

## Applied Supabase migration

`backend/migrations/2026_10_26_device_session_security.sql` was applied using Supabase MCP as `device_session_security`.

It adds `profiles.locked_at` / `locked_by`, the RLS-enabled `device_sessions` table, service-only registration/validation/security RPCs, session lookup indexes, and backfills existing legacy session records. Anonymous and authenticated database roles cannot read or mutate device session metadata directly. The backend only sends sanitized session details to authorized Admins; session hashes, passwords and access/refresh tokens are not exposed through that API.

The registry stores a hash of the random application session identifier and the verified Supabase Auth session ID. A random browser-profile identifier labels a browser; it is not accepted as proof of identity. Existing one-device Trucker restrictions and Manila-midnight Admin/Staff expiration remain enforced. Counts cross-check the legacy authorization records and expiration rather than merely counting registry rows.

Application access is checked on every protected HTTP request, including delivery, POD, reporting, GPS and Admin routes. Existing collaboration socket authorization also checks the device record. Visible frontends check session validity every 15 seconds and on focus/visibility recovery; protected requests deny revoked sessions immediately regardless of an unexpired access token. Local logout also uses Supabase Auth's local-session sign-out. Remote enforcement does not depend on retaining raw Supabase tokens.

## Loading error

The affected saved trip had `warehouse_id = null`. Passing that value to a UUID warehouse equality filter caused the complete delivery workspace read to fail. The service now skips the optional warehouse read and returns a null warehouse while still returning the trip, stops, cargo and milestones. The UI displays the missing origin explicitly. Recoverable read failures retain a functional Retry control and a safe delivery-specific message.

## Verification

- Backend and frontend production builds passed. Existing Vite bundle-size/dynamic-import advisories remain.
- 27 focused automated tests passed across the device-security SQL, HTTP authorization, locked login, application sessions, concurrent authorization, socket authentication, password verification, delivery reads/automatic assignment, tracking, location capture and API error suites.
- SQL tests use local PGlite, not live accounts: two-device revocation isolation, identity binding, duplicate-free restore, account lock/unlock, rejection of new locked registrations, midnight expiry, single-Trucker replacement, self-lock prevention and direct database access denial.
- HTTP checks retain a valid mocked Auth identity and verify that revocation/locking still denies trip reads, milestone/POD/report/GPS submissions and Admin access. Non-Admin security actions and unconfirmed actions are denied.
- Playwright checked the actual saved trip snapshot at 320, 390 and 955 CSS pixels, the new navigation, missing-warehouse handling, error recovery, all three workflows, permission denial, warnings until confirmed GPS saves and stopped sharing.
- Playwright checked the actual saved Admin directory/session snapshots, counts, clickable modal, confirmations, revoke/lock/unlock controls and secure password form. Security mutations were intercepted in the test context.
- A separate Playwright run used the real AuthProvider with isolated Auth/API transport: five logins, two logout calls, three session bootstraps, restore without duplicate login, email-only remembering, both logout entry points, revoked-session redirects, protected routes after logout, locked-account screen, blocked locked login and fresh login after unlock.
- Read-only checks against connected Supabase confirmed John's current assignment resolves and his valid Active Sessions count is 1. No live user was locked, revoked, or given a new password during acceptance tests.

Screenshots and exported review snapshots remain in ignored `.playwright-mcp/`: `trucker-redesign-{320,390,955}.png`, `admin-device-sessions.png`, `trucker-workspaces-review.json`, and `security-review-data.json`.

## Verification limits

John's password was neither available nor changed. His live assignment/session data was read from Supabase; destructive controls, credential login and real GPS hardware failure/recovery were exercised with isolated test transport. Backfilled sessions without historical browser metadata are labeled Unknown browser / Unknown OS until a validated request supplies those labels; no device model is invented. A suspended browser checks revocation on return to the foreground, and cannot display an immediate message while the operating system has suspended it.

## Application files changed or added

Backend:

- `src/controllers/auth.controller.ts`
- `src/middleware/auth.middleware.ts`
- `src/routes/delivery.routes.ts`
- `src/routes/user.routes.ts`
- `src/routes/device-session.routes.ts` (new)
- `src/services/auth.service.ts`
- `src/services/collaboration-auth.service.ts`
- `src/services/delivery-workspace.service.ts`
- `src/services/device-session.service.ts` (new)
- `migrations/2026_10_26_device_session_security.sql` (new)

Frontend:

- `src/App.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/admin/LocationSharing.tsx`
- `src/components/admin/DeviceSessionsModal.tsx` (new)
- `src/components/admin/device-sessions.css` (new)
- `src/components/delivery/delivery-workspace.css`
- `src/context/AuthContext.tsx`
- `src/pages/Admin/views/TruckersView.tsx`
- `src/pages/Admin/LoginPage.tsx`
- `src/pages/Driver/DeliveryCompanion.tsx`
- `src/pages/Driver/DriverAccountPage.tsx`
- `src/pages/Driver/LoginPage.tsx`
- `src/pages/Account/AccountLocked.tsx` (new)
- `src/services/api.service.ts`
- `src/services/delivery.service.ts`
- `src/services/location-capture.ts`
- `src/services/device-identity.ts` (new)
- `src/services/remembered-login.ts` (new)

The existing uncommitted `DashboardPage.tsx` null-profile guard from the preceding loading-error repair is preserved.

Regression files:

- Backend: `tests/device-session-security.test.ts`, `device-session-http.test.ts`, `device-login.test.ts`, `delivery-workspace-read.test.ts`, `auth-password-check.test.ts`, `auth-upstream-unavailable.test.ts`, `collaboration-auth.test.ts`, `concurrent-auth.test.ts`, `tracking-api.test.ts`.
- Frontend: `tests/delivery-workspace-loading.browser.js`, `device-sessions.browser.js`, `device-auth-flows.browser.js`, `location-pod.test.ts`, `api-trip-import-errors.test.ts`.
