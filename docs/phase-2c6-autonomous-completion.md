# Phase 2C.6 — Installation, deletion password coverage and local activation

Date: October 18, 2026. Project: `hdmknewarynwpbrhfgai`.

## 1. Status and evidence boundaries

| Area | Result |
| --- | --- |
| Backload creator view and cleanup RPC | Installed and read back from Supabase |
| Offload/Backload reporting | Existing shared workflow retained; Backload deletion now always uses its atomic RPC |
| Legacy transaction/last-stop password bypass | Fixed in service, controller, client and existing confirmation dialog |
| Whole-trip deletion | **Enabled in the local backend runtime**, not deployed to a production host |
| Real Admin password/session check | Passed, authentication-only; original user/provider session survived refresh |
| Authenticated capabilities and impact preview | Passed, read-only; preview surfaced a real attachment-retention blocker |
| Production deletion/submission acceptance | Not performed; no disposable production trip/report scope was supplied |
| Multi-instance Redis infrastructure | Not provisioned/tested live; mocked shared coordination/failure tests pass |

The owner authorized the two pending migrations, local runtime activation and necessary related fixes. Backup verification was explicitly waived. No recoverable data backup is claimed. Installation and activation do not authorize deleting existing trips for testing.

## 2. Supabase migrations

Both files were read completely and hashed from disk, tested in fresh disposable PostgreSQL databases, compared with the live schema and installed sequentially. Their contents did not need revision.

| File under `backend/migrations/` | SHA-256 | Installation |
| --- | --- | --- |
| `2026_11_09_proposed_backload_creator_attribution.sql` | `D420DA31A42335FD05E03F62ED3E4F9F3DAB969956DCE9F9B8A21415BE3A7333` | `20261018084339`, `backload_creator_attribution` |
| `2026_11_10_proposed_backload_deletion_cleanup.sql` | `9CC29592B7379FDC2605D138476BBA9B039B76734C6F28AD23B48096AC520980` | `20261018084357`, `backload_deletion_cleanup` |

Each is recorded exactly once. Neither was rerun after the pause/reconnection. Previously installed creator, driver-parent and whole-trip migrations were not reapplied or edited.

Verification:

- Operations view retains all 28 columns and types, owner and ACL. Backload reporter projection now uses `coalesce(created_by, submitted_by)` for display, dataset-wide search and sorting. Offload projection is preserved. No creator backfill was performed.
- New `delete_backload_with_cleanup_v1(p_backload_id uuid, p_actor_id uuid)` is owned by `postgres`, SECURITY DEFINER, with fixed `pg_catalog, public` search path. Service role can execute; anon/authenticated cannot.
- Backload journal has RLS enabled. Browser roles cannot read/write it. Service role has journal SELECT and limited cleanup-acknowledgement UPDATE, without direct INSERT or DELETE grants.
- Browser table grants deny SELECT, INSERT and DELETE on Offloads and Backloads. Legacy permissive SELECT policies are not effective access grants. Protected backend APIs remain the read/write path; no permission broadening was needed.
- Existing Offload, transaction, whole-trip and preview RPC definitions/grants are unchanged. The driver-parent FK/compatible last-stop RPC remains installed.
- Existing RLS policies, Realtime publication membership and receipt bucket configuration are unchanged. The bucket remains private, 5 MiB, JPEG/PNG/WebP.

Definition fingerprints (MD5 of normalized `pg_get_functiondef`, not migration-file checksums):

| Function | Fingerprint |
| --- | --- |
| `delete_backload_with_cleanup_v1` | `5eb412e46ce5000625ccf3708d7410ac` — matches disposable installation |
| `delete_transaction_with_cleanup_v1` | `91fd1eaf57d95d3f646b58d5d2d4bdd6` |
| `delete_whole_trips_v1` | `415806981c4151a4f5a6f657cdb3dca0` |
| `preview_whole_trip_deletion_v1` | `f5ce5005b616f789a5026610d1531fe5` |
| `delete_offload_with_cleanup_v1` | `7750cf17bd87d1770a2e1a79f359c210` |

Schema recovery: `backend/migrations/recovery/phase_2c6_operations_view_before.sql` captures the original view definition only. It is not a data backup and was not executed. Preserve cleanup journals and snapshots during recovery; they cannot restore already deleted Storage bytes. No automatic schema rollback was performed.

## 3. Reporting and original creator

The Trucker Report Trip modal and Admin form share submission/validation/upload services. Assigned dispatch choices retain exact trip/stop UUIDs; the backend independently checks active assignment, trip/stop ownership and Offload DR eligibility. Required reason preserves internal line breaks. Multiple image previews/removal, progress, double-click prevention and partial-upload retry remain implemented.

