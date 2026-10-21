# Unified trip architecture and spreadsheet repair

## Status

Seven authorized additive migrations are installed in `hdmknewarynwpbrhfgai`. No production trip, child record or Storage object was deleted during this work. No commit, push or deployment was performed. Existing unrelated worktree changes were preserved.

The live project still has **1 trip, 1 stop, 1 cargo item, 0 assignments and 37 Storage objects**. The earlier explicitly authorized performance sample remains. Store Calling and Tracker legitimately have no applicable records; calls, PODs and transmittals were not fabricated.

Automated UI tests used isolated browser contexts and synthetic REST/authentication. Actual Supabase reads, catalog inspection and query plans were measured separately. The live browser tab is currently at login, so an authenticated production write/delete acceptance workflow was not performed.

## Database architecture and migrations

`trips.id` is the physical parent identity. There was no unique constraint on dispatch number alone: the existing unique `(dispatch_number, trip_number)` index already permits sibling trips. It was preserved. DR numbers are delivery-document values, not trip or product identities.

Multiple assignments were already supported, but core report views selected only a unique active PRIMARY assignment. Explicit cargo allocations and truck/stop responsibilities were missing. Store Calling's preferred view lacked the backend SELECT grant. The approved whole-trip RPC and verified attachment cleanup core were retained.

| Version | Installed migration | Purpose |
|---|---|---|
| 20261021031732 | `trip_convoy_integrity` | Allocation/responsibility tables, same-trip FKs, capacity/conservation guards, active-truck uniqueness, versioned audited RPCs, RLS and Realtime |
| 20261021031738 | `convoy_report_projections` | All active applicable assignments in four core views, separate issue/reason annotations, capacity totals, Store Calling view grant |
| 20261021031744 | `trip_presentation_ownership` | Verified ownership metadata and FKs for formulas, flexible source rows and notifications; source/deletion guards |
| 20261021031751 | `complete_trip_presentation_cleanup` | Extend atomic whole-trip cleanup and its durable journal to new trip-owned dependencies |
| 20261021031758 | `narrow_record_deletion` | Explicit store-call and empty-stop deletion; expected versions, audit and no parent fallback |
| 20261021033433 | `convoy_projection_completion` | Parent dispatch grouping, retained stop dispatch references, Store Calling/Tracker assignment projections, FULL replica identity |
| 20261021054650 | `convoy_stop_history` | Prior-state audit, progressed-stop link protection and assignment history protection |

SQL files are under `backend/migrations/2026_10_21_*.sql`. The installed narrow-record file retains its original `proposed_` filename. The separate proposed Store Calling grant was not independently applied; the grant is included in the projection migration.

Evidence: [migration checksums](architecture-migration-checksums.json), [live installation/security metadata](architecture-live-installation-verification.json), [canonical definition hashes](architecture-installed-hashes.json). **All 17 checked installed function/view definitions match the disposable database, with zero differences.**

### Integrity, permissions and recovery

- `trip_cargo_allocations` uses physical UUIDs and composite same-trip FKs to assignments/items. Source cargo is not duplicated. Source quantity/CBM and truck-capacity limits are enforced under trip locks. Missing measurements remain unknown.
- `trip_assignment_stops` has a physical UUID and versioned delivery progress. ALL scope includes applicable stops without creating deliveries; SELECTED uses explicit links. Progressed links cannot be removed silently. Ended assignments preserve history.
- Management mutations are service-only RPCs that check ADMIN/STAFF, expected versions and physical ownership; they write audit inside the transaction. New tables have RLS, FULL replica identity and Realtime publication membership. No PUBLIC/anon/authenticated management-RPC EXECUTE grants were added.
- Existing trip/stop/item/assignment tables retain RLS and have no authenticated DELETE grant. Direct authenticated REST deletion cannot bypass backend authorization.
- **8 historical flexible SOURCE bindings and 1 formula target were unresolved and retained untouched by ownership inference.** New missing/ambiguous source bindings are rejected. No guessed cleanup was performed.
- Captured [before](architecture-data-integrity-before.json)/[after](architecture-data-integrity-after.json) integrity snapshots match for their recorded fields. Final counts are recorded separately. Later view/function migrations do not backfill operational rows.
- Recovery SQL under `backend/migrations/recovery/` retains additive metadata columns while restoring earlier projection/function behavior. Projection recovery was tested inside a disposable SAVEPOINT; no recovery ran live. Keep additive tables/data and the stop-history guard during application rollback. Do not drop data to reverse this rollout.

