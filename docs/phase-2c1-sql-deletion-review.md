# Phase 2C.1 - SQL review and unified trip deletion

Date: October 18, 2026. **Review/preparation complete; live deletion remains disabled.** This supersedes the prior Tracker-only deletion-policy blocker: the user confirmed both Combined and Tracker delete the entire parent trip.

**Superseded compatibility note:** Phase 2C.2 subsequently resolved the last-stop
RESTRICT regression in local proposals. See `phase-2c2-deletion-compatibility.md`
for the revised driver-parent/whole-trip checksums, compatible existing RPC
replacement, disposable concurrency tests and current approval checklist. The
hashes and unchanged-RPC statements below describe the earlier 2C.1 checkpoint,
not the final proposals. Neither version has been applied live.

## A. Migration identity and compatibility

All hashes below were computed directly from disk, not copied from previous documentation. Both initial proposals were untracked and remain untracked; existing tracked/untracked Phase 2C work was preserved. No unresolved index entries were found.

| File | Initial bytes / SHA-256 | Final bytes / SHA-256 | Changed here? |
|---|---|---|---|
| `backend/migrations/2026_11_06_proposed_operations_creator_attribution.sql` | 5437 / `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC` | 5437 / `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC` | No |
| `backend/migrations/2026_11_07_proposed_whole_trip_deletion.sql` | 2868 / `F760738B3FBACD72A5C075FC0A3FA29150F793A6D49B6501DA308A0BC743959D` | 11101 / `E92A1B854FA244771801EA0FD6808373E11188D9E102041A4E22C218DA4DC5AA` | Yes |
| `backend/migrations/2026_11_08_proposed_driver_update_parent.sql` | New proposal | 1611 / `1873958F6861F0A14B77F0C69ECFBD9EA75D40A1034BD766BAFA292FA65F2A9C` | Created |

### Project and installation checks

- MCP project scope from the local MCP configuration: `hdmknewarynwpbrhfgai`.
- Backend `SUPABASE_URL` project: `hdmknewarynwpbrhfgai`; expected target matches both. No credentials were printed.
- Live migration history still ends at `20261017124148 planned_routes`; no creator-attribution/whole-trip/driver-parent proposal is recorded.
- `delete_whole_trips_v1(uuid[],uuid)` and `preview_whole_trip_deletion_v1(uuid[],uuid)` are absent live. The proposed driver-parent constraint is absent. Existing view still prefers the editable delegate, proving the creator proposal has not been applied under a different migration name.
- Existing transaction RPC remains service-executable, not browser-executable. Its catalog definition MD5 is `9d11efef4875f0d32256d589db30a9e6`; exact catalog definition is used in disposable tests and is unchanged by the new proposals.

### Creator attribution proposal (unchanged)

`created_by` is the authenticated creator; `submitted_by` is the authoritative fallback for legacy/trucker submissions. Editable `reported_by` is a separate delegate and must not replace the original submitter. Existing create paths derive creator/submitter from server identity; update validation rejects `created_by`/`submitted_by` rather than accepting them as editable fields. Profiles of all three roles resolve through the existing profile join. Unknown IDs/names remain unavailable; no backfill or guessed creator is introduced.

The proposal only changes the Offload source reporter projection. Disposable comparison confirms **28 column names/order/types unchanged**, existing ACL unchanged, and the normalized view definition differs only by removal of delegate-first precedence. Search text and natural-sort fields therefore use the creator name across pages. Live dependencies are the view's own return rule/type; the existing natural-sort helper and backend API consumers remain compatible. Service-only view access remains; no browser grant, base-table grant, RLS, trigger or publication change. Reapplying the proposal locally is idempotent.

Rollback requires capturing `pg_get_viewdef` and existing metadata before a separately approved install, then restoring that exact prior definition. No operational-data rollback is required. Existing historical creator IDs are never rewritten. PostgreSQL owners/service credentials remain privileged; API immutability does not claim to constrain a database administrator.

### Whole-trip proposal (revised; old hash is no longer approvable)

The revised proposal adds **two narrow service-only functions**:

- `preview_whole_trip_deletion_v1(uuid[],uuid)`: STABLE, Admin-checked SECURITY DEFINER, fixed `pg_catalog` search path; returns trip identities, counts and known financial/history/legacy-attachment blockers. It avoids broad table grants.
- `delete_whole_trips_v1(uuid[],uuid)`: Admin-checked SECURITY DEFINER, fixed search path, one outer transaction. It reuses existing per-transaction retention checks and durable cleanup jobs under the established lock order. Any failure rolls back all selected trips, newly created jobs, driver-update removals and audit metadata.

