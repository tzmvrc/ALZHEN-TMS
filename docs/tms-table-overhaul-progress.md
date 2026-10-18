# TMS table overhaul: completed integrity and Offload phase

> Latest resume checkpoint: see **Phase 2B.5 - Critical persistence checkpoint (2026-10-16)** at
> the end of this document. Earlier sections describe historical checkpoints.

## Applied database change

- Live migration: `20261015085041`, name `stop_identifier_ownership`.
- Repository SQL: `backend/migrations/2026_10_17_stop_identifier_ownership.sql`.
- Adds nullable `trip_stops.transaction_number`; no default and no backfill.
- Updates the transaction-number source in `v_tms_combined`, `v_dispatch_monitoring`, `v_dispatch_report`, and `v_trip_booking`: stop rows read the exact stop, trip-only rows read the trip.
- `v_store_calling` now reads the exact stop dispatch and accepts an assignment only when exactly one active PRIMARY assignment exists. Its stop join also checks the parent trip.
- The five views retain identical column names, order, types, and grants, verified against the saved catalog snapshot.
- Existing data checksums are unchanged, excluding the newly added nullable field. Counts remain 4 trips, 8 stops, 4 assignments, and zero Offloads, Backloads, or report receipts. Seven stop dispatch numbers remain populated; all eight new stop transaction values are null.
- No RLS, grants, authentication, storage, conversion history, or operational records changed.
- Recovery files: `backend/scripts/2026_10_17_stop_identifier_catalog_snapshot.json`, `2026_10_17_stop_identifier_record_checksums.json`, and `2026_10_17_stop_identifier_views_rollback.sql`.
- The rollback restores the original views and deliberately retains the new column to preserve any values subsequently entered.

## Completed application changes

- Stop transaction and dispatch edits use the stop ID and parent trip ID. Genuine trip-only rows retain parent identifier editing. Shared assignment fields retain assignment identity.
- Existing operations responses provide current assignment/route context for trips even when those trips have no operational reports. Ambiguous or inactive PRIMARY assignments no longer provide arbitrary vehicle details. Assigned driver names come from the driver record, with the existing profile fallback.
- Add Report revalidates on opening, shows a searchable dispatch dropdown, and carries exact trip/stop identities. Current stop dispatch options resolve their own stop internally. Trip-only dispatch options are labelled Whole trip where stop dispatch options also exist. No separate Trip Stop control remains.
- Report creation uses the existing scoped API, nullable stop relationship, existing role/assignment checks, and existing image flow. Creation, upload, signed-link refresh, and list-refresh errors remain separate.
- Operations empty/loading/error states render outside the table. Add Report remains available. Other shared report pages reuse the empty-state component.
- Shared report/dashboard cell styles now use consistent grid borders and typography. Customer/Store defaults are 300px and remarks defaults are 360px in the report grid; explicit saved widths remain authoritative.
- Report-grid and Operations resizing save preferences on drag completion. Text selection is suppressed during dragging. Existing pin-offset calculations remain in use.
- Admin report preloading uses lazy tasks with concurrency two; queued requests stop on logout/account change. Removed the eager fanout of up to 20 trip image/event requests. First pages remain bounded at 50 rows.
- API and report-page caches reject old-session results and revalidate invalidated in-flight results. Background report refresh failure preserves the last valid rows with an error message.
- Operations Realtime dependencies include receipts/items and driver/truck/route source tables; cache invalidation includes dependent report pages.

## Verification and limits

- Backend full local suite: 80 passing tests. Frontend local suite: 13 passing tests. Both builds pass.
- Live read verification: all five views execute; zero duplicate physical row identities in the present data. This is not a production edit test.
- Browser component fixture: searchable selection of stop two populated the correct dispatch/driver/plate/route, omitted the Trip Stop selector, submitted exact trip/stop IDs and zero boxes, and invoked refresh/completion once. Mocked API rejection retained the reason, made one request for two simultaneous submissions, and invoked neither success callback. No live report was created by these browser checks.
- Targeted lint found pre-existing errors in AuthContext (5 errors, 1 warning), ReportDropdownEditor (one effect state update error), and realtime.service (one prefer-const error), reproduced from the pre-task index/HEAD. Do not interpret this as a clean repository-wide lint result.
- No production navigation timing or authenticated browser end-to-end result was measured. The concurrency/request reductions are structural and tested locally.

## Exact remaining work

1. Finish the application-wide audit and interaction standardization for Users, Trucks/master-data, Flexible Tables, Transmittal Tracker, and other management lists. Shared styling applies to existing consumers, but column resizing/formatting/keyboard editing has not been added to all these views.
2. Add keyboard resizing and complete browser checks for pinned offsets, virtualization, wrapping, persisted widths, formatting, copy/paste, fill-down, filtering, and pagination. Existing features were retained; not every interaction has new automated coverage.
3. Audit legacy `vw_*` fallback views separately. Their definitions still use legacy assignment and trip-level identifiers; this phase changes the current `v_*` report sources only.
4. Reconcile historical stop transaction numbers only with established business evidence. Existing parent transaction numbers remain intact and are not silently displayed as independently saved stop values.
5. Address generic report Remarks ownership outside the existing explicit Trip Remarks / Stop Remarks / Item Remarks columns where business meaning is still ambiguous.
6. Add pagination/bounded option APIs for Operations collections and Transmittal Tracker before preloading those complete datasets. They currently return whole collections; this phase does not preload them at login.
7. Continue consolidating all mutation/Realtime invalidation rules and test every report-specific event, including Flexible Tables. This phase fixes the verified Operations and shared cache issues.
8. Perform authenticated browser verification using a development/test account and approved test data; the available browser initially opened the login screen.
9. Resolve the documented pre-existing lint errors in their own focused change.

## Files changed during this phase

Backend: `src/services/trip.service.ts`, `src/services/operations-report.service.ts`.

Frontend components: `OperationsEventSubmissionForm.tsx`, `OperationsReportsView.tsx`, `ReportDataView.tsx`, `ReportDropdownEditor.tsx`, `ReportSpreadsheetUtils.ts`, `dashboardStyles.ts`, new `TableState.tsx`; `context/AuthContext.tsx`.

Frontend services: `operations-trip-selection.ts`, `operations-report.service.ts`, `report-editing.config.ts`, `api.service.ts`, `report.service.ts`, `admin-preload.service.ts`, `realtime.service.ts`, new `background-preload.ts`.

Tests: backend `trip-line-item-edit.test.ts`, `operations-report.logic.test.ts`; frontend `operations-trip-selection.test.ts`, new `cache-and-preload.test.ts`, new `report-edit-ownership.test.ts`.

Migration and recovery files are listed above. All pre-existing staged, unstaged, and untracked work remains in place; no commit or push was made.

## Phase 2 — completed slice (2026-10-15)

This phase is partially complete. No database migration, operational data write,
permission change, commit, or push was performed during this slice.

### Offload toolbar and transaction selection

- Management Operations Reports now has one Add Report button immediately beside
  Search. It uses Trips' yellow, rounded Add trip button classes and wraps on
  smaller screens. Trucker mode retains one creation button and its existing
  authorization and modal behavior.
- The dropdown previously added a whole-trip choice alongside stop choices and
  included fully completed trips that Trips excludes. Creation options now reuse
  `isTripOngoing`, the same policy used by Trips' `ongoing_only` report query.
  This filters creation choices, not existing/historical report rows.
- Choices follow `v_dispatch_monitoring` transaction grain: one choice per real
  stop; one trip-only choice only when that trip has no stops. Repeated physical
  IDs are deduplicated. No parent dispatch fallback or visible stop-sequence label
  is used. Equal dispatch labels retain distinct trip/stop identities in their
  labels. Missing dispatch values are retained by the choice builder but excluded
  from selectable form options; they must be saved in Trips before selection.
- Stop choices carry exact `trip_id` and `trip_stop_id`; no-stop choices carry a
  null stop. The existing creation/receipt/retry/refresh flow is unchanged. Driver,
  plate, and route still come from the shared current trip context; no new
  assignments or reports are created when selecting a choice.
- Read-only Supabase results during this slice showed nine dispatch-monitoring
  stop rows across five trips. The existing ongoing policy includes six rows
  across three trips (current labels DISPATCH 1 through DISPATCH 6); the other
  trips' stops satisfy the existing completion rule. Counts are not hardcoded.
  Catalog inspection confirmed nullable text stop identifiers, timestamp-with-
  time-zone departure time, nullable Offload stop UUID, and assignment lifecycle
  fields. This was not an authenticated creation/persistence test.
- The dropdown covers all ongoing transactions, independent of the current Trips
  page/search. It does not attempt to mirror transient user filters or pagination.

### Shared standard-report preloading/cache

- ReportsWorkspace labels and login preloading now use the same `REPORTS`
  registry: Combined, Dispatch Monitoring, Dispatch, Trip Booking, Store Calling.
  New standard keys cannot be omitted from the preload list by a separate manual
  enumeration. Trips' distinct ongoing-only initial query is also warmed.
- Preloading continues through the existing lazy queue with two concurrent tasks,
  bounded 50-row initial pages, role restriction, session cancellation, and the
  same page/API caches used by ReportDataView. A report task can issue its rows
  and column metadata requests concurrently; the task limit is not a claim that
  total HTTP concurrency is always two. Later pages/searches remain on demand.
- Added query-specific fetching/error/last-success/freshness diagnostics. Existing
  query keys include token, report, page, limit, search, sort, and filters.
- Fixed a verified pending-request self-dependency: invalidating report A advanced
  a global version while leaving report B's pending request registered, allowing
  B to retry against itself. Scoped invalidation now advances only A's version.
  Old invalidated responses reuse a newer successful cached page when present,
  rather than overwriting it or issuing an unnecessary third generation.
- Mock measurements: all five standard report pages require ten initial HTTP
  requests (one rows + one metadata request each), then zero additional requests
  for immediate repeated navigation. A separate login-manager test verifies all
  five are scheduled once, ongoing Trips is scheduled, and TRUCKER schedules no
  admin preload. No production latency claim is made.

### Verification

- Backend: `node --import tsx --test tests/*.test.ts`: 81 passed; `npm run build` passed.
- Frontend: `node --import ../backend/node_modules/tsx/dist/loader.mjs --test tests/*.test.ts`:
  19 passed; `npm run build` passed with the existing large-bundle warning.
- Targeted ESLint for this slice's changed frontend source/tests passes. No new
  lint suppressions were added. Broader baseline errors documented above remain
  outside this slice; the backend has no configured lint script.
- Both staged and unstaged diff checks pass. Existing staged/untracked work is
  retained. Browser-generated login-page inspection logs were moved outside the
  repository to the temporary phase2 browser artifact directory.
- Local Vite responds on port 5173 and the Playwright browser redirects to login.
  No authenticated session/credentials were available; no authenticated browser
  creation, navigation, resizing, or live write verification was performed.

### Files changed in this slice

- Backend: `src/services/operations-report.service.ts`; new
  `tests/operations-trip-options.test.ts` (actual overview service with mocked
  database reads, parity with Trips ongoing selection, historical report retained,
  and management authorization).
- Frontend: `components/admin/OperationsReportsView.tsx`,
  `components/admin/ReportsWorkspace.tsx`, `services/operations-trip-selection.ts`,
  `services/admin-preload.service.ts`, `services/report.service.ts`;
  `tests/operations-trip-selection.test.ts`, new `tests/report-page-cache.test.ts`,
  new `tests/admin-preload.test.ts`.
- This progress document. No migration files were changed.

### Remaining Phase 2 work

1. Add bounded Operations/Transmittal APIs and page-aware caches, then preload
   these additional ReportsWorkspace tabs. They still return whole collections;
   they are not included in login preloading. Every Reports-tab dataset is not yet
   preloaded, and active-report promotion within the queue is not implemented.
2. Finish shared resizing/keyboard resizing and per-user width persistence across
   Users, Trucks/master-data, Flexible Tables and remaining management lists.
   Existing resizing in ReportDataView (Reports/Trips), Operations and Tracker is
   retained; no new table gained resizing or formatting during this slice.
3. Complete shared table styling/formatting and browser regression coverage for
   pinning, selection, copy/paste, fill-down, sorting, filtering and persistence.
   Management permissions are unchanged.
4. Audit/reconcile legacy `vw_*` sources and ambiguous generic Remarks ownership;
   no legacy view or ownership changes were made in this slice.
5. Verify the authenticated UI, real cache/Realtime network behavior, and report
   creation against approved test data. Creation/receipt behavior here is retained,
   not newly proven end to end. Further backend pagination is needed before the
   current all-collections Operations dropdown scales to very large datasets.

## Phase 2B — safe assignment, receipt, and action-control slice (2026-10-15)

### Status and database blocker

Phase 2B is **not complete**. The mandatory initial Git status and progress-file
inspection were performed. All existing staged, unstaged, and untracked work was
preserved. Supabase MCP migration-history and read-only catalog requests returned
`MCP authentication required. Reconnect to continue using this server.` This was
reported and reconnection requested. No live-schema compatibility is claimed for
this session. No migration was created/applied, no SQL mutation was executed, and
no operational data, grants, RLS, Storage configuration, or Realtime publication
was changed. No commit or push was made.

Local inspection found existing stop identifiers, product-level line-item
DR/quantity/CBM, independently scoped Offload items, report_receipts, and STOP-bound
Transmittal flex cells. `transmittal_ref` currently belongs to the system tracker
column, with a SOURCE/STOP flex row identified by the stop ID. It has not been
duplicated into another unrelated column. These are repository findings; current
live schema inspection remains blocked.

### Implemented and verified locally

- **Transmittal assignment correctness:** source queries now include
  `unassigned_at`. Projection uses only exactly one active PRIMARY assignment.
  Stale assignments and ambiguous multiple active primaries do not supply an
  arbitrary driver/plate; every stop row remains present. Explicit stored tracker
  overrides remain intact. Shared assignment updates still project to sibling
  transactions, while stop references and DR projections retain their stop IDs.
- **Offload image selection:** up to five images, appendable multi-selection,
  per-file JPEG/PNG/WebP and nonempty/5 MB validation, duplicate-selection
  protection, thumbnail previews, removal, and cleanup of object URLs. Switching
  from Backload with more than five selected images gives a clear removal message
  and disables submission. Backload retains its existing 20-image limit.
- **Backend image limit:** existing authorized receipt upload path checks five
  for Offload before storage upload; other report limits remain unchanged.
  Historical images are not removed. Existing private storage, MIME signature
  checks, report/stop authorization, compensation on metadata failure, signed URL
  listing, per-file upload progress, and receipt-only retry are reused.
- **Receipt viewing:** shared gallery uses only URLs supplied by the existing
  authorized listing API. Thumbnail buttons open a responsive larger preview with
  Previous/Next and arrow-key navigation, Escape/backdrop/close behavior, focus
  restoration, keyboard focus containment, and loading/error states. Gallery
  fetch state is keyed by session/report type/physical report ID and retry attempt,
  so changing reports cannot display the previous report's images. Fetch failures
  expose Retry images.
- **Action controls:** one shared accessible pencil/trash button component.
  Existing Edit controls in Trips/Combined/generic reports and Transmittal now use
  the pencil. Operations uses pencil and trash. Existing selection guards,
  permissions, confirmation, scoped deletion and partial-failure handling remain.
  No new Trips/Transmittal deletion path was added without archive/lifecycle
  verification.

### Verification and boundaries

- Backend: `node --import tsx --test tests/*.test.ts`: **83 passed**.
- Frontend: `node ../backend/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.app.json --test tests/*.test.ts tests/*.test.tsx`:
  **24 passed**. Initial render-test attempts failed because the tests used JSX
  outside the app tsconfig's include; tests now use React.createElement and the
  app tsconfig explicitly. No production diagnostics were suppressed.
- Both `npm run build` commands pass. Frontend retains the large-chunk warning.
- Targeted lint for changed frontend files finds only two baseline Tracker errors:
  `no-control-regex` and `react-hooks/set-state-in-effect`. Both were reproduced
  against the staged Tracker version via `git show :... | eslint --stdin`.
  Other changed frontend source/tests lint cleanly. Backend has no lint script.
- Staged and unstaged diff checks pass. Existing line-ending warnings remain.
- Backend mocked-service assertions upload five images to one exact Offload and
  stop, reject the sixth before storage, and verify existing report relationships.
  Three-stop projection tests prove independent references, shared assignment
  behavior, and retention of rows under absent/ambiguous assignments. They do not
  prove production database behavior or transaction-field persistence.
- Playwright component fixtures mounted the actual Vite gallery/form over the
  login page with in-memory files only. Verified opening/next/arrow/Escape/focus
  restoration; five thumbnails, sixth-file rejection, removal and Cancel callback;
  all five preview URLs revoked on removal/unmount. No report was submitted and no
  storage/database write occurred. The browser is unauthenticated; no real login,
  end-to-end creation, live receipt persistence or secure URL expiry was tested.
- Image capacity uses the existing count-before-upload architecture. The sequential
  form and tests enforce five; cross-process concurrent uploads are not atomically
  limited by this application check. Inspect live constraints and plan atomic
  enforcement before claiming a concurrency-safe database maximum. Existing
  ambiguous-network upload retry semantics also remain unchanged.

### Files changed in this slice

- Backend services: `operations-report.service.ts`,
  `transmittal-tracker.logic.ts`, `transmittal-tracker.service.ts`.
- Backend tests: `operations-report.logic.test.ts`,
  `transmittal-tracker.logic.test.ts`.
- Frontend components: `OperationsEventSubmissionForm.tsx`,
  `OperationsReportsView.tsx`, `ReportDataView.tsx`,
  `ReportSpreadsheetShared.tsx`, `TransmittalTrackerView.tsx`, new
  `ReportImageGallery.tsx`.
- Frontend service: new `report-image-selection.ts`.
- Frontend tests: new `report-image-selection.test.ts`, new
  `report-row-actions.test.tsx`.
- This progress document. Migration files were not touched.

### Exact resume order and remaining Phase 2B work

1. Reconnect Supabase MCP. Inspect current tables/constraints/views/grants/RLS,
   applied migrations, archive fields, conflicting historical DRs, receipts,
   profiles, POD/flex cells, and Realtime membership before choosing new fields.
2. Finish 2B.1 transaction-level single DR, independently manual quantity/CBM,
   shared authoritative Transmittal reference and transaction archive behavior.
   Do not copy/overwrite historical multi-DR line items or product quantities.
   Prepare and verify a recoverable additive migration and all dependent code
   together; do not leave the database half-integrated.
3. Finish 2B.2 Trips columns, hide only visible Warehouse Code (retain Warehouse),
   show all nonarchived planned/ongoing/completed transactions, four-step wizard,
   Review validation and archive confirmation. **Trips and creation options still
   use Phase 2's ongoing policy; they do not yet meet the new all-active rule.**
4. Finish 2B.3 server-validated Manila report date and role restrictions, current
   transaction quantity/CBM autofill with independent Offload overrides, stable
   Reported By profile FK/full-name lookup/authorization/creator audit, and the
   enriched details modal. Existing remarks/comments editing is retained, not
   claimed as newly completed. Add atomic receipt-capacity enforcement after
   inspecting live support; preserve historical images and upload failure states.
5. Finish 2B.4 completion eligibility and current dispatch/customer/DR projections
   in Transmittal plus Trips/Combined reference editing against the same source.
   Current Tracker still projects all stops and legacy multi-DR values; no new
   completion filter/trigger or reference synchronization was implemented here.
6. Finish 2B.5 management/flexible table resizing, per-user widths, common styling,
   formatting and spreadsheet interaction regression coverage. Existing resizing
   and formatting were retained; no additional table gained either in this slice.
7. Finish 2B.6 bounded Operations/Transmittal endpoints and shared page caching,
   preload all tabs, active-report priority, legacy-view ownership/reconciliation,
   Realtime publication and invalidation verification. Phase 2's five-report
   preloading and cache tests remain intact; no new performance timing was measured.
8. Run authenticated browser workflows with a test account and approved data;
   repeat all integrity/build/test/lint/diff checks after those dependent changes.

## Phase 2B.1/2B.2 after MCP reconnection — 2026-10-15

### Live database and recovery evidence

- Supabase MCP reauthenticated successfully. Connected project reference
  `hdmknewarynwpbrhfgai` matches the backend project URL and MCP configuration.
- Applied **once**: `20261015121140`, `transaction_values_and_archive`.
  Repository file: `backend/migrations/2026_10_18_transaction_values_and_archive.sql`.
  SHA-256: `EEA2057148F1870B43DA1BCE53B4E7E20793FFEF3BCC6E31A6601E63BC603E1C`.
  Do not reapply earlier migrations or this migration.
- Added stop-owned nullable `dr_number`, manual `quantity numeric(18,3)`, manual
  `total_cbm numeric(18,6)`, archive actor/time, and DR optimistic version with
  a version-increment trigger. Added archive actor/time to trips for legitimate
  trips without delivery stops. Quantities must be finite and nonnegative;
  explicit zero is valid. The API rejects values it cannot preserve precisely.
- Appended six outputs to `v_dispatch_monitoring` and `v_tms_combined`:
  `transaction_dr_number`, `transaction_quantity`, `transaction_total_cbm`,
  `transaction_archived_at`, `transmittal_ref`, `transmittal_ref_version`.
  Existing columns retain exact names/order/types and existing view grants.
  Reference reads the existing STOP-bound system Tracker flex cell; no duplicate
  reference storage or one-to-many join was introduced.
- Live read-only verification confirmed both replacement views execute, with
  10 Monitoring rows and 13 legitimate Combined line-item rows and no duplicate
  physical row identities. Reference values/versions match existing flex cells.
  New business-value columns are null: no DR/quantity/CBM or identifier backfill.
- Counts remained 6 trips, 10 stops, 1 Offload, 1 receipt. Before/after checksums
  of existing trip/stop fields, Offloads, receipts and flex cells match. No
  operational rows, product values, images or references were overwritten.
  No RLS, grants, Storage, auth or conversion objects changed.
- Recovery evidence: `backend/scripts/2026_10_18_transaction_catalog_snapshot.json`
  and `backend/scripts/2026_10_18_transaction_views_recovery.sql`. Application
  rollback retains additive columns/output fields and all values. Do not try to
  remove appended view outputs through CREATE OR REPLACE VIEW.

### Completed dependent application work

- Trips uses server-filtered nonarchived transactions, including planned,
  ongoing and completed records; Archived transactions switches to archive
  history. Warehouse Code is hidden only from Trips; Warehouse remains.
- Trips/Combined expose independent transaction DR, Quantity, Total CBM and
  Transmittal Reference. Existing Combined product DR/quantity/CBM remain
  separately labelled and unchanged. New stop fields never copy product totals.
- Four-step Trips row editor: Trip Info, Assignment, Delivery / DR, Review.
  Next/Back retain drafts without writes; only final Save calls existing scoped
  services. Shared trip/assignment fields are marked. Validation covers selected
  relationships, nullable Store clearing, dates, numeric precision and DR length.
  Existing sequential final-save behavior honestly reports partial failures;
  the wizard is not an atomic multi-field transaction.
- Icon-only archive/restore actions require confirmation and exact stop + trip
  identity. Parent-level archive is rejected when delivery stops exist. Reports,
  products, receipts, POD and flex history are retained. Archive metadata records
  current actor/time; it is not an append-only archive event ledger.
- Backend PATCH `/api/trips/:id/transaction-archive` and
  `/api/trips/:id/stops/:stopId/transmittal-reference` require ADMIN/STAFF.
  Reference delegates to existing Tracker permissions, CAS versioning and audit.
  A mismatched parent, stale reference, or denied Tracker permission cannot write.
- Tracker includes newly completed/Delivered stops without requiring a POD row
  or creating documents. Existing stored Tracker history remains visible even
  if pending/archived. Writing a reference can establish stored Tracker history;
  this is deliberate history preservation, not a strict completed-only view.
- Tracker DR edits now save the stop-owned DR with version checks. Until a new
  transaction DR is entered, a single unambiguous legacy DR/override can still be
  displayed; conflicting product DRs are flagged, never concatenated/discarded.
- Offload dispatch options now include all nonarchived eligible transactions,
  with exact stop IDs and no duplicate whole-trip option. Archived choices are
  excluded, and new stop-scoped Offload/Backload submissions reject archives.
  Historical report/receipt access is preserved. Existing Trucker assignment and
  nonterminal-trip restrictions remain; completed-trip creation is for management.
- Same-session edits invalidate Trips, Combined, Monitoring, Operations and
  Tracker caches. Combined/Monitoring now list flex metadata/cells as Realtime
  dependencies. Live publication inspection found `trips` and `trip_stops`, but
  **not** flex tables, published. Cross-session flex-reference Realtime delivery
  is therefore not complete; no grants/publication settings were changed.

### Verification in this checkpoint

- Backend: `node --import tsx --test --test-reporter=spec tests/*.test.ts`:
  **87 passed**, zero failures. Tests use isolated mocks, not live writes.
- Frontend: `node ../backend/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.app.json --test tests/*.test.ts tests/*.test.tsx`:
  **27 passed**, zero failures. Wizard helper tests cover grouping and draft
  validation, not authenticated browser navigation or an actual DOM workflow.
- Added actual-service mock coverage for three-stop archive/restore, wrong-parent
  rejection, reference CAS, denied STAFF access, stop-owned DR CAS and failed
  writes. Existing stop-edit tests now check independent DR, quantity and CBM.
- Backend `npm run build` passed. Frontend `npm run build` passed with existing
  Vite chunk-size warning. Targeted ESLint passes for the other changed frontend
  files; ResourceView's existing set-state-in-effect and Realtime's existing
  prefer-const errors remain, reproduced against their staged versions.
- Both staged and unstaged diff whitespace checks passed. Existing staged and
  untracked work is preserved; no commit/push. Local PostgreSQL service exists,
  but passwordless access failed, so no disposable-database fixture was run.
- Live schema/view reads were verified. No authenticated browser tests or live
  application create/edit/archive/receipt requests were performed.

### Exact next resume order (supersedes earlier resume list)

1. Preserve this applied migration and integrated transaction code. Run an
   authenticated smoke test of Trips wizard, archive/restore, reference edits
   from all three pages and completed-stop eligibility with approved records.
2. Finish Offload Manila Report Date/server role restrictions, transaction
   quantity/CBM autofill with independent report overrides, Reported By stable
   profile/full-name selection/creator audit, and enriched details. Inspect live
   columns before proposing an additive migration. Existing five-image previews,
   upload retry/private signed URLs and gallery remain intact; atomic server-side
   receipt-capacity enforcement is still pending.
3. Reconcile stop-specific Remarks in Monitoring/Trips and remaining legacy views.
   The existing generic `remarks` still represents the shared trip; Combined's
   explicit `stop_remarks` is stop-owned. New transaction fields require a stop;
   genuine no-stop Trips retain identifiers/archive but cannot edit stop-owned
   DR/quantity/CBM/reference until a delivery stop exists.