## Flat convoy rows and editing scope

Two trucks at two applicable stops produce four normal spreadsheet rows sharing the trip UUID. There are no expandable parent rows. Core report identities include physical assignment, stop, line-item or billing scope. Billing-only projections are not multiplied by trucks.

Store Calling repeats real calls against applicable assignments. Tracker repeats eligible delivery-stop projections and uses stop-plus-assignment local identity, while its override writes still target the physical stop/flex cell. **Assigned Plate / Assigned Driver** are distinct from the existing stop-level **Reported Plate** override; editing that override does not reassign a truck.

Dispatch Number now reads/edits the trip's dispatch group. The old stop value remains available as **Stop Dispatch Reference**, with stop-only editing. Ambiguous dispatch-only lookup returns 409 and asks users to select a physical trip rather than choosing the first sibling.

Trip Details now exposes explicit truck/driver assignment, cargo allocation and stop-responsibility controls. Drivers are chosen explicitly, cargo is never auto-allocated, and allocation confirmation sends one bounded atomic batch. Collection reads page through all cargo/allocations rather than silently stopping at Supabase's default response size.

New authenticated ADMIN/STAFF APIs:

- `GET /api/trips/:id/convoy`
- `POST /api/trips/:id/convoy/allocations`
- `PUT /api/trips/:id/convoy/assignments/:assignmentId/stops`
- `PATCH /api/trips/:id/convoy/stops/:responsibilityId`

Trip edits affect the shared trip; stop edits affect that stop; assignment edits affect that assignment; cargo edits affect that line item. Formula identities distinguish convoy projections. No dispatch-number update/deletion target was introduced.

Exports preserve presentation rows but emit repeated additive quantities, CBM, trip totals and assignment capacities once per physical source entity. Formula overlays do not replace authoritative exports. Prepared client transmittals emit each physical stop once and list convoy plates together; Tracker spreadsheet exports include explicit assignment columns. Earlier physical-row formatting remains an inherited default after convoy expansion; explicit assignment-cell formatting takes precedence.

## Complete and narrow deletion

`POST /api/trips/whole-delete` remains the confirmed Admin workflow, backed by `delete_whole_trips_v1`: exact deduplicated parent UUIDs, at most 20 unique trips, current session/role authorization and no password reentry.

The RPC snapshots new dependencies into the existing durable cleanup journal, removes exact trip-owned allocations/responsibilities/formulas/notifications transactionally, then uses the established stop/POD/receipt cleanup sequence. Existing operational dependencies, attachment ownership, shared-object/document/financial restrictions, audit evidence and recoverable Storage cleanup remain enforced. Sibling trips are never inferred from dispatch number.

The legacy generic `DELETE /api/trips/:id` now returns 410 and requires the explicit whole-trip workflow. Stop DELETE delegates to the same reviewed child-only contract as `/record-only`, requiring trip, stop and expected version. It cannot reach the legacy final-stop parent fallback. The database cleanup core remains an internal whole-trip dependency and was not dropped.

Store-call deletion targets one physical call and its owned notifications. Empty-stop deletion rejects dependencies and preserves its parent even for the final stop. Nonempty child deletion remains blocked rather than guessing a cascade. Tracker uses **Reset transmittal overrides**, not trip deletion. Read-only capability discovery confirms both narrow deletion contracts enabled.

Committed database deletion with pending Storage cleanup remains a success-with-warning and durable retry, never a false relational failure. Production Storage deletion was not exercised.

## Autosave, Realtime and UI