New reports use server-derived authenticated identity for `created_by` and `submitted_by`. Updates reject creator fields, and Admin edits preserve a Trucker's original attribution. Names resolve through profiles, with the existing unavailable fallback for historical unknown creators. Both report kinds now have database-backed creator search/sort. No live reports were created to demonstrate this: Admin/Trucker creation-to-projection behavior was tested with mocked identities and disposable SQL fixtures.

Ordinary report-type relabeling remains disabled; historical audited conversion infrastructure is preserved. No duplicate reporting page, bucket, presence service or layout storage was introduced.

## 4. Record-only deletion and cleanup

Offloads use their installed atomic deletion/journal RPC. Backloads now use the new atomic RPC for **both reports with images and reports without images**, replacing the remaining independent DELETE fallback. Each removes only its eligible physical report, owned items and receipt metadata. Neither deletes the parent trip, stops, assignments, PODs, sibling reports or financial records.

Both use the shared cleanup engine and generic pending-cleanup/retry routes. Database deletion records the journal before Storage removal. Ownership checks, conversion history, retained documents and foreign keys can block deletion atomically. Failed Storage removal or acknowledgement leaves an explicit recoverable pending job; retry targets only exact journal-owned objects. Retrying cleanup does not initiate another logical report or parent-trip deletion.

Optional-report bulk deletion retains individual protected/success/pending outcomes. Whole-trip bulk deletion remains all-or-nothing under its separate atomic RPC. Both use exact identities; no displayed row index, DR or dispatch string substitutes for a UUID.

## 5. Password verification and permissions

The current account's password is verified server-side through an isolated, non-persisting Supabase Auth client. Email is derived from the original bearer; the verified user ID must match. The temporary verification session is signed out locally, while the original bearer/application session and role are checked again before mutation. Passwords are not stored, logged, placed in URLs or returned in errors. No reusable deletion authorization token is issued.

The legacy transaction service formerly reached `delete_transaction_with_cleanup_v1` without a password. This mattered because deleting the final stop can remove an empty parent. `createTransactionDeleter` now binds immutable actor/trip/stop identity to the current-user guard. The controller, frontend service and existing dialog send the password in the request body. Empty passwords never issue requests; cancellation, failure, success and account/token changes clear transient password state.

| Operation | Role policy after this checkpoint |
| --- | --- |
| Submit Offload/Backload | ADMIN/STAFF management; TRUCKER only on actively assigned trips |
| Delete optional Offload/Backload report | ADMIN/STAFF, own password; TRUCKER denied |
| Combined/Tracker whole-trip deletion | ADMIN only, own password; STAFF/TRUCKER denied |
| Existing Trips transaction deletion | Existing reviewed ADMIN/STAFF policy retained, now own-password protected; final-stop cleanup may remove an eligible empty parent under that policy |
| Cleanup retry | Existing management authorization, exact previously committed journal only |

No Staff whole-trip permission was added. The legacy transaction permission is explicitly retained rather than silently changed into the new Combined/Tracker whole-trip operation. Compensating cleanup of a newly created, failed trip is not a user-selectable deletion endpoint for existing trips.

Whole-trip selections remain page-scoped and resolve authoritative parent IDs. Multiple selected stops from one trip yield one parent; maximum twenty unique trips, with twenty-one rejected atomically. Password confirmation is bound to the immutable request batch. The database independently rechecks role, financial/history/attachment blockers and exact relationships; a prior preview is not deletion permission. Audit metadata remains in the durable deletion journals.

## 6. Live authentication-only acceptance

The dedicated Admin signed in manually and entered the password in a masked local acceptance panel. The assistant did not read or receive the password. The localhost/non-production-only `POST /api/auth/password-confirmation-check` uses the actual password guard with a non-mutating callback. It cannot call a deletion RPC or create reusable permission. It is not registered in production and rejects non-loopback clients.

Observed result before the pause:

- Password verification passed with real Supabase Auth.
- Original authenticated user was preserved.
- Original provider session identity was preserved through refresh.
- Original refresh succeeded; the temporary verification session did not replace it.
- Password field was empty afterward; destructive requests were zero.
- Authenticated `GET /trips/whole-delete/capabilities` returned `enabled=true`, limit 20, password required.
- Authenticated read-only impact preview returned correct physical relationships and a real blocker: legacy driver POD attachments require ownership/retention review. `can_delete=false`; no deletion was attempted.
- The same session's Socket.IO connection remained connected.

Supabase's live public Auth settings also confirmed email/password authentication enabled. After the pause, the controlled browser was reset to `about:blank`; no second live password test was invented or requested merely to reproduce the earlier evidence. This was one Admin authentication acceptance, not a new live Trucker submission or independent two-user session test.

## 7. Runtime activation, topology and Redis