4. Audit publication membership and authenticated read/RLS feasibility for flex
   reference Realtime without broad grants; add safe deployment changes only
   after exact evidence. Same-session cache invalidation is implemented.
5. Finish bounded Operations/Tracker pagination and shared page-cache preloading,
   management/flexible resizing/formatting, legacy ownership and browser tests.
   Five standard report cache/preload tests remain passing. No new authenticated
   performance measurement or claim of instant navigation in this checkpoint.

## Phase 2B.3 — Offload report completion — 2026-10-15

### Implementation and database

- Applied once through Supabase MCP: **20261015142707**, `offload_report_details`,
  to the existing ALZHEN project. Source:
  `backend/migrations/2026_10_19_offload_report_details.sql`.
  SHA-256: `6E089461C323F95330E061F009BB9A0FB08BF4BAE933A529FC0B11ED486A53E1`.
  Do not repeat the transaction migration or this migration.
- Added nullable `offloads.reported_at timestamptz` and `reported_by uuid`
  referencing profiles. Set the timestamp default after adding the column so
  historical records remain NULL. Existing `report_date`, `created_by`,
  `submitted_by`, timestamps and all report relationships remain intact.
- New reports default to the server creation instant; Manila calendar date is
  derived without local-browser timezone interpretation. Management may submit
  an explicit timezone-qualified Report Date and eligible reporter profile ID.
  Trucker requests containing either override are rejected. Actual authenticated
  creator/submitting profile stays separate from editable Reported By.
- New service-only, SECURITY INVOKER RPC `create_offload_with_item_v1` inserts
  parent and optional independent Offload item in one database transaction.
  It checks archived trip/stop scope under row locks. It does not write product
  line items or transaction values. No empty report/item is created by reading
  choices; an explicit report with both numeric values blank needs no item row.
- Added a per-Offload serialized five-image capacity trigger. Existing conversion
  guards and receipt-parent/scope protections remain. New RPC execution is denied
  to anon/authenticated and granted only to service_role; existing table grants,
  RLS, storage bucket configuration and publication membership were unchanged.
- Live catalog and checksum evidence:
  `backend/scripts/2026_10_19_offload_catalog_snapshot.json` and
  `backend/scripts/2026_10_19_offload_verification.json`. Counts remain 1 Offload,
  0 items and 1 receipt. Existing-column Offload, item and receipt checksums match
  exactly. No operational values were backfilled or fabricated. Additive recovery
  retains both new columns and any subsequently entered values; old application
  code can ignore them. No destructive down migration is supplied.

### Frontend/API behavior

- Add Report retains the current transaction dropdown with exact trip/stop IDs,
  current stop dispatch numbers, no duplicated parent option and no visible stop
  selector. The existing overview now supplies each stop's saved transaction
  quantity and CBM. Selection populates both drafts; the user may override/clear
  either. Only independent Offload item values are saved.
- Report Date defaults visibly in Manila time; an unchanged default is omitted
  from the request so the server stamps actual creation time. Management can edit
  it; Trucker sees a read-only automatic value. Reported By defaults to AuthContext
  full name/server profile ID. Management uses the existing dropdown editor with
  a debounced, bounded (100 matches), server-searched ADMIN/STAFF/TRUCKER lookup.
  No UUID/email is used as the main display name.
- GET `/api/reports/operations/reporters` is management-only. Existing Offload
  create/update endpoints handle date/reporter; dispatch-based event submission
  delegates Offload creation to the same path. Existing assignment checks remain.
- Table Remarks now saves `offloads.comments` by exact physical source ID + trip,
  not the stop/trip remarks. Reporter cells and row modal support management
  changes. Failed inline saves retain drafts/error state. Row modal also supports
  editing Report Date. Cleared comments remain blank instead of showing Reason.
- View Details includes Manila report date, reporter/creator names, quantity/CBM,
  per-item values, reason/remarks, transaction navigation and the existing secure
  receipt gallery/full-size navigation. Icon actions, deletion confirmation and
  receipt-protected deletion remain intact. Historical reporter display falls
  back to recorded creator/submitting profiles; missing history is labelled, not
  invented. Historical date-only reports stay date-only in the display.
- Existing five-image previews/removal/upload retries and signed receipt listing
  remain. A concurrent capacity rejection compensates the just-uploaded storage
  object and reports an image-limit error. Same-session mutations invalidate the
  existing shared report/Operations caches and refresh the parent table.

### Build recovery and files

- Initial frontend build reproduced TS1185 merge-marker errors in AddTripForm,
  ReportDataView and ResourceView. Removed only marker conflicts: identical icon
  imports collapsed, both created-trip focus and transaction-view props retained,
  and both created-trip reference and exact-stop navigation state retained.
  **Git index remains unmerged (UU)** for these three files because no user work
  was staged/reset. Working files compile; review/staging of merge resolutions
  remains a separate user action.
- Backend: operations-report controller, routes, service and logic; new
  `offload-details.logic.ts`, migration, snapshot/verification JSON and
  `verify-offload-images-readonly.ts`.
- Frontend: OperationsEventSubmissionForm, OperationsReportsView,
  ReportDropdownEditor (optional search callback), operations-report service;
  new OperationsReporterEditor, offload-form.logic and operations-offload-target.
  The three existing conflict files received only the resolutions above.
- Tests: new backend offload-details tests and frontend offload-form tests;
  existing operations-report.logic integration mock updated for the atomic RPC.
  Progress document updated. Browser tooling generated login-page artifacts in
  `.playwright-mcp/`; no commit or push.

### Verification and remaining limits

- Backend full tests: **97 passed**; frontend full tests: **32 passed**. These
  cover actual service behavior with isolated Supabase mocks, Manila conversion,
  role restrictions/defaults, bounded reporter lookup/full-name display, three-stop
  autofill/overrides, source identity, failed writes, cache invalidation, existing
  five-image persistence/limit and gallery markup. They do not prove live RPC
  writes, concurrent database uploads or authenticated browser interactions.
- Backend and frontend builds pass; existing Vite chunk-size warning remains.
  Targeted Offload lint passes. ReportDropdownEditor retains its pre-existing
  set-state-in-effect error, reproduced against the staged baseline; no lint
  suppression was added. Unstaged `git diff --check` passes. Cached check reports
  existing blank EOF lines in the two October 17/18 migrations and their recovery
  SQL files; those pre-existing staged files were not modified.
- Read-only live service check returns 1 exact-source Offload and 10 transaction
  choices. Existing private Offload image successfully signed and returned an
  image HTTP response. Script prints no paths, signed URLs or credentials.
- Browser reached the local login page; no authenticated session/credentials were
  available. No live report creation, edit or upload was performed. No fabricated
  production records were created. SQL function/trigger catalog installation is
  verified; functional concurrent-write testing needs a disposable fixture or
  approved operational test.
- Cross-session Realtime remains incomplete: offloads/profiles/stops/assignments
  are published, but offload_items/receipts are not; authenticated SELECT on
  Offloads/receipts is absent. No broad read grants were added to force delivery.
  Existing relevant-event refresh handling and local cache invalidation remain.
- Next: authenticated Offload create/edit/date/reporter/image smoke test; safely
  resolve Realtime delivery without weakening permissions; then bounded Operations/
  Tracker preloading, management/flexible table resizing/formatting, legacy Remarks
  ownership reconciliation and the remaining Phase 2B browser acceptance tests.

## Phase 2B.4 — Offload actions and shared warmup

### Completed in this checkpoint

- Started with a clean worktree and empty `git ls-files -u`; the previously
  reported index conflicts were already resolved. No conflict resolution or
  staging was needed. No commit or push was made.
- Operations Edit/Delete icons now sit between Search and the existing Add
  Report action. They require management permission and a verified physical
  selection. Row click/keyboard activation and checkboxes select rows; filtering,
  searching and refreshed datasets invalidate selections. Confirmation identifies
  each physical report; cancellation sends no delete request.
- Read-only inspection found the existing Offload has a receipt and no conversion
  reference. Its deletion is intentionally blocked by the existing receipt-retention
  guard, not a displayed-row-ID or parent DELETE privilege defect. The backend
  now explains retention clearly and maps dependency races to a useful 409 error.
  Eligible deletion still targets only the physical source ID plus trip/stop.
  Successful rows disappear immediately, failed rows remain, and partial results
  are reported honestly. No production report, item or receipt was deleted.
- Shared TableSkeleton now supports actual column proportions, selection and
  toolbar placeholders. Operations and Tracker use it only without existing
  data; synchronous reads from their shared cache prevent a navigation skeleton
  flash. Cached rows remain visible on refresh failure.
- Login's existing two-task background queue now includes the five configured
  standard reports, the shared Operations overview (all four types), and Tracker.
  Warmup and page navigation share canonical cache keys and in-flight requests.
  Tracker initialization is attempted only for missing metadata, rather than
  writing/invalidating on every admin navigation.
- Background Operations/Tracker snapshots have a request-local read budget:
  500 cumulative rows per paged source relation and 5,000 total source rows.
  Oversized warmups fail explicitly with 413; they never cache truncated results.
  This is a complete-snapshot safety limit, NOT full API pagination. Interactive
  loads/exports retain their existing full-collection behavior pending proper
  paginated queries/counts/search/export design.
- Report-only Operations mutations invalidate Operations and Dispatch rather than
  evicting unrelated standard reports. Trip timestamp/assignment updates retain
  broader dependent invalidation. Existing generation/session guards remain.
- Operations column layouts are now scoped by user, with legacy saved layout
  fallback. Existing resize/pin/formatting/editing implementations remain; no
  idle autosave or new permissions were introduced.

### Verification

- Backend full suite: 100 passed. Frontend full suite: 36 passed. Both builds
  passed; Vite retains its large-chunk warning.
- Targeted ESLint passed for the other changed frontend files and tests. Tracker
  has two errors also reproduced from HEAD: existing control-character regex and
  synchronous cell-format state update in an effect. No broad suppression added.
- Isolated Playwright component fixture passed skeleton, toolbar disabled/enabled
  states, Edit/Cancel, deletion Cancel, exact physical-ID deletion, protected-report
  error, selection reset after search/refresh, and column width persistence
  (Date resized from 180 to 257px and restored on remount). Every API call was
  intercepted; this is not authenticated/live deletion verification. Fixture:
  `frontend/tests/operations-table.browser.js`. Generated browser logs retained.
- Mocked login test observed 20 startup HTTP requests including lookups/Trips and
  all seven report datasets, then zero extra requests for their immediate cached
  navigation. Queue concurrency is two resource tasks; individual standard-report
  tasks can fetch metadata and rows concurrently. These are mock measurements,
  not production latency or zero-loading guarantees.
- Service tests cover authorization, physical scope, receipt/history protection,
  dependency races, isolated modeled item cascade, and repeated deletion. Separate
  frontend tests cover cache reuse/invalidation/session isolation and failed
  warmup retry. Mocked cascades do not prove live database deletion behavior.
- Staged/unstaged diff checks passed. No SQL mutation, migration, publication,
  grant, RLS, Storage or configuration change was performed.

### Exact remaining work / resume order

1. Implement true bounded Operations/Tracker pagination with matching server-side
   filters/counts and export semantics. Current oversized warmups defer to normal
   navigation rather than warming an initial page.
2. Resolve authorized cross-session Realtime. Catalog inspection confirms Trips,
   stops and Offloads are published, but items/receipts/flex rows/flex cells are
   not; authenticated SELECT is absent on all these inspected base tables.
   Publishing alone will not fix delivery. Existing Offload SELECT policy is
   permissive, so broad grants would expose data. Design scoped authorization or
   an authorized invalidation channel before any publication/privilege change.
   Same-session cache tests do not establish cross-session Realtime delivery.
3. Complete management/flexible-table resizing and shared formatting/interaction
   audit. This checkpoint improves Operations user-scoped preferences only; it
   does not claim new resizing/formatting across every table.
4. Reconcile legacy vw_* joins, Remarks ownership, archived-history behavior and
   all dependent consumers. No legacy view was changed in this checkpoint.
5. Run authenticated create/edit/upload/deletion smoke tests with approved test
   records, plus pinned-offset/copy/paste/fill-down acceptance checks. Do not use
   protected production Offloads as destructive test fixtures.

## Phase 2B.5 — DR selection, shared widths and Offload deletion

This is a tested partial checkpoint, not completion of Phase 2B.5. All Phase
2B.4 staged/unstaged/untracked work was preserved; the index was already free
of conflicts. Nothing was committed or pushed.

### Completed

- Reports navigation label is exactly **Offload Reports**. The route, existing
  Loading/Unloading/Backload functionality and internal filters remain.
- Offload Add Report uses DR Number, not dispatch text, as its selector. The
  authorized `/reports/operations/offload-transactions` lookup searches DR,
  warehouse and destination on the server with 50 rows/page plus a next-page
  sentinel and stable DR/trip/stop ordering. Options retain exact trip/stop IDs,
  distinguish repeated DR labels, and exclude archived/missing-DR transactions.
  The existing view supplies assignment context without generating whole-trip
  duplicates. Trucker choices use the existing active-assignment scope.
- The actual form displays warehouse/destination and read-only assignment/route
  context, autofills transaction Quantity/CBM, preserves independent overrides,
  Manila Report Date, reporter permissions and the five-image flow. Backload
  keeps dispatch selection. New Offloads require an active stop with a saved DR;
  existing trip-level Offloads remain readable/editable. Dispatch-only Offload
  requests are rejected; the events API accepts exact trip/stop IDs for Offload.
  The live Trips table has no trip-level DR/Quantity/CBM columns, so there is no
  valid DR-based no-stop transaction option in the inspected schema.
- Operations displays the current associated transaction DR, retaining legacy
  item-derived DR display when no transaction DR is available. Quantity and CBM
  still belong to the Offload items, not the original transaction values.
- Shared widths are persisted in Supabase, through authorized Admin/Staff API
  routes with revision checks. Trips, all five standard report grids, Operations
  (all types), and Tracker consume this store. Dragging is local; persistence
  occurs on release. Failed drafts remain visible with Retry, old responses
  cannot overwrite acknowledged writes, and remote widths are deferred during
  the current drag. Once loaded, shared/default widths supersede personal widths;
  no uncertain local preferences were automatically copied to the shared store.
- Width reconciliation uses one authorized API poll per active token/table every
  15 seconds and on window focus, with in-flight deduplication and no rerender
  when values are unchanged. This is secure polling, NOT direct Supabase Realtime.
  Hidden/order/pin/formatting preferences remain existing local preferences.
- Shared Column Finder is integrated into Trips/standard reports, Operations and
  Tracker. It supports partial case-insensitive search, keyboard selection,
  native horizontal scrolling, persistent header/body highlighting, Escape/clear,
  and revealing a hidden column. It does not filter/sort/reorder rows. Current
  grids render their columns; horizontally virtualized-table integration remains
  a future concern. Compact hidden-column menus restore one or all columns.
- Offload toolbar Edit/Delete are absent without selected rows. One selection
  shows both; multiple selections show Delete. Existing stale-selection guards,
  confirmation/cancellation, physical identities and partial outcomes remain.
- Permanent Offload deletion now uses a transaction RPC. It locks the exact
  physical parent, protects conversion source AND target history, retained
  document references and unknown image ownership; snapshots original report,
  items, receipts and actor; removes only owned receipt metadata/report/items;
  and durably queues exact private Storage paths. It does not select any trip,
  stop, assignment, other report, POD or Transmittal record for deletion.
- Storage removal starts only after database commit, uses exact object paths,
  and has idempotent operation identity. Storage/acknowledgement failure remains
  `PENDING_STORAGE`; the UI distinguishes that from complete deletion. Pending
  jobs survive reload/restart and have an authorized Retry image cleanup action.
  Queue retrieval is bounded to 50; completed retries refresh the next jobs.
  Cleanup is user-triggered, not an automatic background worker.
- Bulk deletion continues through protected failures, displays per-record
  outcomes, removes only confirmed deleted rows and clears successful selections.
  Receipt attachment alone no longer blocks physical OFFLOAD deletion. Other
  report types retain their previous receipt rules. Unknown attachment counts
  are not displayed as zero; confirmation does not currently fetch image counts.

### Applied additive migrations and live verification

- `20261015182114`, `shared_table_widths`, repository file
  `backend/migrations/2026_10_20_shared_table_widths.sql`.
  SHA-256 `056AF0680CDCE3B9161239D3047E04D0A3A6FCA67E719E3C695FC41E0C33BFFB`.
  Adds only shared presentation widths, composite PK, range/revision checks,
  timestamps and nullable updater FK. RLS enabled; browser roles have no access.
- `20261015190709`, `offload_deletion_cleanup`, repository file
  `backend/migrations/2026_10_21_offload_deletion_cleanup.sql`.
  SHA-256 `8D9BE4FF96F35A50F396A97B8D92E9EE88ACBDFB6DA4C8E9E4B6D0BCE73A8A19`.
  Adds a private cleanup/snapshot journal, pending index and a backend-only RPC.
  The service role can read the journal and update cleanup status columns, but
  cannot update snapshots; browser roles cannot read or execute the RPC.
- Supabase confirmed both installations. Verified RLS, PK/FK/checks, function
  security-definer/fixed search path, least-privilege grants and no publication
  membership for private journal/layout tables. Existing grants/RLS, triggers,
  report views, receipt bucket and source schema were not replaced or weakened.
- Before/after operational counts: 3 Trips, 4 stops, 0 Offloads, 0 report receipts,
  0 conversions. New cleanup journal is empty. No production deletion RPC was
  invoked; no production Storage objects were removed or test records inserted.
- Read-only inspection found **one existing receipt-bucket object without a
  report_receipts reference**. It was not deleted, reassigned or fabricated into
  a report. The new journal cannot reconstruct authorization for historical
  untracked cleanup; review that object separately before approving removal.
- Recovery: disable the new consumers and retain preference/journal tables and
  snapshots. SQL snapshots do not restore permanently deleted image bytes.
  Do not rerun these migrations or use production records as deletion tests.

### Tests and verification

- Backend suite: 103 passed. Frontend suite: 40 passed. Backend and frontend
  builds passed; frontend retains the Vite large-chunk warning.
- Targeted lint passed for the new components/services and other changed
  frontend files. Tracker retains the two documented pre-existing regex/effect
  errors; no rule suppression was added. New resize dependency warnings were
  corrected. Final staged/unstaged diff checks are required at every resume.
- Isolated browser fixture `frontend/tests/offload-dr-form.browser.js` uses the
  actual form with mocked Auth/API and the real stylesheet. Admin and Trucker
  mouse selection passed: repeated DR labels choose stop two, assignment and
  numeric autofill match, overrides submit 0/1.25 without changing Trips, date
  editability follows role, and refresh/completion each fire once after one POST.
  This is not authenticated production E2E or live persistence verification.
- `frontend/tests/operations-table.browser.js` passed conditional/multi-selection
  actions, stale selection reset, Edit/Cancel, confirmation/cancellation, exact
  physical deletion URLs, protected failures, pending cleanup/retry, Column Finder
  highlight without row reordering and 180→257px width persistence on remount.
  Every API request was intercepted; zero production writes occurred.
- The default local PostgreSQL 18 service required a password and was untouched.
  A NEW disposable cluster was initialized under `%TEMP%/alzhen-offload-pg-*`,
  bound to 127.0.0.1:55439, with only synthetic fixture data. The connection's
  data_directory was checked against the newly created path before fixture SQL.
  Exact migration execution passed against the representative schema, including
  owned deletion, three preserved stops, snapshot/journal identity, repeat calls,
  source/target conversion protection, document protection, dependency rollback,
  no-image completion and unauthorized execution. Two concurrent local RPCs
  returned the same operation ID. The private server was then stopped; its files
  were retained. These prove local fixture behavior, not live
  Storage or every production dependency. Fixture SQL lives under backend/tests/
  fixtures/offload-deletion-{schema,assertions}.sql.
- Preload tests preserve Phase 2B.4's mocked 20 startup HTTP requests and shared
  report-cache behavior. No new production login/navigation latency measurement
  was made. New shared-width/cleanup metadata calls are additional page requests;
  do not interpret zero report-cache misses as zero total navigation requests.

### Files added/changed in this checkpoint

- Backend: app.ts; report.routes.ts; operations-report.controller.ts;
  operations-report.logic.ts and service; new table-layout.routes.ts,
  table-layout.service.ts and offload-deletion.service.ts.
- Frontend: OperationsEventSubmissionForm, OperationsReportsView, ReportsWorkspace,
  ReportDataView, TransmittalTrackerView; new OffloadDrSelector, OffloadCleanupNotice,
  ColumnFinder, HiddenColumnsControl, useSharedTableWidths; operations-report and
  operations-report-delete services; new offload-dr-selection/shared-table-widths
  services. Existing editing, paste/fill and row identities were retained.
- Tests: backend Offload details/logic/delete adaptations; new DR lookup, cleanup
  and table-layout tests plus disposable SQL fixtures. Frontend deletion tests,
  shared-width/DR tests and both browser fixtures. Browser logs were retained.

### Exact resume order (remaining Phase 2B.5)

1. Implement permanent Trips transaction deletion with a reviewed ownership graph,
   transactional snapshots and exclusively owned Storage cleanup. Existing
   archive UI/API remains until that replacement is ready. Do NOT relabel archive
   as permanent deletion or purge legacy archives. Source graph includes cascade,
   SET NULL and restrictive composite FKs; deleting a stop cannot be a blind
   parent-trip cascade. Preserve shared assignment/sibling ownership and protect
   conversion/history, shared billing/payables and document dependencies.
2. Finish authenticated deletion/DR/width smoke tests with approved accounts and
   disposable records; no real production destructive tests. Verify Storage
   retry semantics against an approved isolated bucket and all live triggers.
   Add confirmation attachment counts if metadata is made available without
   unnecessary signed-URL generation.
3. Integrate shared widths/Finder/compact hidden controls with Users, Trucks,
   Flexible Tables and other management lists. Current coverage is report-based
   grids only; do not claim global completion. Verify Trips Route width across
   real refresh/logout/devices and two authorized sessions. Add keyboard resizing
   and full pinned/hidden/copy/paste/fill acceptance coverage.
4. Implement true Operations/Tracker server pagination, counts, search/sort and
   bounded export; current overview APIs retain the earlier complete-snapshot
   preload guard and full interactive collections. DR lookup paging is separate.
5. Finish global skeletons/dashboard/preloading and measured large-table work.
6. Implement scoped cross-session invalidation for operational/flex data. Existing
   missing publication/SELECT privileges remain; do not broaden base read policies.
   Shared widths currently reconcile through authorized polling, not Realtime.
7. Audit remaining legacy views/Remarks ownership and archived/history consumers.
   No legacy report view was modified in this checkpoint.

## Phase 2B.5 — Permanent Trips deletion checkpoint (2026-10-16)

### Completed in this continuation

- Replaced Trips Archive/Restore and Archived Transactions controls with permanent
  transaction deletion. Confirmation identifies DR and destination; Cancel makes
  no write. The old archive route returns 410, preserving historical archived data.
- Both existing DELETE routes now use one ADMIN/STAFF controller/service:
  `/trips/:id/stops/:stopId` deletes the exact owned stop; `/trips/:id` accepts only
  legitimate no-stop trips. A parent with stops cannot be deleted through that route.
- A server-only RPC performs ownership/dependency checks, snapshots owned records,
  and deletes eligible records in one transaction. Shared trip reports, assignments
  and parent data survive while siblings remain. Last-stop/no-stop deletion explicitly
  handles parent reports, images and assignments. Logical flex SOURCE rows/cells
  are scoped by physical STOP/LINE_ITEM/STORE_CALL/TRIP/ASSIGNMENT identity.
- Blocks conversion history, financial records, retained reports referencing source
  items, inconsistent child trip/stop relationships, unknown document/Drive ownership,
  shared image references, and restrictive FKs. Existing guards remain enabled.
  Financial ownership is intentionally conservative: any trip billing/payable/
  receivable blocks transaction deletion pending review.
- Private durable journal stores snapshots and exact owned Storage objects before
  database deletion. Storage cleanup runs only after commit, in bounded exact-path
  batches. Failed Storage/acknowledgement leaves a pending operation with a visible
  retry action. Repeated/ambiguous requests retain the original transaction/job ID.
  No automatic worker was added; retries remain available after reload/login.
- Successful deletion invalidates Trips and dependent report caches. An ADMIN/STAFF
  identifier-only journal-version endpoint is polled once per session every 15s
  while visible and on focus. It deduplicates overlapping polls and ignores logout
  responses. This is authorized polling, NOT global Supabase Realtime completion.
  ReportDataView queues incoming refreshes until active cell/row editing finishes.

### Applied database change and live verification

- Applied once through connected Supabase MCP: `20261015194219`,
  `transaction_deletion_cleanup`, repository
  `backend/migrations/2026_10_22_transaction_deletion_cleanup.sql`.
- File SHA-256: `14E006A0E0E8FB9B9C8D8F347343DF866D6AC908415DD16B7481CE25A0519D5E`.
- Adds only private `transaction_deletion_jobs` and
  `delete_transaction_with_cleanup_v1(uuid,uuid,uuid)`; existing views, grants,
  policies, Storage configuration and publication membership are unchanged.
- Verified RLS, fixed function search_path, service-only EXECUTE, browser denial,
  and service journal read/state-update without DELETE or snapshot UPDATE.
- Before/after: 3 trips, 4 stops, 1 archived stop, 0 Offloads, 0 receipts, 11 objects
  across trip-images/report-receipts; new journal empty. No real production delete,
  test insert or Storage deletion occurred. Previously applied migrations were not rerun.
- The one unreferenced receipt object is `.emptyFolderPlaceholder` under an old
  Offload path. Ownership remains unproven; it was not deleted or reassigned.
- Recovery: disable deletion consumers while retaining journal/snapshots. Restoring
  relational snapshots requires reviewed replay; SQL cannot recover deleted image bytes.
  RPC briefly serializes dependency writers with table locks and a 3-second lock
  acquisition timeout. Review lock duration under larger workloads before scaling.

### Files changed in this continuation

- Backend: transaction.controller.ts, trip.routes.ts; new
  transaction-deletion.service.ts and the migration above.
- Frontend: ReportDataView.tsx, trip.service.ts, realtime.service.ts; new
  TransactionCleanupNotice.tsx and transaction-change-monitor.ts.
- Tests: backend/tests/transaction-deletion.test.ts; transaction deletion schema/
  assertions SQL and fixture README; frontend/tests/transaction-deletion.test.ts
  and transaction-deletion.browser.js. Existing recovered OperationsReportsView
  and its prior modifications were not edited in this continuation.

### Verification and measured behavior

- Backend: 104 tests pass, TypeScript build passes. Frontend: 42 tests pass,
  TypeScript/Vite build passes (existing large-chunk warning remains).