- Normal edits commit on Enter/blur; typing/pauses do not save. Editors retain exact physical target identities.
- Confirmed server responses seed a bounded canonical-record cache, avoiding redundant own-save reads that could fail after a successful write.
- Reconciliation coalesces by physical record, limits concurrency to four and retries at 500/1,500/4,000 ms. Online/reconnect retries deferred work; cleanup cancels timers. Drafts and conflict feedback remain intact.
- **Retry Updates** is removed. A concise delayed-update notice follows failed bounded recovery; save failures and refresh failures remain distinct. No persistent technical save banner or routine cell-save success toast was added.
- Existing Socket.IO/Supabase transports and event identities are reused. New allocation/responsibility events use existing invalidation and no longer invalidate unrelated report receipts. Tracker's fixed 60-second polling loop was removed; reconnect/event reconciliation remains.
- Headers stay horizontal, bold by default and at their configured font size. Narrowing wraps words rather than shrinking fonts; padding/minimum widths are compact, with 60 px supported. Menus, pinning, resizing and saved formatting remain.
- Issue / Report Type and Reason are separate database-backed spreadsheet annotations with independent editing/search/export mappings. They default to text and support compatible configured Number/Date/Dropdown modes. Actual operational reports remain separate and accessible through report history; ambiguous historical text was not split or rewritten.
- Configure Input Type is compact: type, labelled/color options, reorder controls and Cancel/Done. Saved option values remain stable; removal deactivates them instead of rewriting history. Explicit cell-level option creation waits for shared-design confirmation. Relationship and controlled-status validation remains protected.
- Flexible workspace containers use `min-height:0` and measured remaining viewport space; dashboard bottom padding was removed. Empty/single-page Tracker pagination and its reserved space are omitted; real multipage navigation remains.
- Existing row resizing, aliases, formulas, six sheet tabs, exports and permissions remain. Row-height settings retain their existing local-session persistence limitation; no additional row-height store was introduced.

## Live read-only performance

The service measurements below include backend service execution plus Supabase REST. They are not authenticated browser/API HTTP timings. Master List and Monitoring share the monitoring source. Live first-row browser timing was not remeasured after the session ended.

| Source | PostgreSQL execution, ms | Service read, ms | Live rows / total |
|---|---:|---:|---:|
| Master List / Dispatch Monitoring | 1.836 | 1,336 | 1 / 1 |
| Dispatch Report | 6.494 | 791 | 2 / 2 |
| Trip Booking | 2.587 | 780 | 1 / 1 |
| Store Calling | 0.430 | 119 | 0 / 0 |
| Transmittal Tracker | 0.650 | 473 | 0 / 0 |

Dispatch has distinct stop/cargo scopes; two projection rows do not mean two trips. The retained legacy Combined view executed in 9.408 ms. A read of the authorized sample's convoy details returned one stop/item and no allocations in 1,094 ms; a later read plus capability discovery took 1,828 ms.

The earlier Monitoring plan executed in 2.575 ms. Earlier application/upstream outliers were 15–21 seconds; inspected statement statistics/current small query plans did not account for that whole interval. Existing request-local timing, bounded read timeouts, incremental retrieval and request/cache deduplication remain. No additional live index change was justified by these small plans. Intermittent network/service tails are not claimed permanently eliminated.

Evidence: [plans after](architecture-query-plans-after.json), [service timings](architecture-report-service-latency-readonly.json), [earlier catalog/statement inspection](architecture-query-plan-before.json).

## Verification

- Backend and frontend TypeScript: **passed**. The backend dynamic-select result type was corrected without suppressing errors.
- Targeted backend tests: **40 passed**. Targeted frontend tests: **50 passed**.
- Disposable PostgreSQL 18: fresh metadata-only restore; all seven migrations; sibling dispatch trips; two trucks/two stops; distinct products/DRs; 80-CBM conservation; source/capacity/version/role guards; atomic rollback; financial retention; verified POD/receipt and legacy-driver ownership; pending uploads; shared/ambiguous attachments; metadata journal; exact child deletion; stop-history protection; projection recovery all passed. No production rows copied.
- Concurrent PostgreSQL sessions: competing allocations cannot over-allocate; duplicate whole-trip requests produce one cleanup journal and preserve the sibling.
- RLS fixture: Staff sees management allocations; assigned truckers see their own allocation; direct writes and actor-spoofing RPC execution are denied.
- Two browser contexts over real isolated Socket.IO: independent drafts; zero typing/cancel writes; failed-save preservation; conflict notice; reload/token/reconnect/logout recovery passed. Remote preview samples: **305, 113, 99, 95 ms**. These are fixture measurements.
- Browser editors: number-wheel stability, decimal/date commits, Escape, searchable relationships and viewport-bound dropdowns passed.
- Convoy/Tracker/configuration browser fixture: explicit single allocation request; four flat rows; separate assigned/reported plates; protected source types; single-page footer removal; compact custom input configuration passed. A 60-px column wrapped to **56.76 px header height with an unchanged 12 px font**.
- Deletion browsers: cancel makes no write; duplicate clicks make one request; protected/network failures preserve an interactive modal; accurate cleanup-pending warning; Escape cannot dismiss an in-flight request; no password or technical dependency panel.
- Six-sheet pagination/recovery: all 423 Master fixture records, next/last/previous report pages, search beyond page one, exact child confirmation, recoverable API errors and Tracker reset passed. The final retained-cache check still contained all **423** Master rows (stale-but-usable cache, distinct from its short freshness TTL).
- Shared editor benchmark: 5,000 mounted cells; 100 draft updates to paint in **81.2 ms**; zero owner/unrelated-cell rerenders during typing and zero API requests. This is a component fixture, not an end-to-end application benchmark.

