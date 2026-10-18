# Phase 2C.2 — Driver-parent / last-stop compatibility

Date: October 18, 2026. **Local review and disposable testing only. Nothing installed.**

## Verdict

**SAFE TO APPROVE the revised files below**, subject to separate explicit approval,
fresh live preflight, and deployment of the files at their final checksums. The
original driver-parent and whole-trip hashes are superseded and must not be used.
This is not permission to activate whole-trip deletion or execute a live test.

The original RESTRICT-only proposal was incompatible with eligible last-stop
deletion. That regression was reproduced against the exact live RPC in PostgreSQL
18 before changing the proposal. The revised driver-parent proposal installs the FK
and compatible RPC together, transactionally, so there is no intended interval
where the new FK is installed with the old deletion implementation.

## Migration identity

All hashes computed from disk. All three files were already untracked at inspection
and remain untracked. Existing tracked, staged and unrelated untracked work was
preserved. No unresolved Git index entries.

| Proposal under `backend/migrations/` | Original bytes / SHA-256 | Final bytes / SHA-256 |
|---|---|---|
| `2026_11_06_proposed_operations_creator_attribution.sql` | 5437 / `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC` | 5437 / `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC` |
| `2026_11_08_proposed_driver_update_parent.sql` | 1611 / `1873958F6861F0A14B77F0C69ECFBD9EA75D40A1034BD766BAFA292FA65F2A9C` | 16918 / `9DCB55827F469F6E173239E189F814222291B7718B612252EEBF6C84AFAE3D09` |
| `2026_11_07_proposed_whole_trip_deletion.sql` | 11101 / `E92A1B854FA244771801EA0FD6808373E11188D9E102041A4E22C218DA4DC5AA` | 11567 / `5790AA11C3D64E7888C1DA4F48BE7F1C8736C9DFAA84612F887843DD788CDE76` |

All initial hashes matched the user's expected values exactly. Creator SQL is
unchanged. Driver SQL was expanded to fix the demonstrated last-stop regression;
whole-trip SQL now requires and delegates to that compatible shared implementation.

## Read-only project and database findings

- MCP configuration project: `hdmknewarynwpbrhfgai`; backend SUPABASE_URL host
  resolves to the same project; matches target. No keys printed.
- Migration history still ends at `20261017124148 planned_routes`. None of the
  three proposals is recorded, neither new whole-trip RPC exists, and the proposed
  driver-parent FK is absent. Creator view still has delegate-first precedence.
- Live original transaction RPC definition MD5 remains
  `9d11efef4875f0d32256d589db30a9e6`, postgres-owned SECURITY DEFINER with
  `search_path=pg_catalog, public`, executable only by owner/service_role.
- Driver updates: **46 rows, 6 distinct parents, 0 orphans, 8 rows with nonempty
  POD URL/path**. The prior checkpoint's 45-row count is historical, not current.
  Counts were unchanged across this task's two read-only inspections. No assertion
  is made that other users could not modify the application concurrently.
- `driver_trip_updates.trip_id` is NOT NULL UUID, but has **no existing FK**.
  There is no stop ID. DR text is not a reliable stop relationship. Driver ID also
  has no FK. No other table FK references driver updates. POD URL/path columns are
  logical attachment references; there is no ownership-enforcing attachment FK.
- RLS enabled, no policies, no browser SELECT grant. Service-role base privileges
  already exist. Driver updates are not directly published for Realtime; the
  existing statement-level `admin_change_signal_trg` supplies secure invalidation.
- Parent/stops retain their existing change/version/updated-at triggers; converted
  unloading stops retain their immutability trigger. No trigger is changed here.
- Existing FK inventory is in `phase-2c1-database-catalog.json`. Rechecked direct
  trip/stop/assignment/POD dependencies agree: tracking/cache are assignment-owned;
  financial tables cascade structurally but are explicitly protected by RPC guards;
  conversion history RESTRICTs. Master truck/driver records are not owned children.
- Receipt bucket remains private. No bucket, policy, grant or publication changes.

## Exact existing deletion path

Trips transaction action in ReportDataView -> existing trip client ->
`DELETE /trips/:id/stops/:stopId` (or exact stop-less `/trips/:id`) ->
`transaction.controller.ts` -> `transaction-deletion.service.ts` ->
`delete_transaction_with_cleanup_v1(uuid,uuid,uuid)` -> durable exact-object cleanup.
Existing transaction authorization remains ADMIN/STAFF; Trucker is denied.

The RPC sets `v_last` by checking for sibling stops, deletes the exact stop, then
executes `DELETE FROM public.trips WHERE id=p_trip_id` when `v_last` is true. Its
original definition never touched driver updates. With no FK this can orphan them;
with the original proposed RESTRICT FK it fails and rolls back even when those
updates have no attachments. No inspected API depends on leaving an empty parent
after successful final-stop deletion. Partial-stop deletion must retain the parent.

Trucker status/receipt services validate assignment/stop before separate writes,
then insert driver history. They can race with deletion; an earlier validation is
not a write lock. The new FK rejects a delayed history insert after parent removal.
Those pre-existing multi-request trucker services are not made wholly transactional
by this migration; a racing request can fail and must refresh its assignment.