Local ignored `backend/.env` now contains `WHOLE_TRIP_DELETE_ENABLED=true` and `WEB_CONCURRENCY=1`. Only those keys were changed. Tracking and PDF remain false, planned routes unset/default false, POD review true. No secret values were copied into source, examples or documentation.

The known project backend was restarted after process ownership verification. Startup confirmed the enabled flag in the actual process, one worker and no Redis configuration. After the pause, the local backend/frontend were restarted as hidden development processes, with startup status and `/api/health` verified again. Anonymous capability requests return 401. Frontend confirmation uses the backend impact/capability state, so no incompatible build-time deletion flag is required.

This is **local runtime activation only**. Hosting/deployment remains postponed; no deployed production environment or production worker topology was accessed or changed.

Rate policy remains five confirmations per account per fifteen minutes with overlapping-request prevention. Invalid, fractional or nonpositive worker counts now fail closed rather than accidentally selecting an uncoordinated limiter. Multiple workers require the shared Redis path; unconfigured/unavailable Redis fails closed. Shared budget, lease, TTL, stale release, concurrency and outage behavior pass isolated protocol tests. Real multi-replica Redis remains a future deployment acceptance requirement, not an infrastructure claim.

Rollback: set `WHOLE_TRIP_DELETE_ENABLED=false` in the **local backend runtime configuration** and restart that backend. No schema rollback or journal deletion is needed to disable the feature. The same procedure must be applied separately to any future deployed environment.

## 8. Storage, Realtime and final preservation checks

No Storage bucket/policy or Realtime publication change was required. Existing minimal change signals and Socket.IO reconciliation invalidate the affected report/trip/map caches. Shared layouts, cell drafts and pagination behavior remain covered by browser fixtures. Cleanup journals are private and are not newly published to browsers.

Final post-reconnection live read-only counts match the pre-installation baseline:

| Entity | Before / after |
| --- | --- |
| Trips / stops / line items | 7 / 8 / 9, unchanged |
| POD records / trip images | 1 / 9, unchanged |
| Offloads / Backloads | 0 / 0, unchanged |
| Billing / payable / receivable rows | 0 / 0 / 0, unchanged |
| Driver-update orphans | 0 |
| Backload deletion jobs | 0 |
| Whole-trip audit markers | 0 |
| Private report-receipts Storage objects | 1, unchanged and untouched |

The unowned receipt object remains excluded from cleanup. No old Offload cleanup targets appeared, and no production report or trip was used as a destructive fixture. Existing DR 333 data was not edited.

## 9. Tests and files

- Full backend: **197/197 pass**, zero failures/skips. Full frontend: **88/88 pass**, zero failures/skips. Test processes forced the whole-trip flag off except for explicitly mocked activation cases; actual runtime settings were not changed by those test processes.
- Seven isolated browser fixtures passed: transaction deletion/password, whole-trip password/focus/session handling, Tracker parent deduplication/role/page scope, Operations record deletion, Trucker Report Trip, Admin/Trucker DR submission, and 102-row Operations pagination/search/sort/cache/draft preservation. All fixture mutations were intercepted.
- Disposable PostgreSQL: both pending migrations; 28-column/ACL creator contracts; Admin/Staff/Trucker attribution and unknown fallback; record-only cleanup/ownership/history/retained-document/FK rollback; last-stop compatibility; whole-trip financial/attachment safeguards; 20/21-parent boundary; two concurrent whole-trip callers; three synchronized driver/deleter races. Existing whole-trip tests passed with the new Backload journal installed. The owned disposable cluster was stopped after verifying its data directory.
- Backend/frontend TypeScript and builds pass. Changed frontend TypeScript-file lint passes. Backend has no configured ESLint task. Git diff/index checks pass. Existing Vite large-chunk warnings remain.

Files changed: transaction controller; Auth/trip routes; server startup status; confirmation limiter; Operations/transaction/whole-trip deletion services; ReportDataView and trip client; password/transaction HTTP and unit tests; manual live-auth acceptance helper; captured view recovery SQL; this report and progress checkpoint. The two installed migration files were unchanged.

## 10. Remaining limits and safety

Production deployment/activation, real multi-replica Redis, live Trucker report submission, live report-image upload/cleanup and destructive acceptance were not performed. Future live write acceptance needs a specifically designated disposable scope, excluding protected existing records. No credentials were invented.

Existing limits remain: in-form duplicate-click/upload-retry protection is not durable creation idempotency after a lost POST response; the Backload twenty-image limit is not newly proven atomic under simultaneous uploaders. Gemini billing, GPS, Mapbox Directions, planned routes and PDF intake were not activated or exercised.

No existing production trips or unrelated operational records were removed or modified. Only the two authorized schema migrations were applied; legitimate authentication/session operations occurred during the authorized live check. No production Storage upload/deletion, destructive live test, unapproved schema change, permission broadening, deployment, commit or push occurred.