- Targeted frontend lint passes for changed source files. One pre-existing
  prefer-const diagnostic in the touched Realtime service was corrected without
  suppressing rules. Backend has no configured lint script.
- Actual complete migration passed on a NEW PostgreSQL 18 disposable database,
  including owned deletion, three-stop isolation, snapshots, source-item/financial/
  history/attachment guards, private permissions, restrictive-FK rollback and
  no-stop/last-stop parent cleanup. Two concurrent psql calls returned the same job.
  Existing local databases/default PostgreSQL service were not modified.
- Isolated browser fixture using the actual ReportDataView and real stylesheet
  passed DR/destination confirmation, Cancel, protected error, exact-stop retry,
  sibling preservation, selection clearing, pending Storage cleanup/retry and
  archive-UI removal. All API/Auth traffic was mocked: 12 requests in this fixture,
  2 DELETE requests (protected failure then success), zero production writes.
- Journal polling adds one initial request and up to four visible-session requests
  per minute; overlapping checks deduplicate. No authenticated production latency,
  cross-device or two-session Realtime benchmark was performed.
- Local unauthenticated GETs to `/api/trips/transaction-cleanup` and
  `/api/trips/transaction-changes` both returned 401. The disposable PostgreSQL
  server was stopped after verification; its cluster/database files were retained.
- Staged/unstaged diff checks passed; no unmerged index entries. Existing modified
  and untracked work was retained. No commit or push.

### Exact next resume point

1. Verify deletion and Storage retries with approved isolated bucket/test accounts;
   production destructive tests remain prohibited. Full live two-session testing
   is unavailable without credentials. Unknown document/Drive attachments remain
   explicit blockers, not silently discarded files.
2. Extend existing shared widths/Column Finder/compact Hidden Columns to Users,
   Trucks, Flexible Tables and remaining management grids. Current coverage is
   still report-based grids, including Trips/Operations/Tracker.
3. Implement real Operations/Tracker server pagination/search/sort/counts and bounded
   export. Current preload budget guards are not server pagination.
4. Finish global skeletons and measured preload/navigation performance. Existing
   bounded coordinator/cache remains intact; no new competing preload cache.
5. Complete secure global Realtime and cross-session layout invalidation. Missing
   publication/SELECT access remains; do not broaden sensitive base-table access.
   This checkpoint adds deletion-only authorized polling, not global Realtime.
6. Audit remaining legacy views/Remarks and deletion visibility. No legacy view
   contract was changed here. Global resizing/formatting/performance work remains.


## Phase 2B.5 - Secure Realtime and management controls checkpoint (2026-10-16)

This is a tested subphase, not completion of all Phase 2B.5 requirements.
Do not rerun previously applied migrations or test deletion on production records.

### Worktree preservation and ownership correction

- Started with status and unmerged-index inspection. ReportDataView had an actual
  conflict between legacy Archive/Restore and confirmed permanent deletion.
  Backed up the working file and all three index stages outside the repository:
  `%TEMP%/alzhen-realtime-conflict-n2uxu9_g`. Kept the permanent deletion callback
  and resolved only this file's index entry. No other files were staged by this task.
- Existing staged and untracked work remains. No reset, clean, commit or push.
- Fixed an existing stop-dispatch edit mapping regression in report-editing.config:
  stop rows update trip_stops with their physical stop/parent IDs; no-stop rows retain
  trips ownership. The existing ownership regression test now passes.
- Removed a duplicate TypeScript `error` property in api.service's response type.

### Applied additive database change

- Connected project: `hdmknewarynwpbrhfgai`.
- Applied exactly once: `20261016003820`, `admin_change_signals`.
- Repository: `backend/migrations/2026_10_23_admin_change_signals.sql`.
- SHA-256: `8465C2BA114AE2E6CBC0663FEA43896F1419CE0132C8F7DD7D4317E978B96765`.
- Adds one metadata table: topic (source-table name), opaque UUID revision and time.
  There are no business values, row IDs, profile details or private Storage paths.
- 51 statement-level source triggers upsert the topic revision in the writer's
  transaction. Rollback also rolls back the signal. No operational backfill.
- Metadata SELECT requires ADMIN/STAFF profile plus an unexpired matching-role
  application day session. No anonymous read or browser INSERT/UPDATE/DELETE.
  Functions use fixed search_path; the trigger function is not browser-executable.
- Publishes only the metadata table. Existing base RLS, grants and views unchanged.
  Protected backend APIs still authorize the actual business-data refetch.
- Read-only pre/post: 4 trips, 5 stops, 0 Offloads, 0 receipts, 40 Storage objects.
  All 51 triggers, new RLS/ACL/functions/publication verified. Metadata initially empty.
- Existing base privilege/RLS hash unchanged:
  `ac8754a40db4f563d86304d92c0e92c5`; existing policy hash unchanged:
  `b4ae659f549fa8757e2291c26662a1ff`.
  Earlier observations differed because live state changed outside this task;
  the immediate pre/post migration snapshots are the comparison above.
- No production DML, report deletion, Storage deletion or fabricated operational
  records were used as tests. The unreferenced old receipt placeholder is untouched.
- Recovery: disable the new consumer while retaining metadata; separately review
  removal of only the specifically named triggers/helper/table. Operational data
  restoration is unnecessary for this additive installation. A 3s lock timeout
  avoids waiting indefinitely for installation locks. Topic-row updates serialize
  writers per source; monitor contention under production load.

### Realtime architecture and coverage

- One Admin/Staff change channel replaces the broad base-table channel set.
  Existing recipient-only notification channel remains. JWT set explicitly;
  session generations, reconnect backoff, logout cleanup and deduplication added.
- Coalesces 150ms signal bursts into one batch notification. API snapshot recovery
  deduplicates concurrent reads, retries failures and ignores superseded/logout
  results. Visible recovery is 60s; prior deletion-only 15s polling is fallback
  only while signal transport is unhealthy.
- Shared layouts refetch through the existing protected API on layout signals.
  Recovery polling reduced to 60s; remote widths wait until active drag completes.
- Deferred refresh gate preserves focused cells and modal drafts; Enter/blur still
  commits edits. Queued refresh runs after commit/cancel. Handles StrictMode cleanup.
  Operations selection survives value-only refresh with identical physical IDs;
  changed identity sets, search and filters invalidate selection.
- Flexible-table save errors retain drafts; quiet metadata refresh no longer
  unmounts the active table. Auth changes clear shared-width session state and
  ignore late reads/queued writes.

| Sources / modules | Implemented handling | Verification limit |
| --- | --- | --- |
| Trips/stops/items/assignments/events | Metadata triggers; protected report/detail/calendar refetch; exact stop edit ownership | Mock browser + unit tests; no live two-account edit |
| Loading/Unloading/Backload/Offload/items/receipts/history | Shared signal batch; Operations cache invalidation and deferred refresh | Actual components with mocked transport; no production create/delete |
| POD/Transmittal/flex reference | Signals and tracker cache invalidation; draft-safe refresh | Local tests only; live API permission blockers listed below |
| Customers/stores/warehouses/drivers/trucks/products and related lookups | Signals; lookup/master/user refresh | Management browser fixture uses mocked APIs |
| Flex cells/rows/columns/options/permissions | Signals; quiet protected API refresh; failed draft retained | Local tests, no live cross-session permission exercise |
| Shared column layouts | Existing revision/CAS API + signal refetch + drag deferral | Two mocked contexts; cross-device persistence not live verified |
| Dropdown configuration | Invalidation + options refresh after active editing releases | Unit/mock transport coverage |
| Notifications | Existing recipient-only channel + signal recovery | Existing authorization preserved; no live staff notification sent |
| Financial/incident/demurrage/other source dependencies | Signals for active source tables and dependency invalidation | Not every legacy consumer reconciled; see remaining work |

### Shared spreadsheet controls extended

- Reuses shared_table_column_widths for Users (Admin/Staff and Truckers lists),
  master-data Warehouses/Trucks/Stores/Store contacts/Products/Truck pictures,
  and each Flexible Table. No new width store or data-edit permission.
- Company-wide width keys are stable table/column identities. Pointer release
  persists once; cancel does not save. Keyboard arrows resize by 10px. Remote
  changes wait during dragging, with existing optimistic/CAS failure feedback.
- Existing Finder now supports tables with no leading checkbox; Flexible Tables
  preserve their row-header offset and omitted-hidden-column DOM structure.
- Compact Hidden Columns restores individual/all columns. Management visibility
  remains personal local preference; Flex keeps existing stored visibility and
  permits local reveal without changing its server configuration.
- Address/Notes/Remarks defaults 320px; names/customers/stores 240px where applicable.
  Existing report pin offsets and selection behavior retained.
- General management grids remain management lists; formatting/fill-down and
  data editing are not granted merely by adding layout controls.

### Files changed in this checkpoint

- Backend: app.ts; new realtime.routes.ts, admin-change.service.ts; migration above.
- Frontend services: realtime.service.ts, shared-table-widths.ts, api.service.ts,
  report-editing.config.ts; new admin-change-feed.ts and deferred-refresh.ts.
- Frontend components: OperationsReportsView, ReportDataView, TransmittalTrackerView,
  FlexibleTableSectionTabs, OverviewCalendarCard, ColumnFinder, useSharedTableWidths;
  new useDeferredRealtimeRefresh and useManagementTableColumns.
- Auth/pages: AuthContext; CalendarView, OverviewView, TripDetailView, TruckersView,
  MasterDataView and FlexibleTablesView.
- Tests: new backend admin-change.test.ts and signal schema/assertions fixtures;
  frontend admin-change-feed.test.ts, admin-realtime.browser.js,
  management-columns.browser.js; updated shared-widths.test.ts and
  operations-table.browser.js. Fixture README updated.

### Tests, measurements and limitations

- Backend full suite: 107 passed. Backend TypeScript build passed.
- Frontend full suite: 49 passed using
  `node ../backend/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.app.json --test tests/*.test.ts tests/*.test.tsx`.
  Direct Node strip-types was tried but cannot resolve this repository's extensionless
  imports/TSX; those runner failures are not passing tests. Frontend production build
  passed; existing >500kB bundle warning remains.
- Targeted source ESLint: no new diagnostics. Full changed-source selection has
  10 existing errors and 1 existing warning across AuthContext (5 + 1), Tracker (2),
  and TruckersView (3), confirmed by running the same rules on index versions.
  New core services/hooks and management/Flex integrations pass targeted lint.
  Backend has no configured lint script. Git staged/unstaged checks pass.
- Actual full signal migration executed successfully in a NEW PostgreSQL 18 fixture:
  51 triggers, transaction rollback, metadata-only payload, ADMIN/STAFF read,
  TRUCKER/expired/missing identity denial, and unchanged base privileges.
- Existing Offload and transaction deletion SQL assertions also pass in two NEW
  disposable databases with the new signal migration installed. Checks include
  protected history, child ownership, sibling preservation and durable manifests.
  Local wal_level is not logical: this verifies SQL/RLS/publication catalogs,
  not actual Supabase websocket delivery. Owned cluster stopped; fixtures retained.
- Isolated real-component browser fixtures pass: Operations table, DR form,
  permanent transaction deletion, two-context Realtime, management controls.
  Every API/Auth/transport was mocked; zero production fixture writes.
- Mock measurements: 3 related source topics -> one Operations overview request
  per context; request counts 11 and 9 across the full two-context scenario,
  overview reads 3 and 2. Active draft and selection preserved; reconnect leaves
  one live change channel; logout/Trucker starts none. Route resize waits for release
  and converges across both contexts. This is not a production latency benchmark.
- Management fixture: 3 width writes (Users keyboard, master drag, Flex keyboard),
  no write during pointer movement; navigation restores width, correct no-checkbox
  Finder highlight and hidden Flex reveal; no browser exceptions.
- Local unauthenticated `/api/realtime/changes` returns 401. Actual authorized
  websocket delivery, cross-device widths and authenticated API workflows remain
  unverified without approved test accounts. No real Storage uploads/deletes tested.
- Live service_role SELECT missing on backload_items, pod_records, pod_drive_files
  and tms_route_options; direct reads may fail. No privileges broadened. Inspect
  actual protected API dependencies before proposing any minimal service-only grant.

### Exact next resume point

1. Verify actual Realtime with approved Admin/Staff test accounts in two sessions;
   no production destructive tests. Monitor topic-trigger lock contention and
   reconnect behavior. Inspect the potential service-role read blockers above.
2. Implement true Operations/Transmittal pagination/search/filter/sort/counts with
   stable source IDs, page-scoped selection and bounded export. Current snapshot
   read-budget guards remain; they are NOT server pagination.
3. Preserve existing bounded preload/shared token cache. Add initial-page warming
   for the new paginated APIs; measure login/navigation against authorized accounts.
4. Finish remaining management grids (e.g. generic Database Explorer/lookup cards
   where applicable), global skeleton/formatting coverage and large-table profiling.
   Do not claim every application table or spreadsheet interaction is standardized.
5. Reconcile remaining legacy vw_* contracts/Remarks ownership and deletion visibility.
   No legacy view definition was changed by this checkpoint; legacy POD view uses
   older trip-level fields and needs consumer analysis before replacement.
6. Production permanent-delete/Storage retry remains untested; keep recovery journals
   and the old unreferenced receipt placeholder. No extra cleanup without ownership
   proof and the user's separate approval.


## Phase 2B.5 - Tracker pagination and loading checkpoint (2026-10-16)

**Not full Phase 2B.5 completion. Approved Tracker migration applied and verified.**
User explicitly approved the exact hash below. Supabase confirmed application as
`20261016020431` (`tracker_pagination`); paginated Tracker is now the Vite default.
Operations pagination remains the next implementation task.

### Repository recovery and preserved features

- Initial status/index inspection found new conflicts in trip.routes.ts,
  TripDetailView.tsx and realtime.service.ts. Saved working files and all three
  index stages outside source at `%TEMP%/alzhen-pagination-conflicts-330631439f044ed1ba976a2f1934572e`.
- Merged receipt/OCR routes and image/detail cache invalidation with the completed
  permanent deletion routes and deferred Realtime refresh. Archive endpoint stays
  retired (410). Resolved only these three index entries; other new work is unstaged.
- No reset/clean/restore, commit or push. Existing report grids were not recreated.
- Two newer receipt/activity consumers lacked the new batch-event discriminant,
  causing TypeScript errors. Receipt batches now trigger receipt reloads. Detailed
  live-activity messages consume only actual row events; metadata cannot provide
  the business values needed to invent those messages. Secure row-level activity
  enrichment remains a specific integration gap (see resume list).
- Installed already-declared frontend dependencies because tesseract.js was absent
  locally. No manifest/lockfile changes. npm completed with cleanup warnings for
  native binaries held by the existing Vite process; that process was not restarted.

### Tracker pagination implementation

- New ADMIN/STAFF endpoint: `GET /api/reports/transmittal-tracker/page`.
- Allowlisted search/filter/sort, page >=1, page size 1-100 (UI 25/50/100), stable
  stop-ID tie breaker and one exact count with the page request. Page IDs come from
  PostgreSQL `.range`; source stops and enrichments are scoped to those IDs.
  There is no fetch-all-then-slice path in the new endpoint.
- Reuses existing Tracker access checks, cell version/CAS paths and canonical row
  builder. Source IDs/order are retained. Missing pagination view returns an
  actionable 503, never an implicit unbounded fallback. Out-of-range pages give a
  clear Previous/refresh error; cached rows remain visible on failed requests.
- Frontend uses canonical token/parameter cache keys shared with login preloading.
  Includes page controls, server search/sort/filter, page-scoped selection and
  draft-protected navigation. Selection cannot reappear when returning to an old
  page. Active drafts defer incoming results; save remains Enter/blur.
- Explicit exports use fresh 100-row API pages, exact-reference filtering where
  appropriate, duplicate/count-change checks, and a 20,000-row client export cap.
  No historical export rows replace the visible page. Exports are bounded but are
  not an atomic multi-page database snapshot or server-streaming exporter.
- Prepare Sheet searches references across server pages and loads a separate,
  bounded full-reference snapshot for preview/export. Grid pagination stays intact.
  Sheet-only drafts are scoped to that reference, not unrelated filtered exports.
- Activation: Vite applications default to paginated loading. Explicit
  `VITE_TRACKER_PAGINATION=false` retains the legacy API path for rollback.
  Node tests without Vite env retain legacy compatibility. Actual authenticated
  browser-to-production pagination remains unverified without test credentials.

### Exact approved SQL and application

- File: `backend/migrations/2026_10_24_proposed_tracker_pagination.sql`.
- SHA-256: `4C5892B5E945B3E64F5A3BE694B665EB2524469DB1E3344D75629A503F35BFDC`.
- Adds ONLY `v_transmittal_tracker_page`, `tracker_page_text_v1(jsonb,text)` and
  `tracker_page_cells_v1(jsonb,bigint,bigint)`.
- Purpose: query the effective stop-owned Tracker display values in PostgreSQL
  before paging, including manual overrides and legacy POD-map resolution.
- Reads existing trips/stops, assignments, drivers/trucks, warehouses, stores/
  customers, trip line items and flex tables/rows/columns/cells. One row per stop;
  zero/multiple active PRIMARY assignments retain transactions without arbitrary
  vehicle details. Source binding ambiguity raises an error rather than merging.
- New view SELECT and helper EXECUTE are service_role only. No base-table grants,
  RLS, Storage, publication, existing view contracts or operational data changes.
  Existing backend role and flex access restrictions still apply.
- No data backfill, records moved, deletion, receipt cleanup or fabricated live data.
- Recovery: disable the frontend flag first. After separate review, remove only
  the new view and pure helpers. No operational data restoration is required.
- Exact proposal and five-point impact/recovery explanation were approved by the
  user. Hash rechecked immediately before application. Applied once through MCP;
  Supabase returned success and recorded `20261016020431`. Do not rerun this file
  or `20261016003820`. The approved file remains byte-for-byte unchanged.

### Loading, cache and preloading improvements live in local code

- Master-data grids use the shared TableSkeleton on uncached initial load.
  Users keep their existing row skeleton only while no valid rows exist.
  Flexible Tables reuse TableSkeleton and SkeletonBlock for table/card loading.
- Master-data and Users preserve rows during background loading/error, show retry,
  and retain existing empty states. Master rows are scoped by token/resource so
  warehouse data cannot briefly appear under Trucks/Stores headers.
- Master-data initial pages reuse the existing token-scoped API cache. Warmed
  Warehouses renders immediately; related lookup requests also share cache.
  Manual refresh and successful writes invalidate appropriate resource/lookups.
- Existing login coordinator now warms bounded initial Warehouses/Trucks/Stores
  pages, after the report tasks. Combined (the default Reports view) starts before
  secondary metadata. Queue remains two tasks; report tasks can each fan out to
  metadata+data, so measured peak HTTP concurrency is four, not two.
- Existing Operations overview/preload read budgets remain unchanged and are NOT
  true pagination. Other initial report pages retain their shared cache.
- No broad table rewrite, virtualization, new formatting framework or idle autosave.
  Remaining global skeleton/date/formatting coverage and profiling are unfinished.

### Live read-only schema / ownership audit

- Connected MCP project previously identified as `hdmknewarynwpbrhfgai` retained
  the expected schema/migration fingerprints. Before application, new objects were
  absent and latest migration was `20261016003820`; afterward it is `20261016020431`.
- Live verification: all 17 new view columns match fixture names/order/types;
  four distinct stop rows, no duplicate stop IDs. View/helper access service_role
  only; anon/authenticated denied. Helpers retain fixed search_path. All 13 old
  view definition hashes, public RLS policy hash and base privilege hash unchanged.
  Counts unchanged: 4 trips, 5 stops, 0 Offloads, 0 receipts. No operational DML.
- Source column names/types for the proposal were catalog-checked. No duplicate
  active Tracker stop bindings or active PRIMARY assignments observed.
- Current data: 4 trips, 5 stops, 0 Offloads, 0 report receipts. No production test
  records were created/deleted. Old unreferenced receipt object was not touched.
- Current Dispatch Monitoring, Dispatch Report, Trip Booking and Combined row-key
  duplicate-group counts all zero. Dispatch-vs-stop mismatch count zero; Combined
  transaction DR/Quantity/CBM-vs-stop mismatch count zero. Small-data snapshot,
  not proof of every possible future combination.
- Active frontend uses v_* report views and physical stop edit mappings. Legacy
  `vw_pod_status_tracker` still uses parent-trip dispatch and POD DR/reference.
  Existing report API consumers need review before replacing its contract.
- service_role SELECT still absent on backload_items, pod_records, pod_drive_files,
  tms_route_options. This alone does not prove an active API failure: current
  Tracker uses stops/flex, and owner-executed views can read private base tables.
  `vw_pod_drive_files` itself also lacks service SELECT, so its legacy report API
  has a genuine permission risk. No blanket grant was proposed or executed.
- No approved Admin/Staff test credentials were supplied. Actual authorized
  websocket delivery, reconnect and cross-device layout verification are untested.
  No credentials were extracted, accounts created or production records mutated.

### Verification and measurements

- Backend: 111 tests pass, TypeScript build passes. Frontend: 55 tests pass,
  TypeScript/Vite production build passes. Existing large-chunk warning remains.
- New tests cover page/query validation, actual Tracker service stop scoping,
  missing-view no-fallback behavior, page/token cache separation, deduplication,
  export bounds/drift failures, master-cache invalidation, and preload reuse.
- Targeted lint has no new diagnostics. Seven existing errors remain in touched
  files: ReceiptReviewCard (2), Tracker (2), TruckersView (3); checked against
  index versions with the same ESLint rules. No rule suppressions. Backend has
  no lint script. Staged/unstaged diff checks pass; no unmerged entries.
- Complete final proposal executed successfully in NEW disposable PostgreSQL 18
  database `tracker_page_final_21b64dbc30f3409e99e360e22104e06e` in the verified
  owned cluster on 127.0.0.1:55439. Existing databases/default service untouched.
  Tests: three-stop identity, completed/history eligibility, multiple assignments,
  overrides/legacy conflicts, permission boundaries, scoped change and deletion
  visibility. All 17 output names/order/types verified (UUIDs/sequence integer/text).
  This is a representative schema, not a full live-schema clone or Supabase E2E.
- Isolated actual-component browser tests pass: Tracker pagination, management
  controls, Operations table, permanent transaction deletion, two-context Realtime.
  All Auth/API/Realtime transport is mocked. Zero production fixture writes.
- Tracker browser measurement (55 synthetic rows): six total page requests including
  initial/next/search, full-reference preview and off-page reference lookup; cached
  return adds zero. Full REF1 preview includes 54 rows while filtered grid stays
  unchanged. Final run uses the actual default feature setting without flag injection:
  initial fixture mount 1798ms, cached navigation 1352ms including
  Playwright scrolling/locator overhead and Vite dev-module work; not a React render
  benchmark or production latency claim. Selection reset/draft guard verified.
- Final rerun after approval: backend 111/111, frontend 55/55; both builds pass.
  Focused lint for core services/master/flex/activity sources passes. Broader touched
  file lint exits 1 with the same seven baseline errors described above.
- Owned disposable PostgreSQL server stopped after verifying its exact data_directory;
  fixture databases retained. Default PostgreSQL service and existing databases untouched.
- Mock preload: 23 initial requests, peak HTTP concurrency 4, warmup 204ms;
  navigating warmed reports and three management datasets adds zero requests.
  Timings vary by machine and fixture delay; no production speedup is claimed.
- Existing two-context fixture still measures one Operations read per context for
  a three-topic batch, drafts/selection preserved, remote drag deferral and logout
  cleanup. The new page endpoint returns 401 without authentication locally.

### Changed files in this continuation

- Conflict merges: backend/src/routes/trip.routes.ts;
  frontend/src/pages/Admin/views/TripDetailView.tsx; frontend/src/services/realtime.service.ts.
- Backend: controllers/transmittal-tracker.controller.ts, routes/report.routes.ts,
  services/transmittal-tracker.service.ts; new services/tracker-pagination.ts.
- SQL/tests: proposal above, tracker-pagination-schema.sql/assertions.sql,
  backend/tests/tracker-pagination.test.ts and fixture README.
- Frontend: TransmittalTrackerView.tsx, ReceiptReviewCard.tsx, useLiveTripActivity.ts;
  MasterDataView.tsx, TruckersView.tsx, FlexibleTablesView.tsx;
  services/transmittal-tracker.service.ts, master-data.service.ts, admin-preload.service.ts.
- Frontend tests: admin-preload.test.ts; new tracker-pagination.test.ts,
  tracker-pagination.browser.js and master-data-cache.test.ts; this progress file.

### Exact next resume point

1. Verify authorized Tracker pagination against the deployed backend/frontend using
   approved test accounts. Schema/read verification passed; authenticated end-to-end
   creation/edit/refresh and real websocket delivery remain untested.
2. Finish Operations server pagination. Its four physical sources and classification
   filters need a reviewed service-only UNION index/projection, then page-scoped
   hydration and exports. Preserve existing deletion identity/retention behavior.
   Do not disguise the current overview snapshot as paginated.
3. Large Tracker exports remain capped at 20,000; streaming/consistent snapshots
   need separate work. Cross-page Prepare Sheet lookup and preview are complete.
4. Complete global skeleton/formatting/date consistency and remaining table coverage.
   Preserve existing shared widths/Finder/hidden controls. Profile production-like
   large fixtures before virtualization or claiming Excel-level responsiveness.
5. Review legacy POD consumers/permissions and a protected row-level activity API
   for the newer detailed activity hook. Metadata-only signals cannot reconstruct
   receipt/status payloads. Do not broaden SELECT to solve this.
6. Use approved test accounts for real two-session create/edit/layout/dropdown/
   reconnect/logout tests. Do not delete production records or use unapproved
   Storage objects. Existing durable deletion flows remain regression-tested mocks.

## Phase 2B.5 - Critical persistence checkpoint (2026-10-16)

**Partial implementation of the expanded request, not release acceptance or full
Phase 2B.5 completion. Prioritize remaining persistence coverage before cosmetics.**

### Confirmed root causes and code fixes

- Initial `git status --short --untracked-files=all`, `git ls-files -u` and
  `git diff --check` were clean. Existing committed Phase 2B.5 work was preserved.
- `backend/src/services/report.service.ts` enriched every report row with its
  parent's dispatch number after reading the correctly stop-scoped v_* view.
  A successful `trip_stops` write could therefore be followed by an API response
  containing the old parent dispatch. Null transaction identifiers also inherited
  parent values. Parent enrichment is now restricted to actual trip-only rows;
  stop values, including null, remain authoritative. Stop-only pages also skip
  the unnecessary parent-reference query. No view writes were introduced.
- Store Calling assignment enrichment now excludes unassigned PRIMARY records.
- Billing invoice updates returned only `id`. `trip.service.ts` now returns
  `id, trip_id, invoice_number`, so confirmation uses the saved value rather than
  a client assumption. Actual service mocks verify both parent filters, canonical
  response, null invoice clearing and rejection of a different parent before write.