## FK choice and compatible explicit cleanup

| Strategy | Assessment |
|---|---|
| RESTRICT alone | Reject: breaks eligible final-stop deletion, reproduced locally. |
| CASCADE | Reject: could silently erase legacy POD references without ownership review, audit or exact-object journaling. |
| RESTRICT + explicit transactional cleanup | Recommended: eligible updates resolved only when removing parent; unresolved attachments fail closed. |

Revised driver-parent SQL preserves the NOT VALID RESTRICT FK. It preserves any
historical orphans without validation/backfill/deletion and enforces future writes.
It replaces the existing transaction RPC using its full catalog-verified definition
with only these changes:

1. Append driver updates to the existing ordered table-lock list.
2. When removing the parent, block nonempty driver POD URL/path references.
3. Before journaling owned Storage keys, also block exact objects referenced in
   retained driver URL/path history, including another trip.
4. Journal eligible update IDs/count in the existing private job snapshot; no draft,
   receipt contents, new private URLs or profile data are added.
5. On the final stop/empty parent only, explicitly delete eligible exact-trip driver
   updates immediately before parent deletion, within the same transaction.

All existing financial, conversion, document, source-item, Storage and identity
checks remain. Signature, owner, ACL, authorization, search path and return contract
remain unchanged. CREATE OR REPLACE preserves ACL/owner. Installation refuses an
unexpected original/revised function definition, unexpected browser execution ACL,
or incompatible same-name FK. Definition hashes normalize CRLF to LF; the revised
catalog definition MD5 is `91fd1eaf57d95d3f646b58d5d2d4bdd6`.

The whole-trip proposal requires that exact compatible definition and the expected
FK. Its duplicate driver-update DELETE was removed. It still locks/rechecks the
batch, blocks unresolved attachments, and adds whole-trip counts/actor/dispatch
audit to the same jobs. A failure in any parent rolls back the entire selected batch.

Partial stops retain driver history/attachments and shared assignments. Final stops
with unresolved legacy attachments are deliberately blocked pending ownership and
retention review. No legacy attachments are guessed, cleaned or migrated here.

## Concurrency, Storage, audit and limits

- Same established lock order plus driver updates; 3-second lock timeout. These are
  coarse locks, so schedule future installation and destructive operations carefully.
  Installation of a NOT VALID FK avoids scanning legacy rows but still needs locks
  on parent/child. No automatic lock-timeout retry or corrective SQL is authorized.
- An earlier eligible history writer commits, then deletion resolves that row. An
  earlier attachment writer causes full deletion rollback. A later writer waits for
  deletion, then fails FK validation. These cases used lock-state barriers and two
  independent psql transactions rather than timing-only concurrency assumptions.
- Repeated deletion returns original job(s), and two concurrent whole-trip callers
  return matching acknowledgements without duplicate journal entries.
- Database deletion and physical Storage cleanup are not one transaction. Exact
  keys are journaled before DB deletion. Only acknowledged commits start backend
  cleanup; failure remains PENDING_STORAGE with idempotent retry. No prefix deletion.
- Prior POD review/audit history remains; cleanup jobs retain actor/parent/stop,
  driver-update IDs/count, original recovery snapshots and whole-trip summary.
  Driver-update text is not newly copied. Restoring a committed deletion requires
  approved backups; SQL rollback cannot recover files removed after commit.
- Disposable schema models the documented operational/FK/attachment relationships,
  not every live column, financial-ledger detail, trigger or external consumer.
  No authenticated production deletion, live Storage cleanup, or real trucker
  race was attempted. Unknown legacy attachment ownership remains a real blocker.

## Unified Combined / Tracker verification

Both resolve actual `trip_id`, deduplicate parent UUIDs, use WholeTripDeletionDialog,
the same API client, Admin-only endpoint/service and `delete_whole_trips_v1` RPC.
Tracker's builder explicitly emits `trip_id: stop.trip_id`; no POD/DR/dispatch/index
inference. Impact preview is the same service-only, Admin-checked RPC. A stale or
missing selected physical row fails closed. Preview blockers cannot authorize the
actual delete: protected data is rechecked under transaction locks.

On confirmed success the shared client invalidates Trips, reports/Tracker/Operations,
Home, tracking/map, relevant trucker/flex/calendar/document caches while preserving
unrelated Users cache. Existing secure change signals and Socket.IO bridge handle
cross-session reconciliation and active drafts; no new subscriptions/publications.
Both screens remain blocked from live deletion while the feature flag is off.

## Verification results

- Final backend **169/169**, frontend **85/85**, zero failed/cancelled/skipped.
- Backend and frontend TypeScript checks and production builds pass; compiled PDF
  worker retained. Existing Vite large-chunk/plugin timing warnings remain.
- The initial backend run under concurrent build/browser load was **168/169**:
  synthetic PDF rendering exceeded its existing 15-second budget. The complete
  quieter rerun passed **169/169**, including that test in about 3.1 seconds. No
  timeout was weakened and no unrelated PDF code was changed.
