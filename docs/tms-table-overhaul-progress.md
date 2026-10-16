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