- `ReportDataView.tsx` previously substituted the submitted draft when a successful
  response omitted the edited field. It now calls `confirmReportCellWrite` before
  modifying rows/cache or showing Saved. Confirmation checks physical source ID,
  applicable trip/stop parents, field presence and the requested value. Numeric
  serialization and equivalent date/timestamp representations are accepted; null
  is never treated as zero. Stop DR explicit-empty behavior is preserved. A
  malformed/mismatched response retains the draft and explains lack of confirmation.
- Ordinary edits still use protected physical APIs: trips, trip_stops,
  trip_line_items, trip_truck_assignments, billings and store_calls. Stop/line-item
  calls keep trip + stop + item IDs; transmittal references retain the existing
  flex-cell CAS service. No conversion, deletion or receipt behavior was changed.
- `DriverPortal.tsx` had a separate StrictMode/effect-cleanup race: the first
  effect's consumer became inactive, while an in-flight boolean caused the next
  effect to skip attaching a replacement. It now reuses the pending token-scoped
  promise with a live consumer, ignores obsolete responses and only releases its
  own request. Refresh/retry loading starts in their event handlers; token refresh
  no longer resets an unchanged transaction's receipt/DR draft. Existing polling
  remains a recovery mechanism; Socket.IO/cross-navigation Trucker caching is not
  implemented by this fix.

### Approved database correction

- User explicitly approved `backend/migrations/2026_10_25_proposed_store_call_identity.sql`.
  SHA-256 `94D8CDF87973919B0240F95B274A8662070A816D39C850A5E2264298CE62DD59`.
  Applied exactly once via MCP; Supabase confirmed migration `20261016085344`,
  `store_call_identity`. Do not rerun it or the already applied Tracker migration.
- Replaces only `vw_store_calling_tracker`. Stop dispatch/transaction identifiers
  come from the exact stop (including null); trip-only calls retain parent values.
  Stop joins verify the parent. Zero/multiple active PRIMARY assignments preserve
  calls without choosing an arbitrary vehicle or multiplying rows.
- All 45 existing output names/order/types preserved. Owner and ACL unchanged;
  zero Store Calling records before/after. No base table, RLS, grant, publication,
  Storage, conversion history or operational data modification in the migration.
- Captured original view SQL: `backend/tests/fixtures/store-calling-legacy-view.sql`.
  After explicit review, restoring that definition is the view-only recovery path.
- Permission limitation: service_role still lacks SELECT on this legacy view;
  the API's existing authorized `v_store_calling` fallback remains readable and
  retains its own correct stop dispatch/assignment logic. Do not casually grant
  access: legacy `contact_status`/`assigned_to_id` differ from generic API filter
  names. Review the complete query contract before changing view preference/grants.

### Verification performed

- Backend tests: 113 passed. Frontend tests: 57 passed. Both TypeScript/production
  builds passed; existing Vite large-chunk warning remains. Targeted ESLint on
  ReportDataView, DriverPortal and the new confirmation helper passes. Both Git
  diff checks pass; no unmerged entries. Backend has no configured lint script.
- Actual service regression uses three synthetic stops under one trip, writes
  only the exact physical trip_stops row, waits 5.1 seconds and performs fresh
  reads through all five report services. Proves sibling isolation, zero/null
  preservation, dropdown persistence and rejected database writes. A separate
  trip-only fixture verifies that legitimate parent enrichment still works.
  These are mocked Supabase clients, not production fixture writes.
- Complete Store Calling SQL executed successfully in NEW disposable PostgreSQL
  18 database `store_identity_7b82ca56dea3403aadabedbe005aa00f` in the verified owned
  cluster on port 55439. Recreated captured current view first; compared all 45
  names/order/types after replacement. Assertions cover three stops, blank IDs,
  trip-only calls, mismatched parent, stale/secondary/ambiguous assignments and
  scoped updates. Synthetic data rolled back. Representative schema, not live clone.
  Owned server stopped after checking data_directory; fixture database retained.
  Initial start without explicit port failed to bind the default port; retry used
  explicit owned port 55439. No existing/default PostgreSQL service was changed.
- Isolated real-component browser tests: `report-edit-persistence.browser.js`
  verifies Enter, five-second stability, malformed-success rejection, retained
  draft, Escape and no duplicate Enter/blur write. `trucker-loading.browser.js`
  verifies StrictMode initial request count 1, failed refresh retaining rows and
  retry success (3 total requests). Transport/Auth mocked; no production writes.
- Existing permanent transaction deletion browser fixture rerun passes cancellation,
  protected history, exact stop identity, sibling preservation and cleanup retry
  (12 mocked requests). No actual deletion was performed.
- User manually signed in to an approved Admin test account and explicitly selected
  the DR 333 test transaction for temporary dispatch edits/restoration. Three
  temporary edits plus three restorations used protected application APIs only.
  Original dispatch `This is a test.ere` restored; parent/sibling verified unchanged.
  Updated timestamps and change-signal revisions naturally reflect those approved
  tests; no attempts were made to erase their audit footprint.
- Authenticated live test: HTTP 200 confirmed exact stop ID, value persisted after
  5.2 seconds, read-only database/view checks agreed, browser reload retained it,
  blur restoration returned 200. No genuine operational records were selected.
- Live two-tab test (same approved account, separate clients): commit response
  2554ms, second tab displayed update 2615ms after confirmation; observed 8 websocket
  frames including 2 admin_change_signals frames. This is not two different users,
  not Socket.IO latency and not a production performance benchmark.
- Live draft test: another tab committed the approved test change while the first
  had an unsaved draft. Draft survived 5.5 seconds; Escape then revealed committed
  remote value. Original dispatch restored afterward. No draft text was broadcast.

### Realtime coverage at this checkpoint

Socket.IO server/client, collaborative presence, server commit sequences and conflict
notifications are **not implemented**. Existing Supabase metadata-signal pipeline
and protected refetch remain authoritative; no parallel broadcast system added.

| Module | Authoritative source / Supabase signal | Cache and role behavior | Evidence / remaining work |
| --- | --- | --- | --- |
| Trips / standard reports | trips, stops, line items, assignments -> admin_change_signals | ADMIN/STAFF report/trip invalidation; active drafts defer refresh; coordinator reconciles on reconnect | Live same-account two-tab dispatch and draft tests; all-field/two-user conflict coverage remains |
| Operations / Offload | physical report/item/receipt sources -> metadata signals | ADMIN/STAFF overview cache and deferred grid refresh | Prior mocked creation/deletion tests; no live deletion test, unchanged safeguards |
| Transmittal | stop values + flex cells -> metadata signals | ADMIN/STAFF bounded page cache; CAS and draft gate | Prior pagination/preview/export mocks; real cross-account ref test pending |
| Trip Details | trips, stops, events, receipt sources -> metadata signals | existing scoped API refetch/deferred cargo dialogs | No new URL routing/cache redesign in this checkpoint |
| Users / master data | profiles, trucks, drivers, lookups -> metadata signals | ADMIN/STAFF resource caches; modal/edit gates | Existing management fixtures; no new account mutations |
| Flexible tables / shared widths | flex sources / shared_table_column_widths -> signals | authorized API access; revisioned widths and drag deferral | Prior mocks; company-wide order/format storage remains unfinished |
| Notifications | admin_notifications -> existing subscription/signal | existing authorized notification API | No new live notification approval workflow tested |
| Requests / POD | existing document/POD sources | existing protected APIs only | Requests-integrated approval/atomic linked updates not implemented |
| Trucker portal | assigned-trip APIs; existing timed recovery | restricted TRUCKER endpoints and app session enforcement retained | StrictMode fix browser mock; no authenticated Trucker test yet |
| Dashboard / location | current trip/event sources | existing admin invalidation | Socket pin-only delivery and hourly road-routing cache pending |

### Files in this continuation

- Backend: `src/services/report.service.ts`, `src/services/trip.service.ts`;
  existing `tests/trip-detail-report.test.ts`;
  new `tests/report-edit-persistence.test.ts`.
- Database/fixtures: approved migration above; new store-calling legacy view,
  representative schema and assertions SQL; fixture README.
- Frontend: `components/admin/ReportDataView.tsx`, `pages/Driver/DriverPortal.tsx`;
  new `services/report-edit-confirmation.ts` and its unit test; new report editing
  and Trucker loading browser fixtures. This document and browser-generated logs/
  snapshots are retained. No package, auth policy or dependency changes.

### Exact next resume point for the expanded request

1. Finish comprehensive physical-field audit and authenticated numeric/date/dropdown/
   nullable saves on approved fixtures only. Dispatch regression is proven; do not
   extrapolate to every editable cell or claim universal release acceptance.
2. Design server-authoritative commit versions/conflict notifications with any SQL
   proposed for approval first. Existing per-resource CAS protections must not be
   weakened. No generalized last-save-wins/conflict UX has been added yet.
3. Implement secure Socket.IO alongside existing Supabase signals: reuse full JWT
   and app-session checks (Manila expiry, Trucker single-device), room authorization,
   bounded presence events, cleanup and an explicit multi-instance bridge. No draft
   values in payloads. Test separate Admin/Staff accounts and approved Trucker login.
4. Then complete URL-based Trip Details/actions/cache and partial-save wizard,
   OCR + approved AI stage, hourly road routing, Requests POD approval and secure
   temporary-password flow. Preserve existing OCR and do not activate new paid
   providers/document transmission without approval.
5. Finish shared formatting, unified search, remaining table/UI work, Operations
   pagination, preloading/performance and global Realtime coverage. Each additional
   live migration requires its own exact proposal and explicit approval.
6. No commits/pushes, no deletion test against production. Keep existing permanent
   deletion/storage workflows untouched and rerun their regression fixtures.

## Phase 2B.5-B — Socket.IO / Collaboration Checkpoint (October 16, 2026)

This continues the Critical Persistence checkpoint above. Existing stop ownership,
Store Calling, Trucker StrictMode loading and permanent deletion/storage work is
preserved. No merge conflicts, reset, commit or push. This is a tested collaboration
checkpoint, **not completion of every expanded Phase 2B.5 requirement**.

### Implemented

- Socket.IO attaches to the existing Express HTTP server. Supabase validates JWTs;
  actual profile role/name and existing midnight/single-device session guards are
  enforced. Token expiry, periodic revalidation, role/trip/table rooms, packet and
  connection budgets, heartbeat expiry and disconnect cleanup are implemented.
- ADMIN/STAFF receive metadata, not draft text. TRUCKER only joins its own user
  room/current assigned trips and cannot access management record reads or rooms.
- Successful REST responses emit physical source/ID, field keys, actor and version.
  A live test found that mounted routers trim `req.path`; the observer now captures
  `originalUrl` before routing. A focused regression covers the exact failure.
- Existing six-table Supabase changes bridge metadata across server instances;
  optional Redis adapter relays interactive presence and confirmed actor metadata.
  Multi-replica deployment requires shared Redis and explicit WEB_CONCURRENCY.
- Auth-owned frontend client deduplicates connections/rooms/signals, rejoins on
  reconnect and cleans up on logout/token changes. Report cells display remote
  names/colors, advisory selection/editing outlines and conflict notices with the
  latest persisted value. Active drafts are preserved; Enter/blur/Escape remain.
- Lower server versions cannot overwrite newer confirmed values. Scalar changes
  patch matching physical rows/cache pages; structural, relationship, filtered or
  sorted membership changes defer/coalesce a page refresh. The coarse signal does
  not cause a duplicate source refresh while the detailed bridge is healthy.
- Canonical record reads deduplicate overlapping requests. Presence lookup is
  indexed per cell; unchanged heartbeat payloads do not rerender the grid.
- Trucker assigned trips use the existing token-scoped API cache, preserve rows
  during refresh/failure, coalesce assigned-trip signals and defer while saving or
  uploading. Existing 30-second recovery remains for unpublished dependencies.

### Approved migration applied once

- `20261016094657` / `collaboration_versions`, exact file
  `backend/migrations/2026_10_26_proposed_collaboration_versions.sql`.
- SHA-256 `ADD1A74720680D48398665B7D6EA4D281BB6745AEAAC34DF1941E7FE015FD7C6`.
- User explicitly approved; hash rechecked and dependent builds/tests/browser
  fixture passed before applying. Supabase returned success. Six bigint columns,
  six increment triggers, bounds checks and helper ACL verified afterward.
- Version increments serialize under each physical row lock, not client clocks.
  Existing rows start at zero. No business field backfill or deletion. Counts
  unchanged by migration: trips 6, stops 7, items 8, assignments 6, calls 0,
  billings 0. No RLS/table grants/publications/storage/view changes.
- Disposable PG18 sequential/rollback/forced-version/ACL tests passed. Two actual
  fixture connections serialized to final value `second`, version 2. Retained
  fixture DB: `collaboration_versions_8365932023c74bd6b5181ffd5769ad87`.

### Authenticated and isolated evidence

- User manually signed in two different ADMIN accounts on localhost and 127.0.0.1
  origins, then a real TRUCKER account. Credentials were not printed or stored in
  test files. These were two ADMINs, not an ADMIN/STAFF pair.
- User explicitly approved temporary edits/restoration of DR 333 only. Stop
  `76883550-70e8-4f64-b69d-f17b2120375b`, trip
  `185788e0-23c0-48f0-9108-9be1bad783c6` retained physical identity. Live presence,
  same-cell conflict notice, active draft preservation, later-save-wins, 5.2-second
  stability and browser refresh passed. Original `This is a test.ere` restored.
- First live attempt exposed the mounted-router observer bug and restored its
  temporary edit. Successful follow-up versions 3/4/5 had response times
  2253/1307/2015 ms (last is restoration), not isolated socket benchmarks.
- Staff-to-Trucker assigned-stop refresh passed without navigation/full-page
  reload: 4663 ms from initiating the edit through authorized response arrival.
  Restored again afterward. Final DR 333 version 7; sibling DR 111 remained
  `This is a test.`, version 0. Other tested fields stayed unchanged. Audit/version
  footprints were retained, not erased. No production deletion/upload/status test.
- Real Trucker JWT accepted; forged ADMIN room request rejected; management GET
  returned 403. Live logout cleared socket/presence/app-session. No endless loader.
  Observed assigned-trip reads were 30 seconds apart (normal recovery), not a
  rapid mount/request loop. POD/driver-update publication gaps mean this fallback
  has intentionally not been removed.
- Isolated browser: actual Socket.IO transport + real editors, synthetic Auth and
  in-memory persistence; presence, conflict, draft, last save, five seconds,
  reconnect and logout passed with no page errors. Two fixture-only failures were
  corrected: importing a second Vite timestamped module instance, and reusing an
  unchanged test value across runs. Neither was a persisted business-data bug.
- Existing persistence browser fixture passed (two writes, failed canonical
  confirmation retains draft, sibling rows untouched). Trucker StrictMode fixture
  passed (one initial read, one failed refresh, one successful retry; rows retained).

### Verification commands and outcomes

- Backend: frontend's installed Node 24 + `--import tsx --test tests/*.test.ts`:
  **117 passed**; TypeScript `node_modules/typescript/bin/tsc`: passed.
- Frontend: `TSX_TSCONFIG_PATH=tsconfig.app.json`, Node + backend tsx loader,
  `--test tests/*.test.ts tests/*.test.tsx`: **59 passed**. Raw strip-types was an
  unsuitable runner (extensionless imports); rerun with tsx passed. Missing
  TSX config on an earlier attempt used classic JSX; proper config passed.
- Frontend TypeScript + Vite build: passed; existing >500 kB chunk warning remains.
  A locked native dependency initially blocked install/build; completed the lockfile
  installation after stopping only this repo's Vite process, then restarted Vite.
- Targeted frontend/backend ESLint: passed for collaboration sources, report grid,
  Trucker and API/services. AuthContext separately has the **same baseline five
  errors and one warning**, confirmed with HEAD piped through ESLint; not suppressed.
- Staged and unstaged `git diff --check`: passed. Final status retained all prior
  modified/untracked work. No production destructive tests, commit or push.
  Owned browser fixture process and disposable PG18 cluster stopped after tests;
  fixture databases retained. Unused isolated login contexts closed. Normal
  backend/frontend development servers retained. `.env.example` is ignored by the
  existing repository rules; deployable configuration guidance is also recorded
  in `docs/collaboration-realtime.md`.
- Existing mocked preload measurement in the suite: 23 initial requests, max
  concurrency 4, 167 ms warmup, zero additional cached navigation requests. This
  synthetic timing is not a production performance claim.

### Realtime coverage matrix

| Module | Authority / event / roles | Draft and recovery | Evidence / remaining |
| --- | --- | --- | --- |
| Trips and five standard report grids | six physical sources; cell:committed/table:invalidated; ADMIN/STAFF table presence | row versions, canonical targeted patches, notices, draft-deferred structural refresh; reconnect/recovery | two real ADMINs and synthetic ADMIN/STAFF; dispatch verified, all-field audit remains |
| Trucker assignments/status | protected assigned-trip API; own trip/user room; trucker:changed | retained cache/drafts, coalesced refresh; existing 30s recovery | real assigned-stop signal, restricted rooms/403/logout; no real status/assignment mutation |
| Operations/Offload | existing physical sources and secure Supabase signals | previous cache/deferred grid refresh/deletion safeguards | presence/ordered commit extension not implemented yet |
| Transmittal/flexible cells | existing authoritative flex CAS + change signals | existing draft gates and bounded pages | new Socket presence/format events not yet wired |
| Shared widths | existing revisioned DB storage/change signals | existing drag deferral/persistence | preserved, no new live width mutation |
| POD/Requests | existing protected APIs/sources | existing behavior retained | pod_records lacks service_role SELECT and is unpublished; driver_trip_updates also unpublished; approval workflow remains |
| GPS/dashboard | existing authorized trip_events/milestone route | existing signals/map behavior | lightweight socket pin-only delivery remains |
| Users/lookups/notifications | existing secure Supabase signals/protected APIs | previous caches/reconnect | not replaced by broad Socket rooms |

### Files in this checkpoint (prior files preserved)

- Backend: `.env.example`, package manifests/locks; `src/app.ts`, `src/server.ts`,
  `src/routes/realtime.routes.ts`, `src/services/assignment.service.ts`,
  `src/services/trip.service.ts`; new `collaboration.logic.ts`,
  `collaboration-auth.service.ts`, `collaboration-events.ts`,
  `collaboration-record.service.ts`, `collaboration-server.ts`.
- Frontend: package manifests/lock; `ReportDataView.tsx`, `AuthContext.tsx`,
  `DriverPortal.tsx`, `api.service.ts`, `trucker.service.ts`; new
  `services/collaboration.service.ts`, `components/admin/useSpreadsheetCollaboration.tsx`.
- Tests: new backend `collaboration-{auth,events,record,socket}.test.ts`, version
  fixture schema/assertions/concurrency script and local browser server; frontend
  `collaboration.test.ts`, `collaboration.browser.js`. Fixture README updated.
- SQL: exact approved migration above, unchanged hash. Docs: this progress file
  and `docs/collaboration-realtime.md`. Existing browser logs/snapshots retained.

### Exact next resume point / blockers

1. Preserve the applied version migration and existing permanent deletion code.
   Do not rerun it or the earlier Store Calling/Tracker/deletion migrations.
2. POD notifications require a reviewed least-privilege approach: live catalog
   confirms `pod_records` lacks service_role SELECT and publication membership;
   `driver_trip_updates` is unpublished. Do not broaden grants or publications
   without exact SQL and explicit approval. Requests-integrated approval itself
   is not yet implemented. GPS pin-only events remain separate work.
3. Test a real STAFF role, token refresh/revocation, assignment/status changes and
   actual Redis multi-instance delivery using approved isolated records/accounts.
   No Redis deployment credential/config was supplied; adapter is implemented but
   only single-instance transport has been verified.
4. Extend versioned presence/commit handling to Operations/Tracker/flexible grids
   without weakening existing CAS. Finish shared formatting synchronization.
5. Then Trip Details URL/actions/cache, OCR + approved AI stage, hourly road routes,
   Requests POD approval, secure temporary passwords, Operations pagination and
   remaining shared UI/performance tasks from the expanded request. Do not claim
   those independent tasks complete because Socket.IO connects.

## Phase 2B.5-C checkpoint — Shared Design / Cache-First (October 16, 2026)

### Completed implementation

- Extended existing company-wide width storage with per-column JSON appearance
  metadata, strict styles-only validation, ADMIN/STAFF endpoints and revision CAS.
  Existing width writes preserve design, and design writes preserve widths.
  Conflicts retain optimistic drafts with a Retry action; no false save success.
- Trips/standard reports: shared order, visibility, left/right pins, column colors
  and physical-row cell formatting, including safe font size/family/italic.
  Tracker: shared column settings and existing bold/text/background cell styles.
  Operations: shared existing column settings. Management: shared visibility and
  existing shared widths. Flexible Tables retain existing DB column settings.
  Personal legacy browser settings are fallback only and are not silently promoted
  into company-wide defaults. Unsupported management font controls were not added.
- Successful layout commits emit metadata through Socket.IO. Existing secure
  Supabase topic signals bridge all current admin topics into the management room
  and the same topic/revision deduplicator used by direct signals and recovery.
  Trucker rooms do not receive management payloads. Existing cell commit/presence,
  permanent deletion, cleanup, row identity and authorization paths are preserved.
- Deferred design application preserves active cell/modal drafts, resizing and
  existing scroll/pinned behavior. Unified search replaces separate row/column
  inputs in Trips, standard reports, Operations, Tracker and Users. Columns can be
  found/revealed/highlighted without filtering rows; Rows executes existing search.
  Tracker and standard report search remain server-side. Operations search still
  uses its bounded overview; true Operations pagination is unfinished.
- Fixed an exposed Tracker search issue: the existing generic draft gate treated
  focused search as an active business editor and blocked Enter-triggered reads.
  Only the unified search is refresh-safe; cell/modal inputs remain protected.
- Trip Details now renders a token/trip-scoped composed snapshot immediately and
  revalidates through existing deduplicated API caches. Failed refreshes retain
  valid sections and offer retry; 403/404 evicts inaccessible detail. Snapshots
  are bounded to 20 and discarded on logout/session generation changes.
  Booking/capacity enrichment reuses existing caches. Users lists/details reuse
  token-scoped caches; user writes and profile signals invalidate related keys.
  Same-token role changes also clear authorization-dependent caches.

### Database: approved and applied, not pending

Project reference: `hdmknewarynwpbrhfgai`. Supabase MCP initially required
reauthentication; no migration was attempted until access was restored. Re-read
both exact files and rechecked approved hashes before applying each once:

| Applied version | File under backend/migrations | SHA-256 |
| --- | --- | --- |
| 20261016121840 | 2026_10_27_proposed_shared_table_design.sql | F8F3142EA55DDE8F2AB59CE456EADCFFFFB96D60B73C01D06B7D9E4D39BCA077 |
| 20261016121852 | 2026_10_28_proposed_pod_view_service_read.sql | 7168DC7E7D7AE6ABFAD8361F348E8577A1153223FD6F6E157F83C0F51DDFE25D |

Supabase confirmed both successful and migration history contains both versions.
Before/after schema verification: four layout rows; width/revision digest remained
`44c512bdc937b51da3cee06c783b2ef2` before browser tests. New design JSONB is NOT NULL,
default `{}`, object-only and <=262144 bytes. Existing widths/revisions were not
backfilled or rewritten. Existing RLS, policies, indexes and publications remain.
POD view SELECT changed false -> true for service_role only. Base POD tables and
anon/authenticated view grants stayed false. Protected live POD API returned
success with zero rows. This repairs backend read access, not POD approval.

Both exact migrations passed an owned disposable PostgreSQL 18 fixture database
`shared_design_2478f32bc9fe4cbdb8beebc9fcf78c7c` on port 55439. Fixture checks covered
existing width/revision preservation, invalid JSON rejection, rollback and
service-only view reads without base/browser grants. No existing database reset.

### Realtime coverage audit

| Area | Authority / write API / cache targets | Socket and durable source | Roles / drafts / evidence |
| --- | --- | --- | --- |
| Trips and standard reports | trips/stops/items/assignments/store_calls/billings; existing scoped trip/report APIs; /trips, report-page caches | existing versioned cell commits/presence plus topic signals | ADMIN/STAFF; active drafts deferred; prior real persistence and current real formatting tests |
| Shared report design | shared_table_column_widths; /table-layouts; token/table design+width stores | table:layout-updated + shared_table_column_widths signal | ADMIN/STAFF only; revision CAS and drag/edit deferral; real two-ADMIN bold/font/draft/refresh test |
| Operations/Offload | loading/unloading/backloads/offloads/items/receipts; operations APIs/cache | metadata topic bridge + existing direct/recovery feed | ADMIN/STAFF; existing draft gate/deletion guards; isolated browser regression; versioned presence extension remains |
| Transmittal | stop-linked flex cells/POD; Tracker page/cell APIs; paginated Tracker cache | flex/POD topic bridge + existing CAS | ADMIN/STAFF; draft/page gates; isolated server-search, reference export and page selection tests |
| Users/Trucks/assignments/lookups | profiles/drivers/trucks/assignments; protected management APIs; /users, /truckers, /lookups | corresponding existing topic signals bridged to Socket | authorized management only; existing modal drafts retained; management browser fixture |
| Dashboard/Trip Details | trip/event/assignment/operational APIs; dashboard and trip snapshot keys | existing trip commits + relevant topic invalidation | Admin/Staff; detail drafts gated; isolated cache/failure/403 test; no new route URL yet |
| POD/Requests | POD/drive files/driver updates; existing protected views/APIs | existing metadata signals; no direct private-table publication | view read fixed; approval transactions and Trucker approval notifications remain unfinished |
| Trucker portal | assigned trips/events; assigned-trip/status APIs/cache | existing authorized trip/user events and recovery | own assignments only; prior real role-restriction tests preserved; no new real status/POD writes this checkpoint |
| Notifications/Flexible Tables | admin_notifications and flex sources; existing protected APIs/caches | existing topic signals now Socket-bridged | existing roles/CAS preserved; no new real notification/flex mutations tested |

Socket reconnect refreshes active design; existing recovery metadata feed handles
missed durable events. Logout removes listeners and clears session stores. Real
Redis cross-instance deployment and token-revocation tests are still unverified.

### Test evidence and measurements

- Backend suite: 119 passed; backend TypeScript build passed.
- Frontend suite: 62 passed, using TSX_TSCONFIG_PATH=tsconfig.app.json and tsx.
  Frontend TypeScript/Vite build passed; existing >500 kB bundle warning remains.
- Targeted lint passed for new design/services, report grid, Operations, Users,
  Trip Details, shared hooks and backend production changes. AuthContext and
  Tracker retain exactly the HEAD baseline: AuthContext five errors/one warning
  (mixed exports, effect state, caught-error cause, hook dependency); Tracker two
  errors (control-character regex and effect state). No broad suppression.
