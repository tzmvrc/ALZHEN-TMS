# Phase 2D.4 — Unified Entire Trip Deletion

## Implementation — October 19, 2026

Trips and Combined Report now expose one selection-based deletion action:
`Delete Entire Trip` for one unique parent, or `Delete Selected Trips` for multiple
parents. Multiple selected stops of one trip still show the single-parent action.
The obsolete transaction-only toolbar callback, password state, confirmation modal
and service import were removed from ReportDataView. No transaction-delete request
can be initiated by this component. Pending Storage cleanup notices/retry remain.
Unrelated report-only deletion and protected backend transaction infrastructure
remain unchanged.

Both actions use WholeTripDeletionDialog, authoritative trip IDs, the existing
shared deletion service and delete_whole_trips_v1. Password confirmation, Admin-only
authorization, the 20-parent limit, deduplication, impact preview, atomic relational
rollback, audit journals and recoverable Storage cleanup are unchanged. Successful
database deletion with pending file cleanup remains explicitly distinguished from
fully completed cleanup. Shared customers/stores/drivers/trucks/products/warehouses
and trucking companies remain outside the deletion scope.

## Database inspection

Read-only Supabase inspection confirmed project migration 20261019053739 and the
approved installed function-body hashes/ACLs:

- delete_whole_trips_v1: `74396b2b4b01b1e08229fe38df4b0d11`
- preview_whole_trip_deletion_v1: `0cb5b7fa062eb1b625a03641bc838624`
- delete_transaction_with_cleanup_v1: `3b7a9b77fe3cfdfd41e250f6c6a0ce72`
- validate_transaction_cleanup_objects_v1: `c1b5f86607c98d18a4df072de4ad9719`

RPC execution remains service-only. Existing PODs and operational reports alone
are not blockers: verified exclusively owned records are eligible. Ambiguous/shared
objects, pending uploads, financial records and protected history remain blocked.
No schema migration, permission, publication or Storage-policy change is needed or
was executed in this phase.

## Verification

- Backend: **212/212** tests passed.
- Frontend: **99/99** tests passed, with the app TSX configuration.
- Disposable PostgreSQL 18: **33/33** cases passed. Two new cases explicitly cover
  a single-stop duplicate trip with no POD, and eligible POD plus loading/unloading,
  backload/offload dependencies. Existing cases cover multi-stop deletion, shared
  master preservation, attachment ownership, financial blockers, batch rollback,
  20/21 limits, roles, concurrent mutations, immutable cleanup and retry.
- **5/5 isolated browser fixtures** passed: trips-bulk-deletion,
  transaction-deletion (now verifies unified parent deletion), report-wizard,
  tracker-trip-deletion and trip-deletion-realtime. The two-context Socket.IO
  fixture verifies sibling removal and unrelated active-draft preservation.
- Frontend/backend TypeScript and production builds passed. Targeted ESLint for
  ReportDataView passed. git diff --check passed. Existing Vite large-chunk warning
  remains.

Initial fixture setup issues were corrected and rerun: the new single-row assertion
used plural instead of singular UI text; the realtime fixture initially had no
local isolated socket server. Assertions pass with the correct text and isolated
server. No production services were used as destructive fixtures.

## Files changed this phase

- frontend/src/components/admin/ReportDataView.tsx
- frontend/tests/trips-bulk-deletion.browser.js
- frontend/tests/transaction-deletion.browser.js
- frontend/tests/report-wizard.browser.js
- backend/tests/fixtures/safe-trip-attachments-2d3.cjs
- This report and docs/tms-table-overhaul-progress.md

No backend production-code change was required. Existing worktree changes were
preserved. No production trips/receipts/Storage objects were selected or deleted,
no feature flags changed, and no deployment, commit or push occurred. Actual live
deletion/file cleanup was intentionally not tested; the Admin must initiate any
such operation in the application. There are no new implementation blockers.