- Eleven isolated browser fixtures passed: Tracker whole-trip, Combined wizard,
  shared deletion dialog, retained reports, Operations actions, Tracker pagination,
  loading milestones, Home demo map, real App trip routing, two-context secure
  Realtime, and existing transaction deletion. All mutations were intercepted.
- Targeted frontend lint retains exactly the two prior Tracker errors:
  `no-control-regex` (line 96) and `react-hooks/set-state-in-effect` (line 300).
  Other targeted deletion client/dialog, ReportDataView and unit-test files pass.
  No frontend source changed in this checkpoint. New/updated CJS fixtures pass
  Node syntax checks; backend has no configured ESLint task.
- Git diff/cached diff whitespace checks pass. Existing Git LF/CRLF conversion
  notices remain. No unresolved index entries.

Disposable checks completed:

- Original RESTRICT regression and complete rollback reproduced: **1 case passed**.
- Revised last-stop compatibility: **15 cases passed, 0 failed** (no updates,
  eligible updates, Staff permission, repeat request, path/URL attachments, finance,
  conversion, shared object reference, partial/final stops, Trucker denial, owned
  POD cleanup/audit, late failure rollback, retained trip-level attachments).
- Independent driver/deleter transaction races: **3 passed, 0 failed**.
- Installation definition/FK/privilege drift rejection: **3 passed, 0 failed**.
- Whole-trip modeled relationship/retention/rollback suite passed, including
  unrelated preservation, deduplicated parents, protected conversion/financial
  data, tracking cascades and historical orphan preservation.
- Repeat-install comparison: **12 modeled operational/audit table hashes unchanged**;
  existing RPC owner/ACL/arguments/security/search path unchanged.
- Concurrent whole-trip callers: **2 clients, 2 identical acknowledgements, 2 jobs**.
- Creator contract: **28 columns and ACL preserved**, idempotent; all three roles,
  distinct delegate, unknown creator, 125-row search/sort checks passed.
- An initial local proposal fingerprint check exposed Windows CRLF versus stdin
  LF differences. Definition guards now normalize CRLF before comparison. Repeated
  file/stdin installs and deliberate definition/FK/ACL drift tests pass. This was a
  disposable harness failure; no live installation was attempted.
- Browser fixtures use intercepted APIs and isolated identities, not production
  accounts. Shared confirmation, cancellation, duplicate-click protection, exact
  Tracker parents, report retention, pagination, wizard, stop isolation, map demo,
  milestone editing, routing and draft-safe Realtime were exercised.

## Approval checklist and recovery — do not execute

1. Approve unchanged creator SQL at its final hash. It can be installed independently.
2. Approve **revised driver-parent SQL at the new hash**, including the replacement
   existing stop-deletion RPC. FK and compatible RPC must be installed together.
3. Approve **revised whole-trip SQL at its new hash**, after step 2. It must fail
   installation if its expected FK or compatible function fingerprint is missing.
4. Before installation, recheck target project, exact hashes, migration history,
   original RPC fingerprint/ACL, counts/ownership and live schema drift. Capture
   original function/view definitions, owners/ACLs and an approved recovery backup.
5. Post-install read-only checks: definitions, ACLs, RLS/publications unchanged,
   historical rows preserved, service-only execution, no operational writes.
6. Keep WHOLE_TRIP_DELETE_ENABLED=false. Activation, designated test records,
   cleanup monitoring/backup policy and authenticated write acceptance need separate
   authorization. DR333 remains excluded. Resolve legacy attachment ownership only
   through a separately approved process.

Order remains creator -> driver-parent + compatible stop RPC -> whole-trip RPCs.
No further schema/grant/RLS/publication proposal is required for this compatibility
fix. Rollback must first disable whole-trip deletion/restart. With separate approval,
remove the two new whole-trip functions, then restore the captured original stop RPC
and drop only the new FK **together in one transaction**, without CASCADE. Never
leave the old stop RPC behind with the restrictive FK. Restore the creator view's
captured prior definition separately if required. Retain all existing cleanup jobs.

## Files changed in this checkpoint

- Revised local SQL: driver-parent and whole-trip proposals; creator unchanged.
- Updated fixtures: whole-trip review assertions and proposal repeat-install checks.
- New fixtures: last-stop-original-restrict-check.sql,
  last-stop-compatibility-check.sql, last-stop-driver-concurrency.cjs,
  driver-parent-install-guards.cjs (all under backend/tests/fixtures).
- Documentation: this report, superseding notes in the Phase 2C.1 review,
  main overhaul progress checkpoint. No application code or feature flags changed.

## Safety

Only read-only SELECT/catalog queries were sent to Supabase. No live migration,
operational INSERT/UPDATE/DELETE, mutating RPC, Storage deletion, schema/RLS/grant/
trigger/publication change, feature activation, GPS, Mapbox/Gemini request,
deployment, commit or push occurred. DR333 and all live operational records were
untouched by this work. Destructive tests ran only in owned local PostgreSQL or
intercepted browser fixtures. Stop here pending separate approval.