- Isolated real-browser components + actual Socket.IO: shared bold/font size,
  refresh persistence, active draft deferral and unified search passed (2 design
  writes, 0 business writes, 4 report reads). Synthetic roles/in-memory persistence.
- Operations browser: skeleton, conditional toolbar, edit/cancel, exact-ID delete,
  protected failure, cleanup retry, filter/selection and resize persistence passed.
  All deletion requests intercepted; no production reports deleted.
- Management browser: Users hidden-column finder, width restore, one persistence
  after master-table drag, flexible hidden reveal passed (5 fixture width writes).
- Tracker browser: page-scoped selection, modal draft navigation guard, cached
  previous page (0 extra requests), server search, all 54 reference records across
  pages and independent reference lookup passed. Synthetic timings: initial 885 ms,
  cached navigation 785 ms, 6 bounded page requests including sheet operations.
- Trip Details browser: initial skeleton, fresh cached revisit (0 extra requests),
  transient failure retention and forbidden-data eviction passed. Seven initial
  synthetic API reads; map and receipt-review children stubbed. This does not
  verify map/OCR/receipt network behavior or direct URL routing.
- Two real different ADMIN accounts: bold propagated in 5824 ms including API/DB
  and refetch, persisted through refresh. Remote font size did not erase an
  unsaved draft; Escape applied deferred style. Only the approved DR 333 test
  stop's appearance changed and was restored through the authorized API. Dispatch
  remained unchanged, width 178, style cells empty; revision advanced 3 -> 8.
- Latest mocked preload measurement: 23 initial requests, max concurrency 4,
  361 ms warmup, 0 added cached-navigation requests. Synthetic, not production
  latency. Login/whole-application performance has not been benchmarked live.
- Final isolated persistence browser regression passed: delayed confirmation,
  sibling isolation, missing canonical value rejected, failed draft retained,
  Escape cancel (2 intercepted writes). Trucker StrictMode regression passed:
  1 initial request, retained content on failure, successful retry (3 total).
  Permanent transaction deletion regression passed: cancel, protected failure,
  exact stop, sibling survival and cleanup retry (2 intercepted deletion requests).
  No production deletions were performed.
- Both Git diff checks passed. Owned disposable PostgreSQL cluster was stopped
  after checking its exact data_directory; fixture databases retained. Existing
  development servers and real signed-in test tabs were retained. Browser fixture
  port 5199 was no longer running after the pause. No commit or push.
- Fixture failures corrected: obsolete search selectors, isolated login shell
  navigation, missing Vite preamble, dynamic module identity and expected generic
  500-error text. No diagnostics were suppressed to make tests pass.

### Files changed in this checkpoint

- Backend: routes/table-layout.routes.ts; services/collaboration-events.ts,
  collaboration-server.ts; new table-design.logic.ts and table-design.service.ts.
- Frontend components/admin: ColumnFinder, OperationsReportsView, ReportDataView,
  ReportSpreadsheetShared, ReportSpreadsheetUtils, TransmittalTrackerView,
  useDeferredRealtimeRefresh, useManagementTableColumns, useSharedTableWidths;
  new useSharedTableDesign. Context: AuthContext. Admin views: TripDetailView,
  TruckersView. Services: api, collaboration, realtime, shared-table-widths,
  trucker, user-management; new shared-table-design.
- Tests: backend table-design.test.ts, collaboration-socket.test.ts and local
  collaboration-browser-server; four SQL fixture files for design/POD checks.
  Frontend shared-design.test.ts, shared-design.browser.js,
  trip-detail-cache.browser.js and updated Operations/Tracker/management fixtures.
- SQL: the two approved exact migration files above. Docs: this progress document
  and collaboration-realtime.md. Existing browser logs are preserved.

### Exact next resume point

1. Preserve both newly applied migrations; do not repeat them. Finish the remaining
   full shared-design control coverage: management order/pins/fonts where a safe
   editor exists, and flexible-table formatting harmonization. No claim that all
   application formatting features are complete.
2. Real STAFF-role formatting, remote resize during dragging, reconnect/token
   revocation, two-instance Redis and cross-session POD/status writes still need
   approved accounts/fixtures. Prior Trucker role restrictions remain intact.
3. True Operations server pagination is still pending; existing overview has read
   budget safeguards. Tracker server pagination and bounded export remain complete.
4. Next feature phase: Trip Details URL/actions/layout, OCR plus approved AI stage,
   hourly road routing, Requests-integrated POD approval/notifications, temporary
   password enforcement and remaining global UI requirements. Prepare exact SQL
   and obtain fresh approval for any new live database change.
5. No production business data deletion or test record creation; no commit/push.

## Phase 2B.5-D.1 checkpoint — Viewer presence, Users and time cells (October 17, 2026)

This is a partial Phase D checkpoint. Operations server pagination and the
remaining management-table design controls are NOT complete.

### Implemented

- Removed the visible “Live collaboration” status from the report toolbar.
  Cell presence, persistence confirmation, conflict notices, Socket.IO and durable
  Supabase invalidation remain. Removed font-family/size selectors; saved font
  metadata and rendering remain unchanged. Bold, italic, underline and colors
  remain supported; underline has an explicit toggle in standard report grids.
- Added the shared `TableViewers` control immediately left of unified search.
  Trips, standard reports, Operations, Tracker and common management toolbars use
  it. Three overlapping avatars, initial/image-error fallback, +N, full-name
  popover, outside click and Escape are supported. The current user is included.
- Viewer presence is separate from cell selection/conflict state. Existing
  authenticated Socket.IO rooms carry metadata only: table and user ID, display
  name, avatar URL and color. No draft text, email, role or profile payload is
  broadcast. Existing private profile-picture signing is reused at connection
  authentication, not on every heartbeat/session check.
- Backend room allowlist enforces Admin/Staff access. Admin/Staff profiles tab
  remains ADMIN-only; flexible table joins use the existing getTableAccess(view)
  permission check and are rechecked during session validation. Unknown rooms and
  Trucker table-room requests are denied. No new database tables/grants/policies.
- Roster aggregation uses adapter fetchSockets, so multiple tabs for the same
  profile count once and Redis-backed instances can share membership. Join/leave,
  disconnect and heartbeats update rosters; silent viewers expire after 45 seconds.
  Expired active clients rejoin through the same authorization check. Socket.IO
  transport recovery remains; server-initiated disconnects retry once after 1.5s
  with the current credentials. Logout cancels that retry. Invalid credentials
  still fail server authentication; this does not bypass midnight/single-device
  session policies. Actual multi-instance Redis delivery remains unverified.
- Users table remounts across account/token/role boundaries, retains token-scoped
  search/category/status/assignment/page preferences, and displays cached empty
  results without briefly replacing them with skeleton rows. Existing cached
  lists/details and mutation/Realtime invalidation are reused. Refresh failures
  retain visible data. No new user-data cache or business write endpoint.
- Four milestone columns display time only, in Asia/Manila, e.g. `8:05 AM` and
  `11:45 PM`, including report Excel export. Existing editable unloading cells use
  time inputs for populated timestamps, preserving each event's calendar date,
  seconds and milliseconds. Blank timestamps require an explicit Manila date/time;
  no “today” default is invented. Enter/blur, Escape, canonical confirmation and
  exact stop ownership are preserved. Loading milestones currently remain
  read-only in Trips/standard grids because no safe report-cell write mapping was
  present; their existing Operations update forms remain available. Finishing a
  loading-cell mapping is explicitly outstanding, not silently routed to a stop.
- Added protected `/trips/:tripId` route and optional `?stop=<id>` context. Existing
  table/details callbacks navigate by physical trip ID. Browser history derives
  the selected trip from URL parameters; local main-section state no longer
  retains a detail ID after Back. No transient state is required for direct links.
- Trip Details renders authorized core trip data before optional enrichment,
  retains cached sections while refreshing and uses bounded 20-second read
  timeouts for its core/child/operational/booking reads. Existing cached detail,
  forbidden-data eviction and error/retry behavior remain. This changes no write
  timeout or mutation semantics.

### Live inspection and database safety

Read-only Supabase metadata confirmed loading_reports.loading_start_at and
loading_finished_at, and trip_stops.start_unloading_time/finish_unloading_time,
are timestamptz. Profiles already has profile_picture_path. loading_reports,
trip_stops and admin_change_signals are published; layout invalidation continues
through the existing secure signal bridge. No SQL, migration, grant, RLS,
publication, Storage-object or operational-record mutation was performed.
Existing approved/applied Phase C migrations were not repeated.

### Verification

- Backend full suite: 121 passed; TypeScript build passed.
- Frontend full suite: 65 passed; TypeScript and Vite production build passed.
  Existing >500 kB bundle warning remains.
- Targeted lint passes for new/changed viewer/auth/socket/time/Users/report code.
  HEAD comparison confirms existing baseline errors in DashboardPage (2 effect
  state), ResourceView (1 effect state), flexible-table.service (4 explicit any).
  Previously documented AuthContext/Tracker baseline issues remain; none suppressed.
- Actual Socket.IO transport tests: Admin/Staff authorization, self inclusion,
  table separation, multi-tab deduplication, unknown/Trucker denial, disconnect
  cleanup, and silent-member expiry with an active heartbeat passed.
- Isolated browser viewer test passed: synthetic Admin and Staff, self/name
  popover, switching tables, same-user extra tab, refresh, disconnect/reconnect and
  forced server disconnect recovery. No production data calls/writes.
- Avatar SSR test covers three circles/+2 overflow, initial fallback and image
  rendering. Live roster showed two different authenticated ADMIN profiles, one
  signed profile image and one initial fallback; leaving/rejoining Trips updated
  the other session. The user described the sessions as having the same Admin
  permissions; a real distinct STAFF role was not verified. A live full reload
  stalled in data loading, so it is not reported as passing authenticated E2E.
- Users isolated browser: 3 initial data reads, 0 additional reads on cached
  navigation, search retained. Existing cache/session/invalidation unit tests pass.
- Time isolated browser: actual editor, one intercepted exact-stop write,
  `11:45 PM` -> `11:50 PM`, original date/seconds retained, midnight-crossing finish
  unchanged, sibling stop untouched. Unit tests cover null, noon/midnight, invalid
  times/dates and explicit dates for empty values. No production timestamp edits.
- Actual App/router + dashboard navigation with isolated auth/content APIs:
  trip URL, stop context, Back/Forward and direct refresh passed. Trip Details
  cache fixture separately passed initial skeleton, cached navigation (0 extra
  reads), refresh-failure retention and forbidden eviction. Production hosting
  must still provide SPA fallback for direct URL refresh.
- Operations delete/selection/cleanup/resize, Tracker pagination/reference sheets,
  management sizing/finder and shared bold/italic/draft fixtures passed.
  Synthetic preload measurement: 23 initial requests, max concurrency 4, 734ms
  warmup, 0 additional cached navigation reads. Not a production benchmark.
- Browser harness now uses a genuine Vite-served tests/table-fixture.html rather
  than rewriting the Login document. Synthetic document navigation stalled its
  WebSocket opening; serving the actual fixture resolved it. Added explicit CSS
  import/visible handle positioning to the Operations resize fixture. These were
  test-harness fixes, not masked persistence failures. The local Vite server was
  restarted with --force; no source/worktree reset or data cleanup.

### Files changed

- Backend services: collaboration-auth.service.ts, collaboration.logic.ts,
  collaboration-server.ts; flexible-table.service.ts exports its existing access
  checker. Tests: table-viewers.test.ts and collaboration-browser-server fixture.
- Frontend: App.tsx; DashboardPage.tsx; ResourceView.tsx; TruckersView.tsx;
  TripDetailView.tsx; shared ColumnFinder/TableViewers/ReportSpreadsheetShared;
  ReportDataView, OperationsReportsView, TransmittalTrackerView,
  useManagementTableColumns; collaboration, trip-time, trip and operations-report
  services. Existing font metadata and physical write mappings retained.
- Tests: new table-viewers, users-cache, trip-time and trip-route browser fixtures;
  viewer/time unit tests; reusable table-fixture.html; updated existing Operations,
  management, Tracker, Trip Details cache and shared-design browser fixtures.
  Existing browser logs and all prior work remain. No commit/push.

### Exact next resume point

1. Finish safe Loading Start/Finish cell editing at loading_reports identity;
   preserve its trip-shared ownership and require canonical write confirmation.
   No stop-specific loading field or arbitrary report record fallback.
2. Implement true Operations server pagination/search/sort/filter and bounded
   export. Existing overview/read-budget safeguards are not pagination. Inspect
   source joins and prepare any exact SQL proposal for explicit approval before
   application. No proposal has been applied for this work.
3. Finish remaining management order/pin/design synchronization where valid
   controls exist, preserving Flexible Table permissions and existing shared data.
4. Recheck authenticated live Trip Details loading after the bounded-read/core
   rendering change, direct-link deployment fallback, real STAFF viewer access,
   flex-permission revocation and real Redis multi-instance presence. Do not use
   production business writes for those tests without separate authorization.
5. Preserve deletion, image cleanup, caches and all applied migrations. Remaining
   expanded OCR/Mapbox/POD/UI work from earlier phases is not claimed complete.


## Phase D.2 ? Loading milestone editing checkpoint (October 17, 2026)

### Completed

- Trips/Combined, Dispatch Monitoring and Dispatch report cells now resolve
  Loading Start/Finish to `loading_reports.id` plus its exact `trip_id`.
  Page enrichment adds `loading_report_id` in the existing bounded trip-ID
  batches. A report without a Loading Report remains valid; these cells do not
  create a missing report or guess an ID.
- New management-only `PATCH /reports/operations/loading/:tripId/reports/:recordId`
  reuses the existing Loading API validation, assignment/conversion protections
  and canonical response. An expected ID mismatch/missing report returns 409
  before insertion/update. UPDATE predicates include both report and trip IDs.
  Existing Trucker PUT/create behavior is preserved.
- Both cells use the existing inline time editor, Enter/blur save, Escape cancel,
  saving/error feedback and canonical confirmation. Manila AM/PM display and
  export use the D.1 formatter. Populated timestamps retain their own calendar
  date, seconds and milliseconds; a null timestamp needs an explicit Manila
  date/time. No implicit midnight rollover or guessed date is introduced.
- Loading is trip-shared by the live UNIQUE(trip_id) contract. Editing it updates
  displayed siblings of that same Loading Report, not any trip_stop timestamps.
  Unloading continues to target the exact physical stop.
- Added loading_reports to the three enriched reports' Realtime dependencies.
  Existing secure change signals invalidate their cache and defer refresh during
  active drafts. Loading reports do not have an approved per-record collaboration
  version; no fabricated version/presence identity was added for these cells.
  Table-viewer presence and other versioned cell collaboration remain intact.

### Live read-only evidence / database actions

- Connected schema: loading_reports has primary key id, UNIQUE(trip_id), and
  timestamptz loading_start_at/loading_finished_at. trip_stops retains its own
  unloading timestamps. Both tables have RLS enabled and service_role SELECT and
  UPDATE privileges. loading_reports, trip_stops and admin_change_signals are
  published; loading_reports has the admin change signal trigger and the
  converted-source immutable trigger.
- No SQL writes, migration, grant, RLS/publication change, or production business
  record edit was performed. No additional Supabase action is required for this
  loading milestone checkpoint. Existing applied migrations were not repeated.
- Catalog inspection found no Operations pagination projection. The current
  overview still collects source tables with readPaged, then builds event_rows;
  the component filters/sorts those rows locally. This remains unfinished, not
  server pagination. Legacy vw_* service-read restrictions remain unchanged.

### Verification

- Backend suite: 121 passing; TypeScript build passes.
- Frontend suite: 67 passing; TypeScript and Vite production build pass. Existing
  >500kB chunk warning remains.
- Targeted frontend/controller/route ESLint passes. Including the two touched
  backend services reports 18 errors (16 operations-report.service, 2 report.service).
  Running identical lint against git HEAD confirms the same 18 baseline errors;
  no new lint diagnostics were introduced. They were not suppressed/refactored.
- Isolated actual-editor loading browser: exact report PATCH, same-report sibling
  reconciliation, explicit blank date, midnight finish, seconds retained, Enter
  and blur, Escape, simulated failed-save draft retention, simulated Realtime
  draft deferral, five-second persistence and reload pass. Three intercepted
  attempts (two successes, one deliberately failed); zero production writes.
- Existing unloading browser passes: one exact-stop intercepted write; date and
  seconds retained and sibling unchanged.
- Existing isolated regressions pass: table viewers (real Socket.IO transport,
  synthetic ADMIN/STAFF, table isolation/multiple tabs/refresh/reconnect), Users
  cache (3 initial reads/0 extra on cached navigation), actual App trip route
  (URL/stop context/Back/Forward/direct refresh), Trip Details cache (7 initial
  reads/0 extra cached navigation; transient-error retention/403 eviction),
  Operations deletion/selection/cleanup/resize, shared design (two fixture writes,
  draft retained), management widths/finder/hidden reveal (5 fixture width writes),
  Tracker pagination/search/reference sheet. Tracker fixture measured 1007ms
  initial/406ms cached navigation, 0 cached-return requests; these are isolated
  fixture measurements, not production benchmarks.
- Both controlled live browser tabs are currently at Login. Real Admin/Staff
  cross-session timestamp writes and authenticated Trip Details/direct-refresh
  hosting behavior were not verified. No production records were used as tests.
- One initial new browser assertion expected the server's raw 500 text; the API
  intentionally normalizes it. Corrected the fixture to assert the actual message
  and retained draft; rerun passed. A subsequent blur fixture used Tab inside
  the native datetime subfields (which did not leave the input); changed it to
  invoke actual input blur and reran successfully. No production diagnostic was
  suppressed.

### Files changed in this checkpoint (in addition to preserved D.1 work)

- Backend: controllers/operations-report.controller.ts, routes/report.routes.ts,
  services/operations-report.service.ts, services/report.service.ts.
- Frontend: components/admin/ReportDataView.tsx; services/operations-report.service.ts,
  realtime.service.ts, report-editing.config.ts, report-edit-confirmation.ts.
- Tests: backend/tests/operations-report.logic.test.ts and report-edit-persistence.test.ts;
  frontend/tests/report-edit-ownership.test.ts, report-edit-confirmation.test.ts,
  new loading-time.browser.js. Documentation: this file and collaboration-realtime.md.
- Final staged/unstaged diff checks pass; no unmerged index entries. Preserved
  all pre-existing worktree/untracked work, with no staging, commit or push.

### Acceptance and exact next resume point

**Phase 2B.5-D is NOT ready for acceptance.** Loading milestone editing is the
completed tested subphase; the following required work remains:

1. True Operations server pagination: prepare a reviewed additive service-only
   UNION projection/RPC retaining one physical source per row, bounded page
   hydration/export, server search/sort/filter and deterministic source/ID ordering.
   Inspect all consumer/dependency contracts before creating the proposal. Present
   exact SQL, security/data impact and recovery for explicit approval before any
   live application. No Operations migration proposal was applied in this turn.
   Wire page-scoped selection, preload/cache keys, mutation page correction and
   draft-safe refresh only with a verified database contract.
2. Remaining management shared design: the current common hook supports widths
   and visibility, but Users/master fixed markup still needs column-order,
   pin-offset and color rendering/controls. Reuse shared design/CAS; preserve
   Flexible Tables' own definition permissions and font metadata. Do not claim
   existing management resize tests verify these unfinished features.
3. Authenticated ADMIN + STAFF presence/integration, live loading/unloading
   save/reload with separately approved test records, deployment SPA fallback,
   Redis multi-instance and session-revocation verification remain. Local browser
   test accounts must be signed in again; do not request credentials in chat.
4. Preserve all permanent deletion/cleanup, D.1 routing/cache/presence, and applied
   migrations. Expanded earlier OCR/Mapbox/POD/UI tasks remain outside this checkpoint.

## Phase D.3 — Operations pages and management design (October 17, 2026)

### Completed application implementation

- Added ADMIN/STAFF-only `GET /reports/operations/page`, strict page/search/type/
  sort validation, limit <=100, one exact count, database range and deterministic
  physical source/ID ordering. The proposed read projection covers Loading,
  Unloading, Backload and Offload without multiplying assignments or items.
- Hydration reads only selected physical reports and page-related trip context;
  it does not download every report and slice/filter it in Node or the browser.
  Missing projection returns an explicit configuration error, never an unbounded
  fallback. Existing overview, assigned-Trucker and trip-detail APIs remain.
- Added query/token-scoped page cache helpers and preload integration with the
  existing coordinator. With paging enabled, warmup and navigation use the same
  initial page request. Search/type/sort/page-size changes query the dataset in
  PostgreSQL. Cached pages display immediately; refresh retains visible rows.
- Operations UI supports Previous/Next, 25/50/100 sizes, total/page feedback,
  page-scoped selection, safe pending-query selection, draft-gated navigation,
  Realtime refresh and correction after deleting the last row on a page. Existing
  exact-source edits/deletion/cleanup remain. Empty results hide the entire grid.
- **Rollout gate:** VITE_OPERATIONS_PAGINATION defaults OFF until database
  approval/application. Thus live production pagination is NOT yet enabled.
  Existing production overview behavior is retained while awaiting approval.
- Users/Admin/Staff and Trucker lists, master-data tables (including Trucks,
  warehouses, stores, customers and other configured resources), and truck-picture
  tables now render shared order, colors, visibility, widths and left/right pins
  through the existing shared-design/revision service. Header and data cells move
  together with stable keys. Sticky offsets use current visible pinned widths.
  Existing editable fields, row actions and permissions remain unchanged.
- Design/width application pauses during inline editing, open management forms
  and resizing; remote changes apply afterward. Existing conflict feedback/retry
  remains. Column options expose move left/right, pin left/right, unpin and color;
  compact hiding/restoration and unified search remain. No font family/size UI.
- Flexible Tables retain native versioned order and visibility. New colors/pins
  use existing `flex_columns.settings.appearance` through the manage-authorized
  versioned column endpoint. Other settings/metadata are preserved. Widths still
  reuse shared storage. No duplicate configuration table/authority was introduced.
  Existing flex change signals and draft gates provide reconciliation.
- Read-only database explorer/detail sub-tables were not turned into editable
  management spreadsheets. No business values, milestones, deletion safeguards,
  Storage cleanup, auth/RLS or existing exports were changed.

### Supabase inspection and exact approval boundary

- Read-only catalog inspection confirmed all required source/lookup columns;
  all sixteen queried tables have service_role SELECT. Shared-design RLS remains
  enabled. Both proposed object names are absent live. No new base permission
  blocker was found. No live SQL writes, data changes, migration, grant, trigger,
  RLS or publication changes were performed.
- Proposal: `backend/migrations/2026_10_29_proposed_operations_pagination.sql`.
  SHA-256: `DF1E2E00532866F440A710440492F808DBD04F64E66CF1EC7395C46B843ABC84`.
  Adds only `v_operations_report_page` and immutable pure
  `operations_natural_sort_v1(text)` for numeric-aware identifier sorting. New
  objects are readable/executable only by service_role; no existing object or
  business row is altered. Existing report view contracts remain intact.
- Approval package: `docs/operations-pagination-review.md`, including exact
  purpose, security/data impact, compatibility, rollout and DROP recovery SQL.
  The proposal is unapplied. Earlier migration approvals do not cover it.
- Disposable PostgreSQL 18 only: created fixture databases
  operations_page_d3_20261017 and operations_page_d3_20261017_v2 in the established
  isolated cluster. The final proposal compiled and passed assertions with 78
  physical records (75 Offloads), multiple pages, global search/type filters,
  duplicate PRIMARY assignments, stop DR ownership, null/zero handling, conversion
  exclusion, numeric-aware sort and role privileges. service_role could read 78
  rows, anon/authenticated could not. Fixture-only conversion mutation rolled back.
  EXPLAIN ANALYZE final fixture search execution was 3.844ms; not a production
  benchmark or evidence that large-volume production needs no further indexing.

### Verification and measurements

- Backend full suite: 124 passing and TypeScript build passed. New page tests
  verify count/range/allowlists, stable IDs, selection-scoped hydration of 25
  records, role denial and no missing-view overview fallback.
- Frontend full suite: 69 passing; TypeScript and Vite production build passed.
  Existing large-chunk warning remains. New tests cover page cache/query/session
  isolation, in-flight deduplication/invalidation and safe native Flex appearance.
- Targeted lint across changed UI, API, controller/route and new pagination code
  passes. Including operations-report.service.ts reports 16 existing errors;
  linting that file at HEAD confirms the same 16 baseline diagnostics. No new
  errors/warnings were suppressed. Staged/unstaged diff checks pass; no unmerged
  index entries, staging, commit or push.
- Actual-screen Operations pagination browser fixture: 102 records; 13 page reads
  across search, empty, filter, sort, navigation, fixture deletion and Realtime;
  cached back-navigation caused zero additional requests. Last-page deletion
  corrected page 3 to page 2. Active remarks draft survived Realtime, and page
  navigation stayed disabled until cancellation. No production writes.
- Management two-context fixture used actual Socket.IO with synthetic ADMIN/STAFF:
  18 fixture design writes, shared order/colors/visibility/left-right pins, reload,
  active draft and remote-design deferral during resize all passed. Native Flex
  browser passed pin offset/color/navigation persistence, settings preservation
  and manage-only control visibility (2 fixture metadata writes).
- Existing isolated browser regressions pass: Users cache (3 initial reads,
  0 extra cached navigation reads), management widths/finder/hidden reveal (5
  fixture width writes), table-viewer Admin/Staff/multi-tab/table isolation/
  refresh/reconnect, actual trip route/stop/Back/Forward/direct refresh, Trip Details
  cache (7 initial reads, 0 cached-navigation reads, error retention/403 eviction),
  loading and unloading milestone editors, permanent Offload deletion/cleanup,
  shared report formatting and Tracker pagination/reference sheets.
- Tracker fixture measured 1039ms initial/410ms cached navigation, 0 cached-return
  requests. Existing mocked preload run: 23 initial requests, max concurrency 4,
  181ms warmup, 0 extra cached navigation reads. These are isolated fixture timings,
  not actual login/production performance claims.
- Both controlled live tabs show Login. Authenticated Admin/Staff production
  pagination/design verification and deployment SPA fallback remain unverified.
  No operational records or private receipts were modified for testing.
- Browser harness corrections during this checkpoint: exact current accessible
  action labels, explicit unified-search Enter, native summary control, fixture
  modal z-index and table-cell indices. Final scenarios pass without forced
  clicks or suppression of production diagnostics.

### Files changed in D.3 (preserving all D.1/D.2 work)

- Backend: src/services/operations-pagination.ts (new), operations-report.service.ts;
  src/controllers/operations-report.controller.ts; src/routes/report.routes.ts.
- Frontend: components/admin/OperationsReportsView.tsx,
  useManagementTableColumns.tsx, ReportSpreadsheetShared.tsx;
  pages/Admin/views/TruckersView.tsx, MasterDataView.tsx, FlexibleTablesView.tsx;
  services/operations-report.service.ts, flex-column-appearance.ts (new).