Live service-role SELECT is missing on **pod_records, pod_drive_files and backload_items**. The previous TypeScript impact implementation would therefore fail even with deletion enabled. The narrow preview RPC corrects this capability gap without granting direct access to private records. Both RPCs revoke PUBLIC/anon/authenticated execution and grant only service_role. Browser clients cannot choose an actor ID; the protected backend derives identity/role, and SQL verifies the current profile role again.

Input is bounded to 20 distinct parents (backend accepts/deduplicates at most 100 selected-row IDs); UUIDs are validated and canonicalized. SQL accepts UUID arrays, deduplicates, locks in stable order and rechecks ownership/financial dependencies at execution. Preview is informational, not authorization: records can change after preview and atomic guards can still reject the operation. Missing parents with no prior job fail; retries for an already deleted parent return existing jobs. Public acknowledgements omit private snapshots and Storage paths.

Existing recovery snapshots are retained. Added audit metadata contains acting Admin, selected parent IDs, dispatch, database deletion timestamp, per-parent affected counts and database result. It does not add document text, credentials, GPS coordinates or image bytes. Cleanup state on the existing journal records eventual Storage completion. The same per-parent summary can appear on each stop job and must not be summed across jobs as separate trips.

No change to the existing transaction RPC's image regex is needed. The apparent extra escaping in an earlier tool rendering was checked using the exact catalog pattern: it contains one backslash and correctly accepts ordinary `.jpg` names. No regex repair is proposed or applied.

### Additional required proposal: driver update parent integrity

A catalog FK walk alone missed **driver_trip_updates**, whose UUID `trip_id` has no FK. Read-only live counts: **45 rows, 0 current orphans, 8 rows with legacy POD URL/path references**.

`2026_11_08_proposed_driver_update_parent.sql` adds only a `NOT VALID` FK from `driver_trip_updates.trip_id` to `trips.id`, with **ON DELETE RESTRICT**, not CASCADE. This preserves any historical orphan without backfill/deletion, while enforcing future writes and preventing a delayed driver update from creating a new orphan after parent deletion. No direct table grants, RLS or publication changes are introduced. The revised whole-trip proposal fails installation unless that exact parent-column protection exists.

Whole-trip deletion explicitly removes exact-trip driver updates **without attachment references**, within the same transaction; it blocks legacy URL/path references for ownership/retention review. It never guesses their bucket/path or removes those files. Driver-update counts enter the preview/audit. The explicit operation and FK prevent a loose cascade from silently deleting unreviewed POD references.

**Compatibility consequence requiring approval:** existing stop-only deletion may now fail safely when deleting the last stop of a trip that still has driver updates. The original RPC is unchanged and does not resolve those records. SQL fixture tests prove the RESTRICT failure rolls back that call, and the new whole-trip workflow handles eligible updates. STAFF's existing stop API is not silently repurposed into the new Admin-only report deletion workflow.

The FK is deliberately not validated automatically even though current orphan count is zero. Installation changes no operational rows. Both new proposals are idempotent with expected definitions. The FK proposal rejects an unexpected same-name constraint. Rollback: disable whole-trip deletion/restart first; separately approve dropping the two new functions (deletion before preview) and the new named FK, without CASCADE. Do not purge or restore operational records automatically.

## B. Shared Combined / Tracker implementation

Both reports use:

1. `selectedParentTripIds` to resolve exact `trip_id` values from currently selected physical rows. Invalid/missing/stale rows fail closed. Shared dispatch/DR/sequence/POD IDs are never used to infer a parent.
2. `WholeTripDeletionDialog` for the same count preview, unique-parent count, dispatch/ID list, permanent cross-report consequence, blockers, Cancel and explicit confirmation.
3. `frontend/src/services/whole-trip-deletion.ts` for `/trips/whole-delete/impact`, `/trips/whole-delete` and identical cache invalidation.
4. The same protected backend `whole-trip-deletion.service.ts`, atomic SQL RPC, audit journal and post-commit cleanup implementation.

Tracker already exposes authoritative `trip_id`; `buildTransmittalTrackerRows` assigns `trip_id: stop.trip_id`, and its pagination view also exposes the parent. No Tracker view migration is needed. Selections are page-scoped and cleared on page/filter/source-identity changes and successful deletion. A confirmed refresh clamps an emptied final page to the last valid page, verified with a 26-row, 25-per-page fixture. Two selected stops of one trip resolve to one parent. Two trips with the same DR remain distinct.

Only Admin sees report whole-trip Delete; Staff and Trucker fail backend authorization and SQL checks. A changed DB role fails SQL even after an earlier Admin API check. With the application flag off, confirmation remains unavailable. If the preview RPC is missing, the dialog reports the migration prerequisite and cannot confirm; no fallback performs independent deletes.

