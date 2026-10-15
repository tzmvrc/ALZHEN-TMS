# TMS table overhaul: completed integrity and Offload phase

> Latest resume checkpoint: see **Phase 2B.3 — Offload report completion** at
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
