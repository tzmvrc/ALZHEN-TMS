Profile and Settings implementation
===================================

Profiles are read-only for Admin, Staff and Trucker accounts. Editing is in Account
Settings. Admin's existing permission to view other profiles/history is retained;
Staff's existing directory/profile permissions are unchanged.

Created files
-------------

- `backend/src/services/account-overview.service.ts`
- `backend/src/services/account-picture.service.ts`
- `backend/src/services/account-security.service.ts`
- `frontend/src/pages/Account/SettingsPage.tsx`
- `frontend/src/pages/Driver/DriverAccountPage.tsx`
- `frontend/src/components/account/AccountUi.tsx`
- `frontend/src/components/account/ProfilePictureEditor.tsx`
- `frontend/src/components/account/useAccountPreferences.ts`
- `frontend/src/components/account/account.css`
- `frontend/src/services/account-picture-permissions.ts`
- This implementation report.

Modified files
--------------

- `backend/src/controllers/user.controller.ts`
- `backend/src/routes/user-workspace.routes.ts`
- `backend/src/services/user.service.ts`
- `backend/src/services/user-workspace.service.ts`
- `backend/src/services/user-maintenance.service.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/Admin/DashboardPage.tsx` (account navigation only)
- `frontend/src/pages/Admin/views/ResourceView.tsx` (Settings placeholder only)
- `frontend/src/pages/Admin/views/UserProfilePage.tsx`
- `frontend/src/pages/Admin/views/TruckersView.tsx`
- `frontend/src/pages/Driver/DriverPortal.tsx` (account navigation only)
- `frontend/src/components/admin/UserManagementModal.tsx`
- `frontend/src/services/user-management.service.ts`
- `frontend/src/services/user-workspace.service.ts`

Behavior and data coverage
-------------------------

- Admin/Staff: account information, provider last sign-in when available, trips
  attributed to the recorded creator, report changes attributed to the audit actor,
  one report-change chart and recent recorded actions. Report counts are events, not
  unique reports; team totals and unsupported "managed trips" counts are not used.
- Truckers: company/default truck, distinct retained assignments, completed
  assigned trips, scoped pending deliveries, receipt-based pending POD submissions,
  dated completion chart, recent assignments and recorded driver delivery updates.
  ALL/SELECTED stop responsibilities are respected and duplicate assignments/stops
  are not double counted. Cancelled/archived trips and archived stops are excluded.
  Historical assignments that have been unassigned are outside this summary.
  Chart dates require actual recorded completion timestamps, not estimated dates.
- Settings: changed-field-only name/contact saves, email changes through the
  existing Supabase Auth confirmation policy, picture preview/upload/removal,
  current-password verification and password change, current-session information,
  and logout. Role/account dates are read-only. Password changes recheck the
  original app session and require signing in again after success.
- Pictures: everyone may change their own; Admin/Staff may also change Truckers;
  nobody may change another Admin/Staff picture. Both upload routes and removal
  recheck active account permissions on the backend. Users actions follow the same
  display policy. Existing `profile-pictures` Storage and `user_maintenance_jobs`
  cleanup are reused. Removal/managed uploads reserve cleanup before a guarded
  update of the prior picture path; shared references prevent file deletion.
- Appearance/date preferences are per-account on this device and apply only to
  Profile/Settings. Light, dark, system theme, compact spacing and date formatting
  work in that scope; no unrelated workspace or Billing design is changed.

Limitations and verification
---------------------------

No per-account notification settings, separate display-name column, complete
historical driver-performance dataset, or reliable general "trip manager" owner
field exists in the inspected workflows. Those controls/statistics are not faked.
Email confirmation delivery relies on existing Supabase Auth/email configuration.

No SQL, migrations, bucket creation, dependency changes, operational trip writes,
tests, builds, compilation or Playwright were executed. No database or Storage
schema changes need approval. Source and whitespace inspection only; runtime
account changes, permissions and UI behavior still require manual verification.