Impact requests are scoped to token/selection so a late preview cannot authorize a newer selection. Duplicate clicks are guarded synchronously. Failure retains feedback; success appears only after backend acknowledgement. A committed DB deletion with failed Storage cleanup is explicitly reported as pending, not fully completed.

### Cache / Realtime

Confirmed success invalidates report page caches and API prefixes for Trips, Combined/Dispatch/Operations/Tracker, Home/dashboard, related trucker/trip details, tracking/map, flex source data, calendar and documents. Unrelated Users cache is preserved. Both reports use exactly this shared service; selected rows clear and the active report quietly reconciles. Existing secure Supabase statement signals and Socket.IO bridge propagate committed parent/stop/report/journal changes; no new subscription, full-page reload, browser grant or publication is added. Hidden retained panels reconcile on resume. Existing draft-safe refresh remains.

## C. Complete reference inventory

`docs/phase-2c1-database-catalog.json` records the live **54 FK edges** plus a separate logical-reference inventory. Ownership includes trips, stops, line items, assignments; loading/unloading, offload/backload and their item/receipt tables; POD records/images/Drive files; events, incidents, demurrage, documents, store calls; billings/payables/receivables; conversion history; and assignment-scoped tracking locations/route cache.

Non-FK references additionally include driver updates, flex source rows/cells, POD review history, transaction/offload cleanup journals, polymorphic admin notifications, audit_logs, report_audit_logs and flex_audit_events. Existing review/audit/notification/cleanup history is retained rather than indiscriminately deleted. Flex source rows belonging to deleted trip/stop/item/assignment/store-call sources are removed by the existing RPC; flex cells cascade. Report views are read models, not separately deleted entities. A final read-only source-binding check found 9 SOURCE flex rows, all STOP-scoped, matching the existing cleanup mapping.

Financial tables have cascade FKs in the current schema, but the existing RPC's explicit financial guards run under locks and block the entire operation before those cascades can remove financial history. Conversion history is RESTRICT and explicitly protected. Tracking rows/cache cascade only from the selected assignments; truck/driver master records are not owned children and are not deleted.

Legacy cross-stop cargo item references, inconsistent image/POD/stop ownership, shared/unsupported Storage keys, retained document/Drive references and legacy driver POD attachments can block deletion precisely. The wrapper does not bypass these guards or reorder ownership ambiguities to force deletion. PDFs remain outside the existing cleanup allowlist and require review; PDF intake stays off.

## D. Storage consistency / recovery

Database and Storage deletion are not atomic together. The database transaction journals exact owned keys before deleting rows. Only a confirmed DB acknowledgement permits existing cleanup code to remove those exact objects; no broad prefix deletion occurs. Shared references and unknown ownership block the DB operation. Storage failure leaves a durable PENDING_STORAGE job, and retry is idempotent. Backend fixtures verify failure then successful retry and exact paths. No live Storage deletion occurred.

Private recovery snapshots already contain business data by existing design; this phase retains those protected snapshots and adds only minimal count/identity metadata. A separate retention/backup policy remains necessary. SQL rollback restores uncommitted DB work, but cannot restore files removed after a committed deletion. Restoring committed operational deletions requires approved backups/recovery, not a claimed undo button.

## E. Test coverage and limits

- Full backend: **169/169**; frontend: **85/85**.
- Backend/frontend TypeScript and production builds pass; PDF worker remains included. Existing Vite >500 kB chunk warnings remain.
- Current changed-file lint: new client/dialog and ReportDataView pass; Tracker retains its two existing errors (`no-control-regex`, `react-hooks/set-state-in-effect`) already documented against HEAD. No new lint regression.
- Git diff and cached diff whitespace checks pass; no unresolved index entries.
- Ten browser fixtures pass: shared confirmation, actual Combined wizard/parent deduplication, actual Tracker whole-parent batch, Tracker pagination, retained reports, Operations actions, Home demo map, two-context secure Realtime/draft/resize/reconnect/logout, loading milestone editing, and real App Trip Details routing.
- Browser tests use isolated contexts, mocked identities and intercepted APIs. No authenticated production deletion was attempted.
- Disposable PostgreSQL 18 uses the exact live transaction RPC definition, representative tables/FKs and synthetic records. It does not install every production column, trigger, report view, upstream truck/driver master relationship or financial ledger detail. No claim is made that those unmodeled relationships received write acceptance testing.
- Creator API tests also verify authenticated creation and rejection of creator/submitter edits for all three roles.
- Creator contract test compares before/after definitions and ACLs, all 28 columns and repeated application; role tests use ADMIN/STAFF/TRUCKER names, a distinct delegate, missing creator, 125 rows, dataset search and sorting.
- Whole-trip proposal repeat-install tests preserve hashes for 12 modeled operational/audit tables and the exact existing transaction RPC definition. Independent psql contenders return matching two-job acknowledgements with no duplicate deletion.
- Initial disposable setup issues (re-running a non-idempotent original fixture installer, Windows Unicode command-line encoding and the RESTRICT SQLSTATE distinction) were corrected in fixture setup. Final runs pass; no live corrective SQL was executed.

