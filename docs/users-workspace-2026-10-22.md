# Users workspace, profiles and current truck assignments

## Implementation

- `TruckersView` now adapts the existing `DatabaseSpreadsheet` to two account sheets: Admin & Staff (Admin only) and Truckers (Admin/Staff). The existing grid owns selection, virtual rows, keyboard editing, menus, aliases, column layouts, Saved feedback and formatting. No formula bar or parallel grid was added.
- Real rows use profile UUIDs. Driver actions use the associated physical driver UUID. Shared design keys are `users:staff` and `users:truckers`; presentation writes never update account values.
- Names/contact information and permitted driver fields use the authorized profile-patch RPC. Email, roles, account status, IDs, dates and current truck are protected from cell editing. Existing Admin account management handles email; roles remain immutable there.
- The Users-only Vehicles screen and its dedicated modal were removed. Database Trucks, lookup APIs, truck images, historical trip assignments and cargo records remain intact.
- Driver profile assignment uses one searchable, keyboard-accessible dropdown, with truck type and plate labels. Available trucks are filtered server-side and paginated. Save and Remove change only `drivers.assigned_truck_id`.
- `/profile` opens the signed-in Admin/Staff account page; `/users/:userId` permits an Admin to open another account. The trucker drawer remains available, including trip history. Existing trucker portal routes remain unchanged.
- Profile analytics use real normalized audit events: dated activity, module breakdown, recorded-action totals, active days and recent work. Date/search/action filters and 30-event server pagination are available in the timeline. Manila timezone is used. Missing history is explicitly described as incomplete coverage, not zero work.

## Deletion and assignment integrity

Account deletion is retained deactivation, not Auth hard deletion. The Admin-only transactional RPC rejects the signed-in account, protected `is_admin` accounts and the final active Admin. It releases current truck ownership, marks the driver inactive, invalidates application sessions and records audit evidence. It retains profiles, drivers and historical operational relationships. Each selected account is atomic; bulk requests return successes and failures separately and retain failed selections.

Auth disabling is a durable queued operation because Supabase Auth and PostgreSQL cannot share a transaction. HTTP and collaboration authentication reject deactivated profiles immediately; existing socket sessions also use the existing periodic reauthorization. The worker retries Auth bans with backoff. A backend process must be running to drain pending jobs.

The existing partial unique index guarantees at most one active default driver per truck. New database guards serialize competing current/trip assignment changes and reject a current truck belonging to another active driver. They do not rewrite old trip assignments. Removing a default assignment does not cancel an ongoing operational assignment; a truck may remain unavailable if another active operational allocation still reserves it.

## Images

The existing private `profile-pictures` bucket is reused. JPEG/PNG/WebP bytes and a 5 MB limit are validated. A new owned path is staged for cleanup before upload. The profile reference changes only after upload succeeds. Superseded owned files are queued for retryable removal; shared/default paths and paths still referenced by any profile are preserved. Failed attachment leaves the previous profile image unchanged and the staged object eligible for cleanup. Signed URLs are returned for display. The profile menu updates through local cache events and existing change signals.

## Activity and Realtime

Existing `audit_logs`, `flex_audit_events`, `report_audit_logs` and `pod_review_events` are combined into a service-only activity view. Existing audit writers are reused. Profile/current-assignment/deactivation RPCs write transactional events. Supported trip/master-data/account-creation/website mutations persist a safe intent and finalize the same audit ID after the actual response; failed finalization is queued. Pending/failed intents do not inflate successful-work analytics. Existing transactional audit paths are excluded to avoid duplicate records. Passwords, tokens, session identifiers, private paths and request secrets are excluded or redacted.

No historical events are fabricated. Older operations may lack previous values, column names or dispatch context. Such fields appear only when actually recorded. Email-request and POD workflows are represented only where the application already records them or routes through supported mutation services.

The existing shared Admin change-signal connection is reused. New audit triggers publish topic revisions into that feed; no separate connection per profile or sheet was introduced. Account/driver/truck changes invalidate relevant cached pages. Focused drafts defer reconciliation. Activity and analytics refresh through coalesced signals. Shared table design keeps its existing revision conflict handling.