- Migration proposal: migrations/2026_10_29_proposed_operations_pagination.sql.
- Tests: backend/tests/operations-pagination.test.ts, operations-page-service.test.ts,
  fixtures/operations-pagination.sql, fixtures/operations-pagination-check.sql;
  frontend/tests/operations-page-cache.test.ts, operations-pagination.browser.js,
  management-design.browser.js, flex-column-appearance.test.ts,
  flex-appearance.browser.js (all new).
- Docs: this checkpoint, collaboration-realtime.md, operations-pagination-review.md.

### Acceptance / exact resume point

**NOT READY for final acceptance:** application implementation and isolated tests
are complete for this checkpoint, but Operations pagination requires explicit
approval/application of the exact proposal and activation/read-only live checks.

1. Wait for explicit approval of the exact Operations SQL/hash. Do not apply it
   or enable the page consumer before approval. On approval, recalculate the hash,
   confirm project/schema, apply once, inspect view/function/grants and read-only
   page/count/search/ordering; then enable VITE_OPERATIONS_PAGINATION and recheck.
2. Sign approved Admin/Staff accounts in locally for authenticated page reads,
   Users/master/native Flex synchronization, presence and Trip Details checks.
   No business or design writes to live client records without explicit test scope.
3. Profile production-sized query costs and authenticated navigation after rollout;
   do not infer them from 78/102-record fixtures. Pagination offsets are bounded
   but count/hydration are separate reads; concurrent changes can temporarily
   shorten a page until Realtime/revalidation. Stable IDs prevent substitutions.
4. Preserve completed milestone editing, deletion/cleanup, auth, migrations and
   report contracts. Expanded OCR/Mapbox/POD tasks from earlier phases remain
   separately documented; this checkpoint does not claim those complete.


## Expanded D checkpoint - Operations activation and OCR review persistence (October 17, 2026)

### Completed in this continuation

- Preserved existing staged/unstaged/untracked work; no index conflicts, commits,
  pushes, production test rows, record deletion or private document processing.
- Recalculated the exact approved Operations SQL SHA-256
  DF1E2E00532866F440A710440492F808DBD04F64E66CF1EC7395C46B843ABC84.
  MCP project hdmknewarynwpbrhfgai matches backend public project hostname;
  source schema/read grants and absent target objects verified before application.
- Supabase confirmed migration **20261017011210 / operations_pagination**.
  Only this approved additive migration was applied. Existing migration versions
  were not repeated. View/helper service-only permissions verified afterward.
- Enabled the existing management page API for normal navigation and preload.
  VITE_OPERATIONS_PAGINATION=false is the explicit compatibility rollback switch;
  default Vite behavior is now bounded. The browser fixture no longer overrides
  the feature flag, so it tests the deployed default. Trucker path unchanged.
- Live read-only projection: 11 distinct physical reports (5 Loading, 6 Unloading),
  no duplicate identities. Actual PostgREST page size 5 returned 5 / total 11.
  Actual backend service pages 1 and 2 returned 5 each; Offload filter and no-match
  search returned true empty counts. These were service-level reads, not signed-in
  browser/authentication verification. No live business values printed/changed.
- Fixed a separate OCR review bug found during intake inspection: both automatic
  scans and human review saves sent expected_version=0. They now send the current
  receipt version, preserving existing backend optimistic concurrency checks.
  Repeated reviewed saves/rescans no longer fail simply because a prior scan exists.
  This is OCR text verification, NOT implementation of POD approval.

### Verification

- Backend suite: 124/124 pass; backend TypeScript build pass.
- Frontend suite: 69/69 pass; frontend TypeScript and Vite production build pass.
  Existing >500 KB chunk warning remains; no performance claim derived from it.
- Targeted lint for page service, new browser tests and page backend modules passes.
  ReceiptReviewCard has 2 baseline React Hooks lint errors; git HEAD comparison
  reproduces both at the same lines. No lint suppressions or unrelated refactor.
- Disposable PostgreSQL 18: exact approved migration compiled on 128 fixture
  reports (125 Offloads). Count/identity/filter/search/natural sorting/conversion
  exclusion/service grants pass, including offset 125 returning 3 records.
  EXPLAIN fixture search execution 5.470 ms, not production-volume performance.
- Actual-screen browser pagination: 102 fixture reports, 13 page reads across the
  scenario, 0 cached-return reads; cross-page search/filter/sort, selection clearing,
  last-page correction and draft-safe Realtime pass with the real default flag.
- New receipt-review browser: expected versions [3,4,5,6,7], repeated corrections,
  rescan, five-second persistence, reload, failed/conflicting save retains draft
  and never falsely shows Saved. API and OCR are isolated mocks; zero real uploads.
- Loading milestone browser: correct physical report, shared loading ownership,
  midnight/date/seconds preservation, explicit blank date, blur/Enter/Escape,
  failure retention, Realtime draft gating, five seconds and reload pass.
- Unloading milestone browser: exact stop, sibling preservation and midnight pass.
- Actual router fixture: physical trip URL, stop context, Back/Forward/direct
  refresh pass. Deployment hosting fallback remains a manual check.
- Both controlled live application tabs are at Login. No real independent-session
  verification claimed in this checkpoint. Existing D.1/D.2 evidence remains above.

### Database/provider findings and pending work

- See docs/pod-tracking-integration-review.md for actual source/Storage/permission
  inspection, manual acceptance checklist and approval boundaries.
- Live POD rows 0; trip receipt rows 8, all with stop IDs. No document contents read.
- Physical pod_records service_role SELECT/INSERT/UPDATE/DELETE are all absent.
  Prepared ONLY read grant proposal 2026_10_30_proposed_pod_service_read.sql,
  SHA-256 274EBDDD03A6E8E936E0EB68A7FBB647981CF42FEE5144B7754125518726DD0D.
  NOT APPLIED. Disposable service/browser/RLS scope tests passed.
- POD approval/rejection audit/history, transactional linked updates and trucker
  notifications remain unimplemented. Current notification CHECK allows only
  report_mention. Existing OCR review must not impersonate approval.
- Existing private trip-images bucket accepts 5 MB JPEG/PNG/WebP only; PDF support
  requires separate approved bucket/schema/API/OCR rendering work.
- User selected Gemini as interpretation provider. Backend key/model not configured;
  requested local GEMINI_API_KEY/GEMINI_MODEL without secrets in chat. No AI request
  or external document transmission performed. Strict structured extraction and
  exact stop evidence matching are the next implementation checkpoint.
- Existing Mapbox raster map/GPS event collection preserved. Explicit opt-in
  continuous tracking, accuracy/capture ordering, hourly Directions/cache, independent
  pin broadcasts and 10-road-route verification remain unimplemented. No new
  tracking schema or Realtime publication approved/applied.

### Files changed in this continuation (previous work preserved)

- Frontend: services/operations-report.service.ts; components/admin/ReceiptReviewCard.tsx.
- Tests: frontend/tests/operations-pagination.browser.js;
  frontend/tests/receipt-review.browser.js (new);
  backend/tests/fixtures/operations-pagination.sql;
  backend/tests/fixtures/operations-pagination-check.sql.
- Proposal: backend/migrations/2026_10_30_proposed_pod_service_read.sql (new, pending).
  Applied 2026_10_29_proposed_operations_pagination.sql bytes remain unchanged.
- Docs: this progress file; collaboration-realtime.md;
  operations-pagination-review.md; pod-tracking-integration-review.md (new).

### Acceptance and exact resume point

**Expanded Phase D is NOT ready for final acceptance.** Operations activation and
OCR version fix form the tested checkpoint; do not repeat the applied migration.

1. Confirm configured Gemini backend key/model without printing secrets; implement
   bounded, schema-validated extraction using retained Tesseract text, no automatic
   operational updates or approval. Preserve raw text and explicit confidence/evidence.
2. Complete exact document/stop match and review consumer design, then propose minimal
   extraction/approval/history/notification SQL with rollback and disposable tests.
   Obtain explicit approval before live DDL, grants, bucket or publication changes.
3. Optional physical POD read proposal above remains pending; it alone cannot enable
   approval writes or alter existing lifecycle values. Do not grant broad browser access.
4. Implement idempotent approval/rejection + trucker feedback, then PDF intake and
   opt-in GPS/Directions integration, each in coherent tested approved-schema stages.
5. Re-run independent signed-in acceptance when approved accounts are locally available;
   do not create production fixtures or process client documents as tests.


### Final checkpoint verification addendum

- Re-ran the frontend unit suite after final source changes: 69/69 pass.
- Users browser: 3 initial reads, 0 cached-navigation reads, search preserved.
- Trip Details browser: 7 initial requests, 0 cached-navigation requests;
  initial skeleton, transient-error retention and forbidden-data eviction pass.
- Operations legacy regression fixture: skeleton, conditional actions, finder,
  Edit, cancellation, exact physical-ID deletion, selection reset, protected
  historical error, pending image cleanup/retry and width persistence pass.
- These last three browser checks initially failed because the existing Vite
  listener exited (ERR_CONNECTION_REFUSED). Confirmed port was closed, restarted
  Vite on 5173, then all three passed. No application workaround or forced clicks.
- Both diff checks pass; no unmerged index entries. Only CRLF normalization
  warnings on existing browser logs/fixture remain. Disposable PostgreSQL cluster
  stopped cleanly; isolated fixture database retained for reproducibility.
- No additional live migration beyond 20261017011210 was applied. The POD read
  proposal and broader schema/provider integration remain pending as stated above.


## D.4 Gemini configuration and provisional interpretation checkpoint (October 17, 2026)

### Completed

- Preserved worktree, existing Tesseract, reviewed OCR, deletion workflows and D.1-D.3.
- Privately moved existing GEMINI_API_KEY from frontend/.env to backend/.env and set
  GEMINI_MODEL=gemini-2.5-flash. Removed frontend Gemini entries; no VITE key introduced.
  Both credential files are ignored/untracked. .env.example exception exposes only
  the new placeholder template. No credential values logged, staged or committed.
- Checked exact key privately against tracked files, reachable Git objects and
  existing/fresh client builds: no match. Fresh build scan covered 34 files.
- Implemented protected backend POST receipt interpretation endpoint; ADMIN/STAFF
  only, exact physical trip/receipt/active stop, explicit external-text consent and
  optimistic receipt version. No AI requests on scan/load or background refresh.
- Gemini 2.5 Flash structured JSON, strict nullable/evidence/uncertainty validation,
  missing/unsupported fields retained as null, quantity zero preserved. No model
  response accepted as approval or an operational write.
- Added bounded in-memory caching and in-flight deduplication, per-actor cost limits,
  global-per-process concurrency 2, timeout/input/response limits, sanitized billing,
  rate-limit and provider failures. No automatic retry loops.
- Matching uses current linked trip transaction context, dispatch/DR and names;
  ambiguous/conflicting IDs or a suggested different stop require review. No
  reassociation or sibling updates. SO/date matching/global trip discovery pending.
- UI explicit confirmation before sending only saved original OCR text to Gemini;
  separate suggestions/evidence, explicit use of supported draft fields, no autosave.
  Manual review remains usable on provider failure. Account/trip/version scope protects
  stale interpretation responses. Existing OCR reviewed text remains distinct.

### Actual provider status and limitations

- Model metadata HTTP 200: key/model recognized. Synthetic-only generateContent
  attempts returned HTTP 402: prepayment credits depleted. Provider billing must be
  replenished. No successful live extraction claimed, no production documents sent.
- Mocked backend/provider tests validate parsing/schema/error handling; real Gemini
  structured-output acceptance awaits a successful synthetic request after billing.
- Interpretation results are provisional and process-cached, not stored as durable
  extraction jobs/history. Existing reviewed OCR text save is unchanged and is NOT
  POD approval. Durable structured storage, PDFs, atomic POD approval/rejection,
  trucker notifications and GPS/road routing still need the previously documented
  implementation/proposals/approval. No additional migration applied.

### Verification

- Backend full suite 128/128; frontend 69/69; both TypeScript checks/builds pass.
- Four new backend tests include role/consent/version/scoping, original-text-only
  transfer, no writes, unsupported evidence, null/zero/invalid dates, ambiguity,
  cache/deduplication/session identity, limits, failure retry and provider errors.
- Browser receipt review passes: consent cancel (zero requests), two isolated AI
  requests, explicit draft application, no auto-save/approval, provider failure
  manual fallback, reviewed-save versions [3,4,5,6,7], five seconds/reload and
  conflict draft preservation. No actual business/document writes.
- Targeted new backend/service/browser lint passes. ReceiptReviewCard still reports
  only its 2 documented baseline Hooks errors. Existing Vite chunk warning remains.
- Browser harness initially used a generic alert selector after two simultaneous
  error messages and expected the raw 502 text; corrected to specific review errors
  and the application's sanitized manual-fallback UI. Final browser run passed.

### Files changed in this continuation

- .gitignore; backend/.env.example (placeholder-only, newly visible to Git).
- Ignored local configuration: backend/.env and frontend/.env (never stage).
- Backend: src/services/pod-interpretation.service.ts (new), trip-receipt.service.ts;
  src/controllers/trip-receipt.controller.ts; src/routes/trip.routes.ts.
- Frontend: src/services/receipt.service.ts;
  src/components/admin/ReceiptReviewCard.tsx.
- Tests: backend/tests/pod-interpretation.test.ts (new),
  backend/tests/pod-interpretation-service.test.ts (new);
  frontend/tests/receipt-review.browser.js.
- Docs: this checkpoint; docs/pod-tracking-integration-review.md.

### Exact resume point / acceptance

**Expanded Phase D remains NOT READY for final acceptance.**

1. Replenish Gemini billing, then repeat a synthetic-only structured extraction smoke
   check (never log key/provider documents). Do not repeatedly retry depleted billing.
2. Obtain explicit approved document-processing scope for real POD acceptance; each
   UI action already asks for per-document external OCR-text processing consent.
3. Design/propose durable extraction/history plus atomic approval/notification SQL
   against inspected schema; get explicit approval before live database/Storage/RLS
   changes. Existing POD service-read grant proposal remains unapplied.
4. Continue PDFs, POD workflow, opt-in GPS, location ordering and hourly Mapbox road
   routes in coherent stages. Do not claim the new suggestions endpoint completes them.
5. Preserve applied Operations migration 20261017011210 and prior deletion/milestone/
   management/collaboration checkpoints. No commit or push.


## D.5 POD decisions, private document and tracking preparation (October 17, 2026)

### Read-only inspection / safety

- Preserved all existing worktree changes. No commit/push or live DDL/DML/Storage
  policy/publication action. Operations migration was not repeated.
- Live public.pod_records: 0 rows; receipt images: 8. All have original Storage
  metadata. trip-images/report-receipts remain private, image-only, 5 MB.
- Existing pod_records has stop/DR uniqueness and downstream lifecycle statuses,
  but no decision audit. service_role lacks base POD grants; existing recipient
  notification RLS/publication and restricted receipt/POD change signals suffice.
- No Gemini requests (including metadata or synthetic retries) in this checkpoint.
  Last known blocker remains HTTP 402 prepaid billing; OCR/manual fallback kept.

### Application work completed safely before schema approval

- Default-disabled POD_REVIEW_ENABLED gate and capability endpoint. ADMIN/STAFF
  decision/history endpoints derive actor identity from the authenticated request.
- Exact receipt/trip/stop, validated fields/date/zero/null, optimistic OCR/review
  versions, stable request IDs and canonical confirmation. No split business writes
  in the backend: it delegates the decision to one proposed transaction-safe RPC.
- Receipt review screen has separate POD approval/rejection controls, explicit
  confirmation, required rejection reason, duplicate-submit protection, same-ID
  retry, retained failed drafts, canonical status and latest-50 decision history.
  OCR verification remains separate. Controls stay hidden until approved activation.
- Recipient-only notification APIs now support Truckers using existing authorization
  and own-recipient filters. Existing Socket.IO bridge emits minimal user-room
  notice invalidations, deduplicates them and never sends OCR/paths/messages.
- Trucker notification bell displays cached owned data and refreshes only notices
  on signals/reconnect, preserving the portal's existing assignment loading behavior.
- Fixed completed-stop receipt resubmission replaying delivery completion. New
  documents preserve original files, DR, trip status, line items and unloading time;
  mismatched saved DR is rejected before upload. First completion behavior retained.
- Bucket checks no longer auto-create/reconfigure Storage during read/upload/delete.
  Existing private buckets work; missing/public buckets require administrative review.
- Prepared/tested PDF signature/size/hash/active-content validator, disabled by
  default; actual PDF parser/renderer and upload/preview integration remain pending.
- Prepared GPS capture/time/accuracy/newer-fix validation, ordered destination/
  assignment-revision fingerprint and hourly/backoff/lease planner. No tracking API,
  Geolocation watch or Directions calls activated; existing maps preserved.

### Separate proposals: all UNAPPLIED

Exact hashes and full impact/recovery are in docs/pod-workflow-approval.md.

1. 2026_10_31_proposed_pod_review.sql: receipt decision metadata, minimal retained
   audit, service-only atomic review RPC, two notification types. This is the next
   approval candidate. No new base POD/browser grants, policies or publications.
2. 2026_11_01_proposed_pod_extraction_history.sql: private source/result/lease history,
   immutable source/terminal attempts, receipt-owned derived retention. Durable claim/
   finalize/expired-job adapter is NOT wired yet; no history persistence claim.
3. 2026_11_02_proposed_pdf_receipts.sql: same private 5 MB bucket plus PDF MIME,
   nullable file metadata and exact-stop content-hash index. No backfill/object move;
   renderer/intake must be finished before activation/application.
4. 2026_11_03_proposed_tracking_route_cache.sql: private per-assignment latest-fix
   and road-cache tables, no duplicate writable trip ownership, no public Realtime.
   Protected capture/CAS/route worker/API/map consumer remain to implement.

The earlier 2026_10_30 POD read grant remains unapplied and is not needed by the
new security-definer RPC; do not treat it as a required dependency.

### Verification evidence

- Backend full suite: 135/135 pass before final resubmission test; final suite is
  rerun below. New isolated resubmission test separately passes.
- Frontend unit suite: 69/69 pass. Backend TypeScript and frontend TypeScript/Vite
  builds pass; existing >500 KB chunk warning remains.
- Targeted new/changed services/components lint passes. ReceiptReviewCard still has
  its 2 documented pre-existing Hooks errors; DriverPortal adds no lint errors.
- Fresh disposable PostgreSQL 18: all four exact proposal files compile, assertions
  pass for actor/stop/version/DR/object eligibility, idempotent notification, required
  rejection reason, downstream/ref/remarks preservation and atomic rollback on
  notification failure. Private grants and source/terminal history checks pass.
- Schema FK fixture removes only selected stop-owned children and rolls back;
  sibling/shared assignment survives, derived extraction is removed, minimal audit
  survives. This is not a production Storage cleanup or full deletion-RPC test.
- Two concurrent local writers: 1 commit/1 conflict with one audit/notice; service_role
  executes review RPC without base POD grants. No live records used.
- Real Socket.IO isolated test: recipient room only, no unrelated user delivery,
  notice-ID/revision payload only, duplicate suppression. Own-recipient API filters tested.
- Actual UI fixtures: POD cancel/no-write, reason required, preserved error draft,
  retry same ID, submit disabled while pending, canonical approval, account isolation
  (3 fixture POSTs); trucker initial read 1/cached-open extra 0/coalesced signal extra 1.
- Existing receipt-review browser passed Tesseract/Gemini mocked/manual fallback,
  consent cancel, five-second persistence/reload and conflict draft protection.
- New trucker notification browser initially used an exact text selector on a button
  containing its timestamp; corrected to the actual accessible button name. Final
  fixture passed without forced clicks or production diagnostic suppression.

### Files changed in this continuation

- Backend services: pod-review.service.ts (new), pod-document.logic.ts (new),
  tracking.logic.ts (new), trip-receipt.service.ts, trip-image.service.ts,
  trucker.service.ts, collaboration-server.ts.
- Backend controller/routes: trip-receipt.controller.ts; trip.routes.ts;
  notification.routes.ts. Config template: backend/.env.example; no credential change.
- Frontend components: PodDecisionControls.tsx (new), TruckerNotifications.tsx (new),
  ReceiptReviewCard.tsx; Driver/DriverPortal.tsx.
- Frontend services: receipt.service.ts, notification.service.ts,
  collaboration.service.ts, trucker.service.ts.
- Four new migration proposals above; backend/tests/fixtures/pod-review.sql and
  pod-review-check.sql (new, disposable only).
- Backend tests (new): pod-review.test.ts, pod-document-tracking.test.ts,
  notification-bridge.test.ts, notification-scope.test.ts, pod-resubmission.test.ts.
- Browser tests (new): pod-decision.browser.js, trucker-notifications.browser.js.
- Docs: progress, collaboration-realtime.md, pod-tracking-integration-review.md;
  pod-workflow-approval.md (new approval package).

### Next exact approval / resume point

**Expanded Phase D is not ready for final acceptance.**

1. Review/approve ONLY the exact 2026_10_31 POD review proposal/hash in the approval
   package if desired. Recheck project/schema/grants/counts/hash before application.
   After explicit approval/application verify service-only RPC access, then enable
   POD_REVIEW_ENABLED and test with separately approved disposable/test documents.
2. Complete Requests-tab pending/approved/rejected queue integration and historical
   explicit-POD-selection UX; current controls are in the existing receipt screen.
3. Finish durable extraction lease/request/retry adapter before applying its schema;
   do not retry Gemini until billing is restored. Real documents need processing scope.
4. Finish bounded PDF renderer/preview/Tesseract page intake before applying bucket
   proposal. No real documents/objects may be used as fixtures without approval.
5. Implement protected opt-in capture/session/assignment CAS API and Mapbox lease/
   hourly cache worker/map integration before applying tracking proposal. Browser
   suspension is not reliable background tracking; retain stale-position timestamps.
6. Preserve existing deletion/cleanup, shared table, milestone and auth safeguards.


### Final verification addendum

- Final backend full suite: 136/136 pass; frontend unit suite: 69/69 pass.
  Backend build and frontend TypeScript/Vite build pass. Targeted changed/new
  service/component/browser lint clean; only the 2 known ReceiptReviewCard baseline
  errors remain when linting that pre-existing component. DriverPortal/trucker service
  have no new lint errors. Existing Vite chunk-size warning persists.
- Completed-stop resubmission regression passes against the real service with
  isolated DB/Storage fixtures: no trip/stop/line-item update, original and sibling
  preserved, original timestamp retained, wrong saved DR rejected before upload.
- Notification socket payload now contains ID plus commit-derived revision. Frontend
  deduplication handles overlapping multi-instance bridge events; no private values
  are broadcast. Recipient-only transport test passes with this final payload.
- All proposals compile/assert in the retained disposable DB
  pod_review_20261017_approval on local PostgreSQL 18. Final concurrent writer and
  service-role-execution tests pass. Cluster stopped cleanly; fixtures retained.
- No live schema/data/Storage changes, Gemini calls, commits or pushes.


## POD review activation checkpoint (October 17, 2026)

### Exact approval and live verification

- Applied ONLY `backend/migrations/2026_10_31_proposed_pod_review.sql` after
  recomputing SHA-256 `472F3590BEA5CBA08667729D274C6163BEC742CEF1A93B4E1E25425CFC3C36BF`.
  The approved file was not edited. Supabase confirmed success, recorded exactly
  once as `20261017022906` / `pod_review`.
- MCP project `hdmknewarynwpbrhfgai` matches backend SUPABASE_URL. Read-only
  preflight checked physical columns, constraints, bucket, publication, RLS,
  privileges, absent review objects and migration history before applying.
- RPC signature verified: `review_pod_receipt_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb,uuid)`.
  SECURITY DEFINER owner postgres, fixed `search_path=pg_catalog`; only owner and
  service_role EXECUTE. anon/authenticated denied. Audit RLS enabled, service_role
  SELECT only, no browser audit reads or generic service audit writes. Existing
  base pod_records service SELECT remains denied; the RPC needs no broad read grant.
- All six receipt decision columns/defaults and notification approval/rejection
  CHECK verified. Existing private trip-images bucket is unchanged: 5 MiB,
  JPEG/PNG/WebP, no PDF. Publication membership and browser permissions unchanged.
- Before/after counts and whole-row content hashes match, excluding the six new
  default columns: trip_images 9 (`3a52d13bc1a0984ffa195c0c79053b43`), trip_stops 7
  (`6ca38ae3f73d39b04c7f45bca6774dd3`), pod_records 0, admin_notifications 0.
  Every image has PENDING/version 0/null decision metadata; audit has 0 rows.
  No live approvals, rejections, backfills, uploads, cleanup or test records.
- Operations pagination view reads 11 rows and Tracker page view 6, unchanged.
  Receipt object metadata has no missing originals. This verifies metadata presence,
  not a download of every private file.

### Activation and rollback

- Ignored local backend/.env now has `POD_REVIEW_ENABLED=true`. The existing tsx
  development server was restarted without changing source contents. A fresh
  backend service import reports enabled; real service credentials successfully
  read the new audit and receipt metadata through Supabase REST (read-only).
- backend/.env.example intentionally retains false as the safe deployment default.
  Rollback: set POD_REVIEW_ENABLED=false and restart the backend. Retain decision
  columns/audit/history. Do not drop tables, narrow notification checks or change
  grants as an improvised rollback. Deployed environments need their own flag/restart.
- Existing Admin/Staff receipt review controls are activated by the capability API:
  original document, saved OCR/manual correction, optional AI suggestions, confirmed
  approve/reject, required rejection reason, canonical status and latest 50 decisions.
  The global Requests queue remains a separate unfinished integration.
- Existing recipient-scoped notification bridge/read-unread UI is reused. No new
  Realtime publication or Storage change was required. RPC notification insertion
  commits atomically; only the authenticated recipient receives socket invalidation.
- Gemini was not called; HTTP 402 billing remains unresolved. Tesseract/manual
  review and POD decisions do not depend on Gemini availability.

### Verification and evidence

- Backend full automated suite 136/136; frontend full automated suite 69/69.
  Backend TypeScript build and frontend TypeScript/Vite production build pass.
- Targeted POD/notification/backend/frontend lint passes. Separate baseline check
  still finds 2 pre-existing ReceiptReviewCard React Hooks errors (ref during render,
  setState in effect); no suppression/refactor added. Vite retains its chunk warning.
- New review-only disposable SQL assertions deliberately exclude the unapproved
  history/PDF/tracking proposals. PostgreSQL 18 databases
  `pod_review_activation_20261017` and `pod_review_activation_final_20261017` contain
  synthetic data only. Assertions cover approval, rejection, exact trip/stop,
  idempotency, request reuse, role denial, stale version, required reason, missing
  original metadata, notification failure rollback and retained downstream POD state.
  Concurrent independent writers: 1 success/1 stale conflict, exactly 1 audit event.
  Explicit service-role execution passes; authenticated direct execution is denied.