Artifacts: [browser results](architecture-browser-results.json), screenshot `frontend/tests/artifacts/convoy-tracker-projection.png`.

Final targeted counts and TypeScript results: [architecture-targeted-test-results.json](architecture-targeted-test-results.json). Both local application servers are healthy: backend `/api/health` returned `status:ok` on port 5000 and Vite returned HTTP 200 on port 5173. The backend watcher loaded the current source. Temporary PostgreSQL (55439) and Socket.IO (5199) fixtures were stopped; application services were left running.

## Implementation files

Backend:

- `src/config/reports.ts`, `src/routes/trip.routes.ts`, `src/controllers/trip.controller.ts`
- Services: `trip.service.ts`, `assignment.service.ts`, `trip-convoy.service.ts`, `report.service.ts`, `transmittal-tracker.service.ts`, `transmittal-tracker.logic.ts`, `tracker-pagination.ts`, `spreadsheet-formula.service.ts`, `collaboration.logic.ts`, `table-design.logic.ts`, `whole-trip-deletion.service.ts`
- `src/types/assignment.types.ts`; seven migration files; recovery/diagnostic scripts; architecture fixtures/runners/concurrency tests and targeted test updates.
- The obsolete password-based HTTP test was replaced by `whole-trip-session-http.test.ts`.

Frontend/shared:

- Components: `ReportDataView.tsx`, `ReportSpreadsheetUtils.ts`, `TransmittalTrackerView.tsx`, `OperationsReportsView.tsx`, `SpreadsheetColumnConfiguration.tsx`, `TripConvoyPanel.tsx`, `TripIssues.tsx`, `useSpreadsheetSurface.ts`, `useSpreadsheetCollaboration.tsx`, `useOperationalFormulas.tsx`, `useManagementTableColumns.tsx`
- `pages/Admin/DashboardPage.tsx`, `pages/Admin/views/TripDetailView.tsx`, `index.css`
- Services: `collaboration.service.ts`, `realtime.service.ts`, `admin-change-feed.ts`, `shared-table-design.ts`, `report-editing.config.ts`, `report-row-identity.ts`, `transmittal-tracker.service.ts`, `transmittal-tracker-export.logic.ts`, `operational-export.ts`, `configured-cell-input.ts`
- `packages/spreadsheet-formula/index.js`; targeted unit/browser fixtures. The obsolete password browser was replaced by `whole-trip-session-feedback.browser.js`.

The broader worktree includes earlier unfinished changes; not every Git modification originated in this pass.

## Remaining limits and Admin acceptance

1. Live multi-truck writes and destructive acceptance were intentionally not performed against production. Use explicitly identified disposable application records for Admin acceptance.
2. Eight unresolved historical source bindings and one formula need separate ownership review; they do not authorize guessed deletion.
3. POD/DR/transmittal ownership remains stop/document scoped. Assignment-specific PODs were not invented. New responsibility records track truck-specific stop progress; existing GPS assignment identities remain.
4. Formula scopes are not silently reassigned to another truck when an assignment scope disappears. Missing bindings produce reference errors; no speculative formula backfill was performed.
5. The live dataset is too small to establish large-production performance or exclude the earlier intermittent latency tail. Large browser datasets are fixtures, not live benchmarks.
6. Screenshots cover desktop. Full mobile/accessibility acceptance and real two-user Supabase delivery still need acceptance coverage. The automated two-user check used actual isolated Socket.IO with synthetic auth/persistence.

No further Supabase approval is pending for the implemented work. No operational table was dropped or reset and no production Storage objects were removed.