## Applied migrations

Project: `hdmknewarynwpbrhfgai` (ALZHEN). No operational rows were deleted or edited for verification.

1. `20261021183214 users_workspace_profiles_activity_assignments`
   - Source: `backend/migrations/2026_10_22_users_workspace.sql`.
   - Adds profile contact/deactivation metadata, actor/date audit indexes, service-only RLS maintenance queue, current-assignment guards and authorized service RPCs.
   - Adds service-only user-directory/activity views, recorded-activity aggregation and audit change signals.
   - Reuses existing driver ownership, truck uniqueness and private image storage.
2. `20261021184357 users_activity_search_and_audit_hardening`
   - Source: `backend/migrations/2026_10_22_users_activity_hardening.sql`.
   - Adds safe activity-context search and removes mutation/TRUNCATE/TRIGGER/REFERENCES grants on audit evidence from public/client roles. Service access remains.

Read-only metadata queries confirmed applied versions, queue RLS, existing active-truck uniqueness, backend-only assignment RPC execution, the activity search projection and zero reviewed client audit mutation grants. These are schema observations, not runtime acceptance tests.

Recovery: disable the new routes/worker and revoke new RPC execution if rollback is necessary. Retain profiles, audit evidence, staged cleanup jobs and existing assignments. Do not hard-delete accounts or discard queued work as a rollback shortcut.

## Files for this implementation

Created:
- `backend/migrations/2026_10_22_users_workspace.sql`
- `backend/migrations/2026_10_22_users_activity_hardening.sql`
- `backend/src/routes/user-workspace.routes.ts`
- `backend/src/services/user-workspace.service.ts`
- `backend/src/services/user-activity.service.ts`
- `backend/src/services/user-maintenance.service.ts`
- `frontend/src/services/user-workspace.service.ts`
- `frontend/src/components/admin/UserActivityHistory.tsx`
- `frontend/src/pages/Admin/views/UserProfilePage.tsx`
- This document.

Modified:
- `backend/src/controllers/user.controller.ts`
- `backend/src/routes/user.routes.ts`
- `backend/src/middleware/auth.middleware.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/services/collaboration-auth.service.ts`
- `backend/src/services/user.service.ts`
- `backend/src/services/trucker.service.ts`
- `backend/src/server.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/admin/DatabaseSpreadsheet.tsx`
- `frontend/src/components/admin/DatabaseDeleteDialog.tsx`
- `frontend/src/components/admin/SearchableRelationshipEditor.tsx`
- `frontend/src/components/admin/DriverTruckAssignmentForm.tsx`
- `frontend/src/components/admin/TruckerDetailDrawer.tsx`
- `frontend/src/components/admin/UserManagementModal.tsx`
- `frontend/src/components/admin/SidebarNav.tsx`
- `frontend/src/pages/Admin/DashboardPage.tsx`
- `frontend/src/pages/Admin/views/TruckersView.tsx`
- `frontend/src/services/user-management.service.ts`
- `frontend/src/services/admin-preload.service.ts`
- `frontend/src/services/admin-change-feed.ts`

Removed: `frontend/src/components/admin/VehicleManagementModal.tsx` (Users-only usage).

## Deferred verification and known limits

No tests, compilation, builds or browser verification were run, as requested. End-to-end account creation, two-session synchronization, concurrent assignment rejection, Auth banning and Storage cleanup still require acceptance verification. A backend restart/reload is required to load application changes if its watcher is not active.

The pre-existing Git index conflict in `frontend/src/components/admin/BulkTripImport.tsx` is untouched. Other developers' staged Database changes and searchable-editor form styling are preserved.

Shared formatting inherits the existing per-column limit of 1,000 individually formatted cell identities; whole-column formatting remains available. The new directory is paginated in 30-row batches and excludes deactivated accounts. The existing driver portal self-profile route was preserved; the new dedicated workspace profile is exposed to Admin/Staff.