- Isolated actual-component browser fixtures pass:
  * POD decision: cancel=0 writes, reason required, retry same request ID, draft
    retained after failure, busy protection, canonical approval, decision history,
    account isolation; 3 fixture POSTs, 0 production writes.
  * Trucker notifications: 1 initial read, 0 extra cached-open reads, 1 coalesced
    realtime refresh, 1 mark-read; unread badge, rejection reason and Escape pass.
  * Receipt review: versions 3 through 7, five-second persistence/reload, conflict
    draft retained, manual AI-unavailable fallback; all provider responses mocked.
  * Operations pagination: 102 fixture records, 13 requests, 0 cached-return
    requests, cross-page search/filter/sort, selection reset, last-page deletion
    correction and draft-safe refresh. Offload cleanup/deletion regression passes.
  * Loading/unloading editor fixtures: Manila display, dates/seconds/midnight,
    exact loading-report identity and stop isolation, reload and realtime drafts.
- Controlled live tabs were both logged out. Authenticated live decision, private
  document access and real trucker notification delivery are PENDING, not claimed.
  No live business writes were authorized/performed for acceptance. Sign in with
  approved Admin/Staff and Trucker accounts and use a separately approved test POD
  for the remaining end-to-end review/notification checks.
- Both Git diff checks pass; no unmerged entries, commits or pushes. Existing
  staged/unstaged/untracked work retained. Local PostgreSQL cluster stopped after tests.

### Files changed in this activation continuation

- Ignored local backend/.env: enabled flag only; no credentials exposed.
- backend/tests/fixtures/pod-review-activation-check.sql (new review-only assertions).
- frontend/tests/pod-decision.browser.js: decision history verification added.
- backend/tests/fixtures/README.md: review-only fixture instructions.
- docs/tms-table-overhaul-progress.md, docs/pod-workflow-approval.md,
  docs/pod-tracking-integration-review.md, docs/collaboration-realtime.md.
- The approved migration and prepared application implementation were preserved.

### Exact remaining work

POD review is schema-activated and fixture-verified; authenticated live acceptance
is pending. Expanded Phase D is not fully complete. Next: approved test-document
review/notification acceptance, Requests queue and historical explicit POD selector.
Durable AI history, PDF intake and tracking/route cache remain separate UNAPPLIED
proposals requiring explicit approval and their dependent implementation. Do not
apply the older standalone POD read-grant proposal as a dependency. Do not retry
Gemini while billing remains unavailable.

## Live POD acceptance / PDF and tracking preparation (October 17, 2026)

See `docs/pod-tracking-integration-review.md`, latest section, for the exact live
test scope, database proof, service contracts, blocked activation and next steps.

- User explicitly approved rejecting then approving ONLY test receipt
  `35217c69-9180-4103-9c33-66a51ee85c60` (DR 333). Both actual UI/API calls succeeded;
  final APPROVED/version 2, two history entries, one exact-stop RECEIVED POD and
  two notices to one correct Trucker. Original/OCR loaded, reason required,
  approval survives refresh and becomes terminal. Both notices reached the portal;
  approval appeared automatically without reload. Left notices unread.
- Read-only hashes prove parent trip, both stops and line items unchanged; sibling
  DR 111 receipt remains PENDING/version 0, original private image preserved.
  Real unrelated-Trucker and independent STAFF sessions still unavailable. Earlier
  logged-out limitation is superseded for Admin/recipient-Trucker checks only.
- Added backend pod-intake.service.ts, mapbox-directions.service.ts,
  road-route.service.ts, tracking.service.ts; frontend location-capture.ts,
  pod-upload-validation.ts, TrackedTruckLayer.tsx. Receipt validation is wired into
  existing trip-image.service/trucker.service; trucker route parses PDFs only to
  return the disabled error. No runtime tracking route or PDF activation.
- Backend/.env.example has a backend-only MAPBOX_DIRECTIONS_TOKEN placeholder.
  Existing frontend tile token unchanged; backend token absent. No secrets exposed
  or paid Mapbox/Gemini calls. Last known Gemini HTTP 402 remains.
- Tests: backend 142/142; frontend 73/73; both TypeScript/builds pass; targeted lint
  clean; known ReceiptReviewCard baseline lint/Vite chunk warning unchanged.
  New tracking-services.test.ts, location-pod.test.ts and tracking-map.browser.js
  cover mocked provider/store/GPS and actual prepared Leaflet layer. Existing
  POD/OCR/notification browser regressions pass. Mock 10-route request counts:
  initial 10, pin movement 0 additional, hourly 10 additional, max concurrent 2.
  No real GPS/provider or third-account acceptance claimed.
- No migration/Storage/publication/grant changes, no reapplication, commits or pushes.
- PDF upload remains disabled pending renderer and separately approved PDF proposal.
  Tracking remains unmounted pending atomic Supabase repository/RPC proposal,
  protected APIs and UI/map wiring; table-only proposal is insufficient.
  Durable AI history, Requests queue and broader expanded Phase D remain incomplete.

Files changed this continuation:

- Backend new services: pod-intake, mapbox-directions, road-route, tracking.
- Backend existing: trip-image.service.ts, routes/trucker.routes.ts, .env.example.
- Frontend new: location-capture.ts, pod-upload-validation.ts, TrackedTruckLayer.tsx.
- Frontend existing: services/trucker.service.ts.
- Tests new: backend/tests/tracking-services.test.ts; frontend/tests/location-pod.test.ts
  and tracking-map.browser.js.
- Docs: this progress file and pod-tracking-integration-review.md.

Exact resume: optional third unrelated Trucker/independent Staff for remaining
live checks; bounded sandboxed PDF renderer and original/metadata upload/preview
wiring; safe atomic tracking SQL/repository and protected routes before seeking
approval for either activation. Do not repeat the already-completed live receipt
test or call Gemini until billing is restored.

## Tracking/PDF gated integration checkpoint (October 17, 2026)

Detailed SQL approval/recovery/security package: `docs/tracking-pdf-activation.md`.
Earlier unmounted-service status is superseded: endpoints, portal controls, map
feed, route worker and PDF intake are wired, but DISABLED pending separate approval.

### Completed implementation

- Tracking HTTP endpoints use existing Supabase JWT, app-session and role guards.
  Exact assignment/session GPS writes use the new atomic RPC proposal. Management
  feed is UUID-paginated 50+1, includes accuracy/time/staleness and process metrics.
- Atomic proposal: owner/revision/session/new capture checks, 5-second receive
  limit, locked route context, CAS leases/finalization, shared 30/minute Directions
  budget and retention. Base tracking proposal unchanged; neither applied live.
- Explicit Trucker location controls, assignment choice, 30-second default fixes,
  navigation/pagehide cleanup, permission/session races and account isolation.
  Phone lock/closed browser cannot guarantee collection or final network STOP.
- Existing Socket.IO management room gets minimal committed assignment signals;
  Redis plus 15-second protected API polling recovers missed cross-instance changes.
  Map shows multiple assignments/roads without rebuilding routes on pin updates.
  Cached context changes hide obsolete geometry and wake bounded hourly worker.
  Missing/stale coordinates skip Directions. Co-located marker UX remains limited.
- PDF.js/native canvas run in credential-free child with page/pixel/byte/heap/time
  limits; deployment also needs unprivileged container/native-memory/network limits.
- PDF prepare/saved-page APIs, MIME/hash/duplicate protection, original retention,
  exact stop association, private preview, per-actor throttling and clear 413.
  Portal picker stays capability-gated. Tesseract processes <=10 pages in one worker;
  manual review, optimistic OCR versions and Gemini consent remain unchanged.
- TRACKING_ENABLED and POD_PDF_ENABLED remain false/unset locally/template false.
  Backend Directions token absent; frontend tile token not copied. No paid API calls.

### Proposals (not applied)

1. `2026_11_03_proposed_tracking_route_cache.sql`, unchanged:
   `D70280C19A405665F4EE14D549ED631E753324C7C892BF700C0C633B1E83FA96`.
2. New `2026_11_04_proposed_tracking_atomic.sql`:
   `1DD36954AA6C816AAF64955DF96D9C04911B0AF9C082FF03516B174EBFF03246`.
3. Independent `2026_11_02_proposed_pdf_receipts.sql`, unchanged:
   `3066E5B2A1773673BAEF8BFB06186A7F16555F6954510C495D9E5389A0183B03`.

Tracking base then atomic, flag disabled until verified. PDF can be approved
independently; same private 5 MiB bucket, new PDF MIME and metadata. No browser
grant, RLS relaxation or publication change. Every application needs new approval.

### Verification

- Backend 146/146; frontend 73/73; both TypeScript/builds pass. Backend build copies
  worker to dist. Targeted changed/new module lint and both Git diff checks pass.
  Known ReceiptReviewCard baseline errors/Vite chunk warning remain. npm audit
  reports existing critical proxy-addr 2.0.7, identical to HEAD; no unrelated fix.
- Real synthetic two-page PDF -> PNG in child process; malformed/page-limit/cancel
  rejected. Actual upload service with isolated DB/Storage saves original/hash/MIME
  to exact stop, preserves milestones/sibling and safely rejects duplicate content.
- Actual PDF UI + mocked Tesseract: one raster read, two pages, one terminated worker,
  manual review saves. Actual recognition quality/native PDF viewer remains pending.
- Actual Express middleware + isolated JWT/session/DB: role denial, disabled flag,
  server-derived actor, start/fix/stop and bounded feed. Browser controls verify
  explicit permission, two fixes, stop and unmount cleanup. No live GPS.
- Disposable PostgreSQL 18 compiled both proposals; session replacement, stale
  capture/revision, unrelated actor/browser denial, feed bounds, stop order, route
  lease/context assertions pass. Two local writers: one saved/one duplicate rejected.
  Synthetic DBs retained; owned local cluster stopped after verification.
- Seven browser fixtures pass: tracking-map, tracking-controls, pdf-review,
  receipt-review, pod-decision, trucker-notifications, operations-pagination.
  Mock route measurements: 10 initial, 0 pin movement additional, 10 hourly additional,
  max concurrency 2. No real provider/GPS/private PDF acceptance claimed.
- Read-only Supabase: tracking tables/PDF metadata absent; bucket private, images
  only, 5 MiB; DR 333 Approved/version 2 unchanged. Required service SELECT verified.
  No live writes/migrations/Storage/publication changes, commits or pushes.

### Files changed

- Backend new: tracking-runtime.service.ts, tracking.routes.ts, pdf-renderer.service.ts
  and worker.mjs, pod-pages.service.ts, pod-intake.controller.ts,
  pod-upload.middleware.ts, scripts/copy-pdf-worker.cjs, atomic SQL proposal.
- Backend existing: app/server, tracking/road-route/trip-image/trip-receipt/collaboration
  services, trip/trucker routes, trucker controller, .env.example, package/lock.
- Frontend new: tracking-api.service.ts, pdf-intake.service.ts, LocationSharing.tsx,
  useTrackedAssignments.ts. Existing: LiveTripMap, TrackedTruckLayer, DriverPortal,
  ReceiptReviewCard, collaboration/receipt/trucker/ocr services.
- Tests: tracking-api, pdf-renderer, pdf-upload, pod-upload-limit; SQL tracking
  schema/check, synthetic PDF fixture; tracking-controls/pdf-review browser fixtures.
- Docs: progress, tracking-pdf-activation.md, integration/collaboration docs.

### Exact resume / blockers

Review the exact proposal package before approval. After approved application,
verify RPC/current schema, configure backend token and OS renderer isolation,
obtain real paid-routing/GPS/PDF test scope, then activate flags independently.
Do not repeat DR 333 decisions or retry Gemini (HTTP 402). Independent Staff/
unrelated Trucker acceptance, co-located marker polish, Requests queue and durable
AI history remain separate. Expanded Phase D is not fully accepted.


## Phase D - Tracking/PDF approved migration checkpoint (October 17, 2026)

See docs/tracking-pdf-activation.md for exact checksums, project verification and
full postflight. Only the three explicitly approved files were applied, unchanged:
tracking_route_cache 20261017033055, tracking_atomic 20261017033115, and pdf_receipts
20261017033128. Each is recorded once. No extraction-history/unrelated migration.

- Verified project hdmknewarynwpbrhfgai matches backend configuration. Private tracking
  tables and six service-only RPCs verified; RLS/browser grants/publications remain
  restricted. Private bucket now allows PDF in addition to images, still 5 MB.
- Operational hashes unchanged: 6 trips, 7 stops, 6 assignments, 9 images, 1 POD,
  2 review events, 2 notifications. DR 333 untouched. Operations/Tracker views read
  11/6 rows; review RPC remains service-only. No live GPS or PDF writes.
- TRACKING_ENABLED remains false: backend MAPBOX_DIRECTIONS_TOKEN is absent.
  POD_PDF_ENABLED remains false: compiled renderer/native dependencies work locally,
  but deployed unprivileged/native-memory/network isolation is not verified.
  POD_REVIEW_ENABLED=true preserved. No restart required; no paid APIs called.
- Backend 146/146 and frontend 73/73 pass; both TS/builds pass. Targeted tracking/PDF
  lint clean; existing ReceiptReviewCard Hook errors and Vite chunk warning remain.
- Disposable PG18 tracking/PDF/POD+PDF schema tests and two concurrent GPS writers
  pass. Added repeatable PDF schema/check fixtures, no production fixture writes.
- Seven isolated browser regressions pass, including ten-truck map, explicit consent,
  PDF manual review, POD decisions, notifications and 102-row Operations pagination.
  Recognition engine/Mapbox/GPS and DB APIs are mocked in browser tests; compiled PDF
  rendering and disposable SQL are real. Authenticated GPS/PDF acceptance pending.
- Files changed this activation checkpoint: docs/tracking-pdf-activation.md,
  docs/pod-tracking-integration-review.md, this progress document,
  backend/tests/fixtures/pdf-receipts-schema.sql, pdf-receipts-check.sql and README.md.
  Existing implementation/worktree preserved; no application code or approved SQL
  changed. Both Git diff checks pass; no unmerged entries. No commit/push.

Exact resume: supply private Directions configuration and verify deployment renderer
OS isolation; activate flags independently, restart, then obtain safe GPS/PDF test
scope for authenticated acceptance. Do not modify DR 333, call Gemini (402), or
reapply these migrations. Expanded Phase D is not ready for full acceptance yet.
Rollback: both flags false plus backend restart; preserve schema and existing files.


## Phase D - Mapbox readiness and renderer hardening (October 17, 2026)

- Preserved all three applied migrations and flags. Backend Directions token absent;
  frontend public token present, not reused. Exact local configuration/runbook and
  request budgets documented in docs/tracking-pdf-activation.md. Directions access
  remains unverified; no paid calls made.
- PDF parent enforces input/caller limits, validates child raster protocol and PNG
  dimensions, forcibly terminates cancelled/timed-out children and clears buffers.
  Worker obeys requested limits and cleans canvas/page/PDF task on failure.
- Compiled worker/native canvas render synthetic PDFs successfully on local Windows.
  No production backend deployment manifest found. Child inherits backend OS rights;
  native-memory cap, restricted identity/filesystem and OS egress isolation remain
  unverified. PDF intake stays disabled; deployment configuration requested.
- Backend150/150, frontend73/73; both TS/builds and targeted changed-module lint pass.
  Compiled-dist renderer smoke and isolated PDF review browser fixture pass. New tests
  cover invalid output, tighter budgets, in-flight cancellation/slot recovery and
  30/minute Directions limit. Git diff/cached checks pass. Vite baseline warning stays.
- Read-only Supabase confirms private5MiB bucket, empty unpublished tracking tables
  and existing migrations. Browser only has about:blank; authenticated checks pending.
  No real GPS/PDF write, DR333 edit, Gemini/paid routing call, SQL, commit or push.
- Changed: backend/src/services/pdf-renderer.service.ts, pdf-renderer.worker.mjs,
  pod-intake.service.ts comment; backend/tests/pdf-renderer.test.ts,
  tracking-services.test.ts; activation/integration/progress docs.

Resume: obtain actual backend deployment configuration, verify worker OS isolation,
configure private MAPBOX_DIRECTIONS_TOKEN, then seek controlled live acceptance scope.
POD_REVIEW_ENABLED=true preserved; TRACKING_ENABLED=false and POD_PDF_ENABLED=false.
No additional Supabase action is needed for this checkpoint.


## Hostinger KVM2 Docker preparation checkpoint - October 17, 2026

Architecture prepared only; no purchase, provisioning, deployment, DNS/Auth change,
Supabase write, paid provider call, DR333 modification, commit or push.

### Created configuration and integration

- deployment/compose.yaml: HTTPS proxy, static frontend, single backend, isolated
  PDF/OCR worker. Only80/443 published. Multi-stage Dockerfiles, UID1000, read-only
  roots, no capabilities/new privileges, health checks, restart policies, CPU/RAM/PID
  limits, bounded noexec tmpfs and rotated operational logs. Cloud Supabase retained.
- deployment/Dockerfile.backend provides backend and worker targets; frontend/proxy
  Dockerfiles and Caddyfiles provide HTTPS, WebSockets, SPA direct links, public-only
  build arguments, persistent certificates and redacted/rotated proxy logs.
- PDF worker has network_mode:none, no app credentials/env_file and only a dedicated
  Unix socket volume. Backend mounts the socket volume read-only. Production renderer
  delegates to the socket and refuses credential-bearing local fallback. Worker
  handles bounded rendering plus optional offline English Tesseract CLI OCR; existing
  browser Tesseract remains the application's current OCR path.
- Added exact production HTTPS CORS/proxy configuration; unconfigured development
  behavior preserved. Same JWT/role/app-session/Socket.IO safeguards remain.
- Templates: deployment/.env.example (public build/config), backend.env.example
  (private placeholder-only server config), backend/.env.example socket/CORS guidance.
  Root .dockerignore excludes secrets/envs/tests/builds. Secrets/runtime paths ignored.
- deployment/container-healthcheck.cjs, smoke-pdf.cjs and validate-config.py provide
  process/socket probes, a real future container synthetic render+Tesseract test and
  static YAML/policy checks without reading actual environment files.
- docs/hostinger-vps-deployment.md: Ubuntu/Docker/firewall/DNS/ACME setup,8GB resource
  budget, controlled build/start, isolation checks, monitoring, rollback and encrypted
  backup/recovery responsibilities. Contains official primary documentation links.

### Verification / blockers

- Backend153/153 and frontend73/73 pass; both TypeScript/builds and targeted new/changed
  module lint pass. Health/smoke scripts pass Node syntax checks. Static YAML/policy
  validation passes with disposable PyYAML outside the project. Git diff/cached checks
  pass. No unmerged entries. Existing Vite chunk warning/ReceiptReviewCard lint baseline
  remain; dependency advisory release review remains separate.
- Local native PDF rendering passes. Adding local standard fonts initially exposed
  a Windows separator requirement; fixed and renderer tests pass again. Real socket/
  named-pipe protocol test covers health, bounds, busy response, OCR (mocked engine),
  unavailable worker and sanitized errors. Production no-socket refusal/CORS tested.
- Docker is NOT installed on this workstation. No Docker/Compose engine execution,
  image build, Caddy validation/ACME, Linux cgroup/PID/egress enforcement, Ubuntu-host
  native canvas or real container Tesseract test has been claimed. Run the documented
  smoke/isolation acceptance checks on an approved Docker host before enabling PDF.
- Backend Directions token is now present but equals the existing frontend public
  rendering token (public prefix, not secret prefix). It appears in browser assets
  as that already-public rendering token. No new private token was exposed by this
  work; separate backend token/API authorization remain prerequisites. Supabase
  service-role and Gemini private values absent from frontend build/deployment files.
  No local credentials were copied into templates or modified.
- Flags remain POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false, POD_PDF_ENABLED=false.
  Gemini402 unchanged. No tracking/PDF live writes or paid verification.

### Files / exact resume

