# Crew, Storage Buckets, and remembered login — 2026-10-29

## Implemented

- Crew Role belongs to the Trucker directory/form only. Admin and Staff retain no crew classification. Existing classifications and assignment history are preserved.
- A Helper now joins an existing active trip/truck assignment through a dedicated picker, including occupied trucks. Changes merge with the existing crew through the versioned crew RPC; they do not replace the primary Driver, create a trip/assignment, or modify cargo. Directory membership loading is batched. The legacy exclusive truck-ownership RPC rejects Helpers.
- Admin Database has a Storage Buckets sheet with bucket selection, filename search, type filter, cursor pagination (50 objects), known size/count, existing image preview, individual/bulk selection, and confirmed deletion. Service-role access remains on the backend. Staff and Trucker requests are denied.
- Deletion first validates the exact object ID/path and checks database references, including historical PODs, documents, profile images, JSON metadata, and audit history. References block deletion. Durable reservations and database guards protect against concurrent new references or overwrites. The Storage API performs removal; the database deletion trigger records the actual completion and actor in the deletion journal and audit log. Retries reconcile that journal instead of assuming success.
- Login asks once per account/device whether to remember the account, before rendering its dashboard. Remembered display metadata is separate from Supabase's existing supported session persistence. Continue is shown only for a verified matching session and checks `/auth/me` again before navigating. Revoked/expired sessions require credentials. Declining suppresses future prompts. Logout preserves remembered display information; Forget signs out and removes that account's preference/card. No passwords or custom authentication tokens are stored by this feature.

## Root causes

The Users table inherited Crew Role from shared columns, while a Helper could still reach the old exclusive Driver-to-truck assignment path. The new Helper picker and backend guard separate crew membership from truck ownership.

Storage had no Admin management API, protection/reservation workflow, or deletion journal. Live testing also found that decoding long OCR/base64/email strings character by character made the first protection scan time out. Candidate filtering and chunk-based URL decoding fixed that scan without weakening reference protection.

The previous login remembered an email only; it had no account-scoped consent, verified-session account card, or Forget behavior.

## Live database changes

Confirmed project: `hdmknewarynwpbrhfgai`.

- `20261029090622` — `admin_storage_management`, source `backend/migrations/2026_11_18_admin_storage_management.sql`.
- `20261029092015` — `storage_reference_scan_efficiency`, source `backend/migrations/2026_11_19_storage_reference_scan.sql`.

Both applied successfully. Existing crew/POD migrations were not rerun. The three object listing, preview lookup, and deletion preparation RPCs are executable by `service_role`, not `anon` or `authenticated`. No existing operational files, assignments, or delivery records were deleted. Supabase confirmed zero Admin/Staff profiles with a crew classification.

## Files

- Backend: `src/app.ts`, `src/routes/user-workspace.routes.ts`, `src/routes/storage-management.routes.ts`, `src/services/helper-assignment.service.ts`, `src/services/user-workspace.service.ts`, `src/services/trucker.service.ts`, `src/services/storage-management.service.ts`; the two migrations above.
- Frontend: `src/pages/Admin/views/TruckersView.tsx`, `MasterDataView.tsx`, `src/components/admin/HelperAssignmentDialog.tsx`, `TruckerDetailDrawer.tsx`, `StorageBucketsView.tsx`, `src/services/trucker.service.ts`, `api.service.ts`, `remembered-login.ts`, `src/context/AuthContext.tsx`, `src/components/PublicRoute.tsx`, `src/components/auth/RememberDevicePrompt.tsx`, `RememberedAccountCard.tsx`, both Admin/Driver `LoginPage.tsx`, and `src/pages/Account/SettingsPage.tsx`.
- Verification: `backend/tests/storage-management.test.ts`, `backend/scripts/verify-storage-login.cjs`, `frontend/tests/remembered-login.test.ts`, `storage-buckets.browser.cjs`, `truck-crew.browser.cjs`; safe fixture manifest `docs/storage-login-live-2026-10-29.json` and browser screenshots under `frontend/tests/artifacts`.

## Verification

- Backend and frontend production builds passed. Frontend retains the existing large-chunk and mixed static/dynamic import warnings.
- Focused database tests passed: reference protection (including encoded URLs/JSON), all-or-nothing protected bulk validation, concurrent reference/overwrite guards, actual deletion audit, retries, path reuse, bounded listing, service-only access; existing crew backfill/shared actions/attribution; account-scoped preferences and credential exclusion.
- Playwright component checks passed: five storage preview/confirmation/protection/retry/mobile checks and five crew/User form/grouping/mobile checks. These UI checks use isolated transport fixtures.
- Actual backend/Supabase checks passed: Admin bucket listing, private signed preview, Staff/Driver/Helper rejection, retained isolated POD protection, two temporary image deletions with exactly two Admin audit records and idempotent retry, and two Helpers joining one occupied assignment with its Driver unchanged. No real operational file was deleted.
- Browser checks using the actual AuthProvider, login components, backend routes, and Supabase passed for Admin, Staff, Driver, and Helper. Verified first prompt before dashboard, remembered-session Continue and Forget (Admin/Helper), declined-choice persistence (Staff/Driver), correct dashboard route, no password in browser storage, and server-revoked session requiring credentials. Only the destination dashboard and Admin preload were isolated; full operational dashboard rendering was not retested as part of login acceptance.
- Eight generated test accounts were deactivated and Auth-banned; temporary Admin privileges were removed. All isolated Helper trips are archived and their trucks inactive. Test identities are in the safe manifest; generated passwords were held only in process memory.

No commit, push, or deployment was performed. Changes to application source require the normal release/restart process; the two database migrations are already live.
