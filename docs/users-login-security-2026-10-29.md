# Users editing, assignments, automatic login and security alerts

## Root causes and changes

- Users Email was marked read-only and the generic profile RPC intentionally does not edit Auth email. Admin inline email changes now use Supabase Auth's Admin API with validation and audit attribution. Phone validation is shared at the backend boundary. Patches update only the changed field.
- Table editor errors retained the rejected draft; Tab did not commit and advance to the next editable field. Failed saves now restore canonical values, Tab saves before advancing, and a subtle Saving status is displayed. Email and phone use appropriate input types. Crew Role uses the existing styled spreadsheet dropdown with Driver/Helper labels and no blank option.
- Assignment labels included extra metadata and a corrupted separator. Main labels are now `PLATE - DRIVER` or `PLATE - No Driver`, with dispatch secondary. Existing assignment-ID authorization, Driver occupancy checks, Helper membership updates, and crew grouping are retained. The previously failing crew-display test now passes.
- PublicRoute deliberately kept remembered users on the login page for Continue. It now routes verified restored sessions straight to their dashboard. Invalid sessions render the regular credentials form without an expired card. Declined consent does not enable persistent automatic access through this feature; an interactive session marker allows the current tab to keep working. Consent renders only over the account's Home route after navigation.
- Existing device sessions had no durable new-device email workflow. Recognized device hashes and a notification queue now provide account/device deduplication, exclusive claims, bounded retries, SMTP ambiguity holds, actual timestamps, server IP/device metadata, and delivery status. Existing known device records are backfilled without sending alerts. Raw passwords and custom authentication tokens are not added.

## Files changed

- `frontend/src/components/admin/DatabaseSpreadsheet.tsx`
- `frontend/src/pages/Admin/views/TruckersView.tsx`
- `frontend/src/components/admin/DriverTruckAssignmentForm.tsx`
- `frontend/src/services/user-workspace.service.ts`
- `frontend/src/components/PublicRoute.tsx`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/pages/Admin/LoginPage.tsx`
- `frontend/src/pages/Driver/LoginPage.tsx`
- `backend/src/services/user-workspace.service.ts`
- `backend/src/services/device-session.service.ts`
- `backend/src/services/login-security.service.ts` (new)
- `backend/src/controllers/auth.controller.ts`
- `backend/src/server.ts`
- `backend/.env.example`
- `backend/migrations/2026_11_21_login_security_notifications.sql` (new)
- `frontend/tests/users-inline-edit.browser.cjs` (new)
- `frontend/tests/crew-assignment-refinement.browser.cjs`
- `backend/scripts/verify-storage-login.cjs`

## Database

Confirmed project: `hdmknewarynwpbrhfgai`. Applied migration `20261029104714`, `login_security_notifications`. Adds recognized-device and notification tables plus service-only queue/claim functions. Both tables have RLS and no ordinary client grants. Device/IP metadata is cleared after 30 days by queue maintenance; minimal hashes remain for duplicate prevention. Existing migrations were not rerun.

## SMTP

Backend configuration is present. Sender supports SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM and the existing SMTP_APP_PASSWORD fallback. The branded table-based email includes the existing logo, Philippine Time, device/browser, approximate location, and security guidance. Optional LOGIN_GEOLOCATION_URL must be a trusted HTTPS endpoint returning city/country; otherwise location is unavailable. req.ip respects the application's existing trusted-proxy configuration.

No real recipient was used for verification. A local SMTP sink accepted one test email, and a refused connection scheduled a retry. External inbox delivery remains unverified. Jobs that may have been accepted but cannot be confirmed are held in NEEDS_REVIEW instead of blindly resent. Reserved example/invalid/test addresses are never sent by the worker.

## Verification

- Phase 1 completed first: isolated production spreadsheet checks passed for four account rows, Enter, blur, Escape, Tab, and backend-rejected-save rollback.
- Actual backend/Supabase checks passed for Admin/Staff/Driver/Helper phone edits, persistence after reread, preservation of unrelated names, Auth email changes, and denial of privileged Staff/Helper edits.
- Shared assignment dropdown browser checks passed: occupied Helper choice, assignment-ID payload, existing Driver and Helper preservation, Driver-first grouping, inline removal, Driver occupancy filtering, and mobile layout.
- Playwright MCP shared editor checks passed: dropdown labels/search, relationship selection, Escape, date/number commit, and viewport bounds.
- Real AuthProvider/login components with actual backend and Supabase passed automatic remembered-session restoration and revoked-session reauthentication for Admin/Helper; declined preference and subsequent login checks passed for Staff/Driver. Consent was verified over the loaded dashboard route. The test destination dashboard is isolated, rather than rendering operational dashboards.
- Queue SQL checks passed migration validity, one job for repeated account/device requests, and exclusive claim. Supabase confirmed service-only access.
- Backend and frontend production builds passed; final TypeScript checks cover subsequent UI changes. Existing frontend chunk warnings remain.
- Test accounts were deactivated/banned and temporary Admin privileges removed. Operational data and photos were not modified for these checks.

No commit, push, or deployment was performed. The database migration is live; application source still follows the normal release process.