### Required-case matrix

| Cases | Verification |
|---|---|
| 1-3 Single parent, multiple stops/items | Disposable zero-stop/single/multi-stop parents, separate line items |
| 4 Duplicate selected Tracker rows | Actual Tracker browser: two stops -> one physical parent; Combined browser uses same helper/dialog |
| 5 Multiple distinct parents | Disposable atomic batch; Tracker browser sends one deduplicated parent batch despite matching DR labels |
| 6-9 POD, Transmittal, cargo, loading/unloading | POD transmittal reference + flex cells, reports/items/receipts modeled and deleted only for selected parents |
| 10 Conversion history | Protected rejection and complete rollback |
| 11 Tracking / route cache | Assignment-scoped mocked rows cascade; no real GPS or Directions |
| 12-13 Finance and rollback | Billing, payable, receivable blockers; an earlier eligible parent is restored when a later parent fails |
| 14-15 Concurrency / duplicates | Two independent psql callers; existing-job retry, no duplicate jobs |
| 16-17 Unauthorized Staff / Trucker | Backend service rejection and SQL preview/delete rejection; Staff browser has no whole-trip action |
| 18-20 Missing parent, bad UUID, unrelated data | DB/service input checks and unrelated-trip preservation |
| 21 Storage cleanup | DB exact-key journaling + mocked failure/retry; shared/malformed/legacy attachment protection |
| 22 Audit | Existing review history retained; actor, IDs, dispatch, timestamp, counts/result stored in private existing jobs |
| 23-24 Confirmation and trip identity | Actual Combined and Tracker controls open shared modal; Cancel no mutation, blocked confirmation, exact parents |
| 25 Cache reconciliation | Unit tests invalidate all affected feature prefixes but retain Users; Tracker browser refreshes empty after simulated success |

Additional tests verify historical driver-update orphans remain through NOT VALID FK installation, new orphan writes are rejected, the old last-stop path fails safely, and the new eligible whole-trip path succeeds. No live operational data was used for those writes.

## F. Approval and activation checklist - do not execute now

1. Separately approve unchanged creator proposal at its final checksum; it can be installed independently.
2. Review and approve **new driver-update parent FK proposal** including its last-stop compatibility effect. Apply only after approved read-only preflight; preserve legacy orphans and attachment references.
3. Separately approve the **revised** whole-trip proposal at its new checksum; it depends on step 2. The former F760... hash no longer identifies the implementation.
4. Reverify project, migration history, signatures, dependencies, ACLs, default RLS and existing transaction function before any future install. After install, verify service-only execution and unchanged operational data; leave the feature disabled.
5. Resolve legacy driver POD attachment ownership only with separate approval. Never delete those eight references or their files merely as test setup.
6. Obtain separate authorization for activation/restart and designated disposable or approved acceptance records. Do not use DR333. Define backups, cleanup retry monitoring and rollback first.

Rollback switch: `WHOLE_TRIP_DELETE_ENABLED=false` followed by backend restart. Tracking, planned generation and PDF intake remain false/unset; POD review remains true.

## G. Safety confirmation

No live migration, INSERT/UPDATE/DELETE, new constraint, RLS/grant/trigger/publication change, Storage deletion, GPS capture/write, Directions/Gemini request, deployment, commit or push occurred. No application feature flag was enabled. All destructive/concurrency writes were confined to owned local disposable databases or mocked APIs. The original DR333 receipt and all operational records were untouched.

## H. Files for this checkpoint

Backend: revised whole-trip service; unchanged reviewed creator SQL; revised whole-trip SQL; new driver-parent FK proposal; service tests and exact-catalog/ownership/creator/idempotency/concurrency fixtures.
Frontend: shared whole-trip API/cache/parent-selection service, shared dialog, Combined and Tracker integration; unit tests, Combined wizard and new Tracker whole-trip browser fixture.
Documentation: this review, database catalog inventory, Phase 2C progress and main overhaul checkpoint.

**Ready for review and approval, not live deletion activation. Stop here.**