New: deployment/* configuration/templates/scripts, docs/hostinger-vps-deployment.md,
backend/src/config/http.ts, src/pdf-worker.ts, services/pdf-worker-client.ts,
services/pdf-worker-server.ts and tests/deployment.test.ts; root .dockerignore.
Modified: .gitignore, backend/.env.example, app.ts, pdf-renderer.service.ts,
pdf-renderer.worker.mjs and progress/activation/integration docs. Existing work kept.

Next: approve a precise release artifact and target-host access/provisioning before
any deployment. Pin verified base-image digests, run actual Docker builds/config
validation and native worker smoke/isolation tests. Supply separate Directions
credentials and approve controlled test records/provider usage. Coordinate domain,
DNS and Supabase Auth URLs separately. No additional database migration is required
for this prepared topology. Keep both new feature flags false through those gates.


## Local POD/Mapbox functional acceptance - October 17, 2026

Hosting/deployment postponed by user. New local acceptance guide:
`docs/pod-mapbox-local-acceptance.md`; supersedes the prior deployment resume order.
No Supabase writes/migrations, production uploads/decisions/GPS, DR333 changes,
paid Mapbox/Gemini calls, commits or pushes in this checkpoint.

### Verified

- Real user-signed-in Admin and Trucker sessions available. Admin review capability
  enabled; Trucker administrative receipt/review endpoint403; own assigned list5
  trips and existing notifications readable. PDF/GPS capabilities false. Admin
  denied Trucker-only assigned-trip endpoint. Independent STAFF/unrelated Trucker
  sessions were not available; their permissions are covered by isolated tests only.
- User allowed an existing non-DR333 receipt to be viewed. Used receipt
  62fa7830-7fb9-4ace-9921-0e3879b08d02 (DR111), trip
  ed329614-62d0-4d83-afbc-8c578fdb23d1, stop
  cb9bf6f1-f6ef-439e-b7da-0046375f308d. Outside the old DR333 trip.
  Actual review component rendered original image;444 OCR characters accessible;
  Approve/Reject enabled; history shows no decisions; status remained PENDING.
  Private image362169bytes with matching hashes on two reads. Admin fixture blocked
  non-GET API requests, with0 attempted writes. No new records were created.
- Full images/stops/trips/POD/review-event/notification hashes matched before/after.
  Read-only live schema check: private5MiB bucket, service-only decision RPC, RLS
  GPS tables/no browser SELECT or tracking publication; tracking/cache rows0.
- Real Tesseract browser run on six generated images: clear95confidence found2468;
  blur51/rotated55 missed the DR; multiple95 found2468+1357; missing95 invented neither;
  blank0 returned empty; invalid bytes rejected. These scores are engine confidence,
  not measured general accuracy. Blurry/sideways images need manual correction or
  clearer upright photos. No business image/text sent to an AI/provider.
- Mocked POD decisions/audit/retry/conflict/reason, receipt-only resubmission, exact
  stop preservation, original retention and recipient-only notifications pass.
  Added actual HTTP Auth/role fixture for Admin/Staff read access and denied Trucker
  admin operations; unrelated driver resubmission rejected before Storage.
- Mock tracking:10roads/20stops, no Directions requests for pin changes,10hourly
  requests, max2concurrent,30/minute budget. Socket-refresh browser shows initial1,
  committed update1, reconnect1, unrelated event0 requests. No real GPS/routes.

### Direct local fixes

- OCR preprocessing now closes ImageBitmap in finally, including fallback/error.
- GPS confirmed/reconnect events invalidate only active-location cache before fetch,
  avoiding briefly stale cached pins; replaced socket tracking events check active
  session. Existing route geometry, session isolation and draft protection preserved.
- Backend Directions token still equals frontend public rendering token. Configure a
  separate server-appropriate token and approve authorization/routing verification.

### Tests / files / exact resume

Backend154/154, frontend73/73; both TS/builds and targeted changed TS/TSX lint pass.
Seven isolated browser fixtures pass, including actual Tesseract accuracy test.
Vite chunk warning/old ReceiptReviewCard lint baseline remain. Both Git diff checks
pass. New: pod-mapbox-local-acceptance.md, pod-permissions.test.ts,
ocr-accuracy.browser.js, tracking-realtime.browser.js. Modified: pod-resubmission
fixture, ocr.service.ts, collaboration.service.ts, useTrackedAssignments.ts and
progress/activation/integration docs. All preexisting work preserved.

Resume locally: obtain independent STAFF and unrelated Trucker sessions; explicitly
approve a new non-DR333 decision/upload/resubmission sequence and safe active
assignment/GPS/paid-routing scope. Use the new checklist's exact IDs, baseline and
rollback requirements. Current Trucker is assigned to the viewed trip; its403 proves
admin-role separation, not unrelated-driver ownership denial. Historical Trucker
receipt gallery/reload viewing remains unverified beyond selected-upload preview.
No new schema change needed. Keep POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false,
POD_PDF_ENABLED=false and Gemini unused until separately cleared. Do not deploy.


## GPS controlled-test PREPARATION checkpoint - October 17, 2026

User explicitly requested preparation only. Full checklist and technical token audit:
`docs/mapbox-gps-controlled-test.md`. No activation, live GPS writes, paid Mapbox/
Gemini requests, operational edits/DR333 access, Supabase SQL changes, deployment,
commits or pushes. Hostinger configuration untouched; all existing work preserved.

### Local fixes

- Location controller now flushes coalesced throttled fixes using a timer, retries
  recent failed fixes, rejects invalid/duplicate/delayed browser input, drops stale
  queued fixes and cancels pending timer/watch/fetch on stop.
- Watch setup failure cleans its created session. Failed server STOP retains exact
  session for explicit retry and prevents silently opening another. UI rechecks
  mounted scope and secure context. AbortSignal reaches actual tracking HTTP request.
- Active-map events during a fetch schedule a coalesced follow-up refresh; retained
  pins survive failures. Prior event/cache/session guards preserved.
- Added optional TRACKING_TEST_PROFILE_ID + TRACKING_TEST_ASSIGNMENT_ID (both or
  neither; invalid partial scope fails closed). Exact driver/assignment ownership,
  role/revision/RPC checks still apply. Scope gates starts/captures, filters management
  feed and route jobs, and skips global retention pruning. Safe owner/session STOP
  remains available after scope change. Actual .env scope is UNSET, flags remain off.

### Token / phone / database findings

Directions token remains identical to existing frontend public pk token. Directions
requires valid Mapbox token, not extra secret/admin scopes; it may technically work
with a public/default token. Actual restrictions/entitlement/access are unverified;
no live request. Recommend separate backend token for rotation/usage and no browser
origin restrictions blindly reused for server calls. Built frontend scan found no
Supabase service-role or Gemini secret value. Backend is the only Directions caller
in source. Existing public rendering token is intentionally browser-visible.

Read-only live GPS tables0/cache0, RLS/no anon/authenticated SELECT, no tracking
publication and service-only RPC EXECUTE verified. No new database change needed.
Phone LAN HTTP is not a valid substitute for trusted HTTPS; localhost points to phone.
Guide details trusted local TLS/origins/API/socket accessibility, exact account/trip/
assignment/stop approval, paid-budget consent, scoped flags/restart, no-auto-resume,
30second capture/15second poll/2minute stale behavior, confirmed STOP before disabling,
and separately approved exact-session GPS cleanup. Unexpected tab kill cannot
promise server STOP delivery. Scope mode deliberately does not globally prune data.

### Tests and files

- Backend157/157 serial full suite passes; frontend76/76 passes. Initial parallel
  backend run had2existing PDF timeout failures under load; serial rerun passes with
  unchanged15second safety limits. Both TS/builds, targeted lint and Git diff/cached
  checks pass. Existing Vite warning/old unrelated ReceiptReviewCard lint remain.
- New10truck/10trip/2stop simulation:10initial mock routes,0movement additional,
  2context-change additional,10hourly additional. Unauthorized/duplicate/out-of-order/
  invalid/stale captures denied; stopping one truck preserves others.
- Unit/HTTP/runtime fixtures cover scope denial/fail-closed/filter/no-global-prune,
  offline retry, pending permission/logout, watch failure and failed-stop recovery.
- Three browser fixtures pass: multi-truck map; explicit consent/pagehide/unmount/
  reload without auto-resume; event freshening/network loss/reconnect cache behavior.
  All GPS/API/Mapbox responses simulated. No real GPS acceptance claim.
- New files: backend/src/services/tracking-test-scope.ts,
  backend/tests/tracking-test-scope.test.ts, tracking-scope-runtime.test.ts,
  tracking-simulation.test.ts, docs/mapbox-gps-controlled-test.md.
- Modified: backend runtime/routes/.env.example/tracking-api test;
  frontend location-capture/api/tracking-api services, LocationSharing/
  useTrackedAssignments, location-pod test, tracking-controls/realtime browser tests;
  progress/activation/integration docs. No Hostinger files changed.

Exact resume: WAIT for explicit one-profile/assignment test scope approval, trusted
phone HTTPS setup, separately configured/verified Mapbox token and GPS/provider-spend
permission. Do not change flags or delete retained data under this preparation scope.

## October 17 — Cached Mapbox GL road-routing checkpoint

Continued under road-routing preparation authorization; tracking/PDF flags remain
false. No SQL, migration, operational/location/receipt writes, live Directions,
Gemini, GPS capture, deployment, commit or push. Existing DR 333 is untouched.

Completed:
- Admin/Staff map defaults to lazy-loaded Mapbox GL road view; existing Leaflet
  recorded-events view remains available with explicitly schematic link labels.
- Bounded, protected read-only `/api/tracking/roads` joins exact trips/stops/current
  assignments, warehouses/stores, driver/truck, saved position and existing cache.
  Cached remaining routes must match the existing read-only RPC context/fingerprint.
- Planned/remaining display modes, warehouse/numbered-stop/truck markers, independent
  colored routes, selection emphasis, road-bounds fit and metadata/status panel.
- Marker refresh preserves route source and viewport. Sources/layers/listeners/pins
  clean up; no fallback straight-line road geometry is generated.
- Token-isolated cache-first reads, deduplication, retained data/retry and targeted
  collaboration refresh; no write or Directions operation in the new read path.
- Coordinate-management implementation plan prepared; no location edits enabled.

Read-only SDK counts: warehouses7 (1 valid pair), stores8 (8 valid), trips6,
stops7, assignments6, tracking locations0 and cached routes0. Coordinate columns
already exist; no coordinate schema migration is required. Six warehouse locations
need separately approved verification/entry.

**Remaining limitation:** existing cache stores only one remaining variant per
assignment. Planned mode renders fixture geometry but cannot generate/persist a
production planned variant yet. It truthfully shows unavailable instead of reusing
remaining geometry. Prepare an approved extension of the existing cache/RPC before
planned-route generation; no duplicate location table or unapproved SQL.

Verification: backend159/159 serial; frontend79/79; both TS/builds and targeted
changed TS/TSX lint pass. Staged/unstaged diff checks pass (existing CRLF notices).
Actual offline GL browser test:10 independent road features,10 warehouses,20 stops,
10 trucks; planned without GPS, remaining/completed-stop filtering, fit/highlight,
marker-only/source/viewport reuse and cleanup pass.0 external/Directions requests,
0 GPS writes. Geometry fixture comes from Mapbox's documented road-step example;
it is not live ALZHEN routing verification. Four existing tracking/Trip Details
browser regressions pass. New lazy GL chunk~1.88MB minified/524KB gzip; Vite chunk
warning remains. No live performance/road-accuracy claim.

Files this checkpoint: backend tracking route + road-routing-read service/tests and
tracking-api HTTP tests; frontend package/lock, LiveTripMap, RoadRoutingPanel,
RoadRouteMap, road-map-layer, road-routing service, road-routing unit/browser tests,
documented geometry fixture; docs/road-routing-readiness.md and this progress log.

Exact resume: review mode-aware planned-cache proposal, approve/verify missing
warehouse coordinates and backend Directions configuration, then separately
authorize controlled live routing/GPS. Keep TRACKING_ENABLED/POD_PDF_ENABLED=false.
See docs/road-routing-readiness.md for evidence, current limits and coordinate plan.

## October 17 — Planned routes and warehouse-coordinate preparation

Supabase MCP was reconnected by the user. Read-only table/catalog checks confirm
existing assignment-keyed cache/RPC contracts, RLS and service-only function access;
private GPS/cache tables are not published. Warehouses7, usable coordinate pairs1.
No Supabase migration/write, live Directions/GPS/Gemini call or operational change.
TRACKING_ENABLED=false and POD_PDF_ENABLED=false unchanged; new PLANNED_ROUTES_ENABLED
is unset (false) locally and false in the example template. No Hostinger changes.

Prepared proposal (NOT APPLIED):
`backend/migrations/2026_11_05_proposed_planned_routes.sql`
SHA-256 `41EF6DD91F9E21C4319C5F352F04C2FC35719107B04F2252EFE9FC6A00D83890`.
Adds eleven planned_* columns to existing cache and two service-only context/write
RPCs. Keeps assignment PK/FK, remaining data/functions, grants, RLS and publications.
Independent planned leases/revisions; combined existing 30/minute provider budget.
No duplicate location/cache table, coordinate backfill or operational edits.

Application:
- Planned service resolves warehouse and every physical stop in saved sequence,
  independent of GPS. Missing coordinates and >24 stops fail explicitly before
  claiming/provider use. Supports cache reuse, hourly expiry, context invalidation,
  concurrent deduplication and retained geometry/retry after failure.
- Protected POST /api/tracking/roads/:assignmentId/planned requires ADMIN/STAFF,
  server-derived identity and the separate disabled flag. Future committed updates
  use existing management-only invalidation. No scheduled automatic provider calls.
- Read API/UI supports independent plannedCache/remaining cache metadata and expiry.
  New schema columns/RPCs are not accessed while the flag is false.
- Road routes → Warehouse coordinates reads existing paginated management API,
  displays saved/missing coordinates, offers local map pin/numeric preview, validates
  bounds/order, and leaves Save disabled. No persistence call exists in the editor.
  Six warehouses need separately authorized coordinate verification, not schema work.

Tests:
- Full backend164/164 serial; frontend81/81. Both TypeScript/builds and targeted
  changed TS/TSX lint pass; existing Vite large-chunk warning remains.
- Disposable PostgreSQL18 compiles proposal and verifies role/RPC ACLs, active
  assignment/ordered stops, missing origin/store, waypoint limit, shared budget,
  expiry/context changes, existing six RPC definitions and remaining cache unchanged,
  retained geometry on failure, RLS and zero GPS rows.
- Independent psql contenders:1 successful lease,1 rejected; no GPS data created.
- Browser Staff warehouse editor:1 mock read, existing/missing coordinates, pin
  selection/validation, unchanged source records, disabled Save and cleanup;0 external
  requests/0 mutations. GL10trip regression passes (cached geometry/pin/viewport reuse).
- All Directions results are isolated fixtures. No live planned route, warehouse
  save, provider/token authorization or GPS acceptance is claimed.

Files: planned migration; planned-route service/runtime and tests; tracking routes,
road read service and tests; backend .env.example; local SQL/concurrency fixtures;
WarehouseCoordinateEditor, coordinate-draft service/test, RoadRouteMap/RoadRoutingPanel,
road-routing service/tests, warehouse browser fixture; approval/readiness/progress docs.

Exact resume: obtain explicit approval of the exact planned SQL/checksum, verify
project/schema and apply only approved SQL later; separately approve warehouse edits
and provider credentials/budget/controlled planned generation. No flags or persistence
are to be enabled merely by migration approval. See docs/planned-route-approval.md
for verification/recovery and the complete activation boundary. No commit/push.

## October 17 — Approved planned-route migration applied (activation still OFF)

User explicitly approved only backend/migrations/2026_11_05_proposed_planned_routes.sql
with SHA-256 41EF6DD91F9E21C4319C5F352F04C2FC35719107B04F2252EFE9FC6A00D83890.
Read complete disk file; exact checksum verified before/after. Supabase MCP configured
project scope and backend project both match hdmknewarynwpbrhfgai. Read-only preflight
verified absent migration/columns/functions, expected tracking dependencies and ACLs.

Applied exact disk SQL once through MCP: success, version20261017124148,
name planned_routes. No other migration or corrective SQL was executed.
Post-checks:11 planned columns,2 expected SECURITY DEFINER/search_path pg_catalog
RPCs; service_role EXECUTE true, anon/authenticated false; expected4 checks/defaults.
Existing6 tracking function definition hashes/ACLs, original PK/FK/checks, cache ACL,
RLS/policies and private publication membership unchanged. Row counts/content hashes
match across30 operational/lookup/receipt/POD/notification/GPS/cache tables.
Route cache0/GPS0 before and after. Read-only planned, remaining and assignment RPCs
retain exact parent identity for6/6 assignments; existing feed read succeeds with0.
Migration history records20261017124148 exactly once. No database execution errors.

Flags unchanged:TRACKING_ENABLED=false;POD_PDF_ENABLED=false;
PLANNED_ROUTES_ENABLED unset(defaultfalse). No GPS capture/write, warehouse edits,
route generation, Mapbox/Gemini call, cleanup, Storage/publication change, deploy,
commit or push. Approved SQL file remains byte-for-byte unchanged.

STOPPED after migration verification. Next steps require separate explicit approval
for warehouse-coordinate edits, provider credentials/budget and controlled planned
route activation. Do not reapply the planned migration or enable flags automatically.


## October 18 ? Phase 2C: tab caches, report UX, attribution, safe deletion proposals and unified map

See `docs/phase-2c-progress.md` for architecture/FK graph, all 11 requirement statuses, exact proposal checksums, measured fixture request counts, test evidence, file groups and resume gates.

Implemented per-tab bounded preload (auth/login no longer starts 23 unrelated requests), React Activity retained Home/Trips/Reports and internal report panels, cached section metadata/skeletons, POD sidebar removal, compact report toolbars, All/Backload/Offload filters, stepped report editors and Save at every Trips step. Home history download is bounded (latest100 previews, total counts from DB); event/image enrichment queues are bounded. Offload display resolves original creator/submitter rather than delegated reporter; unknown history is not backfilled.

Combined Admin deletion has impact preview and a fail-closed disabled endpoint. Proposed `2026_11_07_proposed_whole_trip_deletion.sql` reuses existing retention/cleanup RPCs in one outer atomic transaction; no unsafe fallback. It is NOT APPLIED. Creator search/sort proposal `2026_11_06_proposed_operations_creator_attribution.sql` is also NOT APPLIED. Tracker Delete is disabled with explanation because completed-stop projections cannot be removed by deleting POD; lifecycle policy is needed.

Home uses one Mapbox interface, existing planned/remaining cached geometry, and ten explicitly synthetic Philippine demo trips only if no usable real routes exist. Mock polylines are not verified Directions data. No mixed real/demo records, provider calls, route generation or demo persistence. Live coordinate readiness:7 warehouses(1valid/6missing),8 stores(8valid),2 of6 active trips blocked by missing warehouse coordinates; cache0. Warehouse editor remains non-persistent.

Tests: backend167/167, frontend83/83; TypeScript and both builds pass. Isolated browser tests cover report retention, stepped editors, stop ownership, cache navigation, physical Offload deletion, disabled whole-trip confirmation/double-click, ten GL routes and demo-to-real replacement, Trip Details route/refresh, Users cache, Tracker pages/reference export and milestone edits. Disposable PG18 verifies creator search125records and whole-trip multi-stop/rollback/financial protection/concurrent retries. No live writes/tests. Five changed-file lint errors match exact HEAD baseline; no new lint regressions. Existing Vite large chunks remain.

Supabase inspection SELECT-only; no live migration, Storage/publication/grant/data changes. Flags unchanged:tracking=false,planned unset(defaultfalse),PDF=false,PODreview=true. Whole-trip-delete unset(defaultfalse). No commit/push/deploy.

Resume: obtain separate exact SQL approvals and Tracker removal policy; keep destructive feature disabled; then controlled authenticated navigation/realtime/performance acceptance. Phase2C is not fully accepted while these blockers remain. Do not rerun completed Phase2B migrations or previous DR333 decisions.


## October 18 ? Phase 2C.1 SQL review and unified Combined/Tracker whole-trip deletion

See `docs/phase-2c1-sql-deletion-review.md` for disk checksums/sizes, catalog compatibility, permissions, rollback, all25 requested test categories and approvals. Live read-only FK/logical-reference inventory is in `docs/phase-2c1-database-catalog.json`.

Confirmed user decision: Tracker Delete means the whole parent trip, exactly like Combined. Both now use one validated parent-ID resolver, API/cache client, confirmation dialog, Admin-only backend service and atomic RPC/cleanup architecture. Multiple stops and identical DR labels never substitute for parent identity. No Tracker-only or POD-only deletion is implemented.

Creator SQL remains byte-for-byte unchanged (FD644E...); disposable contract comparison confirms creator-only projection,28 columns/ACL unchanged and idempotency. Whole-trip SQL is revised and requires new approval: adds a service-only Admin count-preview RPC because service_role cannot directly SELECT POD/Drive/backload-item tables, stronger image ownership checks, bounded counts and minimal audit summary in existing private cleanup journals. Existing transaction RPC definition remains unchanged.

New dependency discovered: driver_trip_updates has45 rows,0orphans,8 legacy POD attachment references and no parent FK. Separate proposed `2026_11_08_proposed_driver_update_parent.sql` adds a NOT VALID RESTRICT FK, preserves historical rows and prevents new orphan writes. It must be separately approved before revised whole-trip SQL. Whole-trip deletion removes eligible exact-trip driver updates atomically and blocks legacy attachments; old stop-only last-stop calls can fail safely under that new FK. This compatibility impact is explicitly documented. No migration was applied.

Tests: backend169/169,frontend85/85; both TypeScript/builds pass, existing Vite chunk warnings. Browser fixtures verify Combined and Tracker exact parent selection, deduplication, shared dialog, blocked confirmation/cancel, Staff restrictions and simulated successful cache refresh. Disposable PG covers operational children, POD/transmittal flex data, tracking cascades, financial/history/document/shared-image/driver-POD blockers, atomic rollback, orphan protection, retained audit, exact cleanup jobs, idempotency and two-client concurrent deletion. Two existing Tracker lint errors remain; no new regression.

Flags unchanged: WHOLE_TRIP_DELETE_ENABLED unset(defaultfalse),TRACKING_ENABLED=false,PLANNED_ROUTES_ENABLED unset(defaultfalse),POD_PDF_ENABLED=false,POD_REVIEW_ENABLED=true. No live data/Storage writes, schema/grant/RLS/publication changes, GPS/provider calls, commit,push or deploy.

Resume only after separate exact SQL approvals (creator independently; driver FK before revised whole-trip RPC), post-install verification with deletion still disabled, then separate controlled activation/recovery acceptance authorization. Do not apply the prior whole-trip checksum or reuse DR333 for testing.

## October 18 — Phase 2C.2 final driver-parent and last-stop compatibility

See `docs/phase-2c2-deletion-compatibility.md` for the complete compatibility report,
original/final disk SHA-256 values, installation order, recovery and approval gates.
**Verdict: SAFE TO APPROVE the revised proposals; nothing applied or activated.**

Read-only target verification: MCP/backend/expected project all
`hdmknewarynwpbrhfgai`; migration history ends at `20261017124148 planned_routes`.
All three proposals remain unapplied; new RPCs/FK absent. Original live transaction
RPC MD5 unchanged (`9d11efef4875f0d32256d589db30a9e6`). Driver history currently
46 rows,6 parents,0orphans,8 legacy POD references; no stop ID or parent FK.
Private RLS/service-only boundaries, existing secure signals and bucket preserved.

Reproduced the original RESTRICT regression in disposable PG18: existing RPC
removes the parent after its last stop but never resolved driver history. Revised
driver-parent proposal now installs RESTRICT and a compatible existing RPC in one
transaction. It retains eligible trip-level history until parent removal, blocks
legacy attachments/shared references, journals IDs/count and explicitly cleans up
eligible updates before deleting the parent. All existing ownership, financial,
conversion, exact-Storage, role and idempotency guards remain. No CASCADE shortcut.
Whole-trip proposal delegates driver cleanup to that same path and requires its
exact normalized definition fingerprint. No duplicate deletion architecture.

Final proposal checksums (separate approval required):
- creator06 unchanged: `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC`
- driver08 revised: `9DCB55827F469F6E173239E189F814222291B7718B612252EEBF6C84AFAE3D09`
- whole07 revised: `5790AA11C3D64E7888C1DA4F48BE7F1C8736C9DFAA84612F887843DD788CDE76`

Disposable verification: original regression1case; compatible last-stop15cases;
driver/deleter races3cases with actual lock barriers; installation-drift3cases;
whole-trip relationship/retention/atomic rollback suite; two independent concurrent
whole-trip callers with matching2job acknowledgements; repeated install preserves
12modeled data hashes and existing owner/ACL/arguments/security/searchpath; creator
28-column/ACL contract and125row three-role attribution/search/sort checks pass.
Not every production trigger, column or financial ledger is modeled.

Final tests: backend169/169,frontend85/85; both TypeScript/builds pass. Initial
backend run168/169 hit PDF rendering's15s budget during simultaneous builds/browser
load; full quieter rerun169/169 passed, PDFtest~3.1s; no weakened limits/code changes.
Eleven isolated browser regressions pass, including existing stop deletion,
Combined/Tracker shared confirmation, exact parents/deduplication, cached views,
milestones, routing, mapdemo and secure draft-safe realtime. Targeted lint retains
only2previous Tracker errors; new CJS syntax checks and Git diff checks pass.
Existing Vite large chunks and Git line-ending notices remain.

No live SQL writes/migrations, operational/Storage deletion, RLS/grant/publication
change, GPS/Mapbox/Gemini request, deployment,commit orpush. DR333 untouched. Flags
remain tracking=false,planned unset(defaultfalse),PDF=false,PODreview=true;
whole-trip-delete unset(defaultfalse). No application source or flag changed.

Exact resume: review and separately approve final creator06 -> revised driver08
(FK + compatible existing stop RPC together) -> revised whole07. Re-preflight and
post-install SELECT checks must preserve rows and permissions, with whole-trip
deletion still disabled. Any activation/authenticated write acceptance needs
separate approval and approved records, backups and cleanup monitoring. Never
restore the old stop RPC while leaving the restrictive FK installed. STOP here.

## October 18 — Phase 2C.3 approved SQL installed; password-confirmed bulk deletion

User explicitly waived installation backup verification and accepted that risk.
No verified recovery point is claimed. Project MCP/backend both hdmknewarynwpbrhfgai.
Exact approved hashes rechecked from disk, unchanged; applied sequentially once:
creator `20261018065149`, compatible driver-parent `20261018065157`, whole-trip
`20261018065228`. See `docs/phase-2c3-installation-password-confirmation.md` for exact
filenames/hashes, catalog/body/ACL evidence, safety and remaining activation gates.
Do not reapply these migrations.

After each application, read-only checks passed: creator28-column contract/ACL;
RESTRICT NOT VALID FK and compatible last-stop RPC; service-only Admin preview and
whole-trip RPCs. All22 operational count/content hashes and existing RLS/policies/
table grants/noninternal triggers/publications unchanged. Driver updates46,
orphans0,attachments8; no deletion jobs. Actual service-role read-only impact
returns28 count fields and can_delete=false (activation block).

Combined/Tracker share current-page bulk selection, row/unique-parent counts,
physical-ID deduplication, same dialog/backend/atomic RPC and cache reconciliation.
Approved maximum20 unique trips per batch is explicit; never silently truncated.
New password confirmation uses request-local non-persisting Supabase Auth client,
server-derived identity, local temporary-session revocation and original session/
role recheck. Frozen exact batch + one POST; no reusable verification token. Five
attempts/Admin/15minutes, overlapping requests blocked; shared Redis supported,
multi-worker without shared limiter fails closed. Password never enters audit,
SQL, socket, URLs, logs or browser Storage; input clears on all outcomes/account
changes. Success toast waits for backend; pending files show warning. Selection
clears; Combined page1/Tracker final-page recovery and shared invalidations reused.

Final tests backend178/178,frontend87/87; TS/builds pass. Nine isolated browser
fixtures and fresh disposable PG rollback/retention/last-stop/concurrency suites
pass. New targeted lint clean; expanded touched-file set retains3 baseline errors
(Tracker2,existing Toast hook export1). Existing Vite chunks/CRLF notices remain.
Live verification is read-only metadata/impact only; no live Auth password or
deletion acceptance claimed. Redis multi-replica rate protocol mocked.

No operational/Storage deletion, destructive production tests, unapproved SQL,
GPS/provider calls, deployment,commit orpush. DR333 untouched. Flags unchanged:
whole-trip-delete unset/defaultfalse;trackingfalse;plannedunset/defaultfalse;
PDFfalse;PODreviewtrue. No feature activated.

Resume only after separate authorization for activation and approved-account/test
record acceptance, HTTPS/shared-limiter configuration and recovery/cleanup
monitoring. Do not use DR333; do not repeat migrations or enable flags automatically.

## October 18 — Phase 2C.4 non-destructive acceptance

Verdict **READY FOR ACTIVATION REVIEW**, not production acceptance or activation.
Full evidence/gates: `docs/phase-2c4-deletion-acceptance.md`. Installed2C.3 migration
IDs/definitions/grants verified read-only, no SQL applied. Actual service-role
SELECT-only preview deduplicates parent IDs, returns28count fields and
can_delete=false. No live deletion/Auth-password/Storage write tests performed.

Narrow UI fixes: shared account/role/bearer-scoped pending deletion selection for
Combined/Tracker (no resurrection on account return); keyboard focus retained in
busy dialog with disabled controls. Existing row/page selection and caches preserved.

Final backend187/187,frontend87/87,TS/builds pass;10isolated browser fixtures pass.
New Auth outage/timeout/revocation, original-client isolation, feature-gate race,
Redis shared budget/concurrency/TTL/stale release/outage tests pass. Redis protocol
is mocked: local Redis unset, deployment template unset, Compose one worker. Actual
shared Redis + dedicated-account/provider refresh-session acceptance remain gates.

Fresh disposable PG full retention/financial/attachment/rollback/last-stop suite,
20/21-parent boundary and preview purity, concurrent submission/deletion tests pass;
owned cluster stopped. New lint clean;2existing Tracker lint errors and existing
Vite chunks/CRLF notices remain. Git diff/index checks pass.

Policy boundary explicitly retained: existing Admin/Staff transaction deletion can
remove a last-stop/empty parent under its prior reviewed policy; Offload deletion
also remains separate. No alternate call site bypasses the new Admin/password/
flag-protected bulk RPC. A global password/Admin rule for all older deletion
workflows would require separate policy review; it was not silently introduced.

No live operational/Storage modifications, migration, permissions/publication change,
feature activation, GPS/Mapbox/Gemini, commit,push ordeploy. DR333 untouched. Whole-
trip/tracking/planned/PDF flags remain false/unset;PODreviewtrue. Stop for review;
do not request or execute activation automatically.


## Phase 2C.5 ? Offload/Backload reporting (October 18, 2026)

See `docs/phase-2c5-offload-backload-reporting.md` for the full impact report,
proposal checksums, changed files and acceptance boundaries.

Added the Trucker Dashboard Report Trip modal using the shared Operations form,
assignment-scoped searchable dispatch/stop choices, required reason, image previews,
multiple uploads and partial-upload retry. Admin DR-based Offload creation remains.
Backload creation now stores trusted original creator/submission metadata; immutable
creator fields survive later Admin edits. Offload original-creator pagination mapping
remains installed. Backload displayed attribution is enriched, but dataset-wide name
search/sort awaits proposed migration 09.

Admin/Staff record deletion now requires the initiating account's current password,
using request-local Supabase Auth and the existing shared limiter/session rechecks.
The immutable batch holds up to twenty deduplicated physical report identities;
individual protected outcomes remain explicit. Whole-trip deletion is still Admin-only
and disabled. Shared cargo cleanup engine supports Offload's installed journal and
Backload's proposed journal/RPC; attached Backload deletion fails closed until proposal
10 is approved. Generic pending-cleanup/retry routes and notice cover both types.

READ-ONLY live impact: Offloads=0, Backloads=0, Offload items/receipts/conversion refs=0.
Exact Offload target IDs=[], affected trips/stops/dispatches=[], eligible Storage=0.
One private report-receipts object has no Offload/Backload receipt references; ownership
is unresolved and it is explicitly excluded/untouched. No cleanup approval is actionable
against the currently empty target set. DR333 and all operational data preserved.

Tests: backend193/193, frontend87/87; five isolated browser fixtures pass (including
102-row Operations pagination and mobile two-type Trucker submission). Disposable PG
Offload/Backload deletion and creator/global-search/sort/28-column contract suites pass;
owned cluster stopped. TypeScript/builds and changed-file frontend lint pass. Existing
Vite chunk-size/CRLF notices remain. No authenticated live writes or provider password
acceptance claimed. Existing Redis/provider acceptance limitations remain.

Pending only, NOT APPLIED: 2026_11_09_proposed_backload_creator_attribution.sql
SHA D420DA31A42335FD05E03F62ED3E4F9F3DAB969956DCE9F9B8A21415BE3A7333;
2026_11_10_proposed_backload_deletion_cleanup.sql
SHA 9CC29592B7379FDC2605D138476BBA9B039B76734C6F28AD23B48096AC520980.
No bucket/publication change required; existing authorized change signals reused.
No live writes, Storage mutation, migration, feature activation, providers, deployment,
commit or push. Resume with separate proposal review/approval and then controlled,
explicitly authorized Admin/Trucker submission acceptance. Do not enable whole-trip
deletion or clean up the unowned object. Lost-response creation idempotency and concurrent
Backload image-count enforcement remain limitations, not new guarantees.
