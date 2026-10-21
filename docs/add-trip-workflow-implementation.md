# Add Trip workflow implementation

Database integration status (October 21, 2026): **all four required database migrations were successfully applied in the earlier integration phase and confirmed in the live migration ledger.** Existing generated trip references and convoy integrity objects were retained. The later UI follow-up below was verified in Playwright with operational writes intercepted; builds, live persistence tests and deployment remain unexecuted. Earlier testing-status statements describe their respective implementation phases.

## Add Trip UI cleanup and browser verification

October 22 column-mapping follow-up: `CDO trip request 1.csv` has 14 source columns; the eight reported optional fields are actually absent from that file. The mapping card now distinguishes absent optional fields from source columns needing mapping, shows the source mapping count, and offers Complete optional fields to open the mapped editor for that file. Original headers are saved separately, so manually completed fields do not appear as original CSV columns or alter original-value provenance. A browser-side helper check against the actual headers of CDO 1/2, Cebu 1/2 and Davao 1 confirmed that every source column maps. A completion check added unit CBM `0.25` while retaining supplied Total CBM `3.50` and identical original values. No source rows were imported, database changes applied, or builds/type checks run in this follow-up. Existing unrelated edits and their whitespace were retained.

The subsequent UI request authorized Playwright inspection and workflow checks. This pass changed frontend components and services only. No backend files, SQL files, migrations or operational database records were changed.

### Updated workflow

1. **Upload CSV:** select CSV/XLSX files. Selection reads the files and opens the preview; it does not create trips, masters, stops, products or cargo.
2. **Preview:** the separate CSV preview card shows every original header, including unmapped columns. Rows are paginated in groups of 50; every row remains reachable. Multiple files/worksheets have a file selector. Mapped fields can be edited without losing original cells. Column mapping lives in a separate, collapsed panel.
3. **Import CSV:** Check CSV runs the existing read-only server preview/duplicate checks. The explicit Import CSV button then loads the checked rows into the trip draft and advances to details. Durable draft saves continue using the existing recovery API; operational import requests wait until Save trip.
4. **Complete details:** review dispatch/group destinations, warehouses and destination identities/locations in separate panels. Choose trucks, drivers and trucking companies; review and confirm the existing cargo proposal. A CSV's truck name remains source text, not an assumed physical vehicle.
5. **Review and save:** review assignments and a separate source-table card, acknowledge applicable duplicate/unmapped/CBM warnings, then Save trip. Existing source identities, batch IDs, cargo finalization and retry protection remain in use. Completed saves disable repeat submission; Done closes Add Trip and refreshes the underlying Trips workspace.

The manual form now has four steps: Trip details, Stores & products, Assignments, Review. The competing single-group legacy import path was removed from this dialog. Stores have labeled search fields and grouped location details; product rows keep their main inputs compact and put extra fields behind Details. Store/product editing no longer includes import controls or truck/cargo editors. An expandable table preview is separate from the inputs. Both wizards show a two-by-two step navigation on narrow screens.

Trucking companies default from the selected truck and can be changed in the CSV cargo panel. After cargo finalization, the existing assignment API updates only company fields that differ. The company identity is retained in the saved proposal. A partial company failure leaves trip/products/cargo intact; retry or reopen checks the same assignments without reimporting source rows or reallocating cargo. These company updates are separate API writes, rather than part of the cargo transaction. Their failures are explicitly reported as incomplete details. This avoids changing database functions or schema during a UI-only task.

The Trips workspace refresh is deferred until closing the import dialog, avoiding a background table refresh on each retry. Import errors scroll into view. A saved draft without a checked preview reopens at Preview rather than showing an empty details step.

### Files changed in the UI pass

| File | Change |
| --- | --- |
| `frontend/src/components/admin/AddTripForm.tsx` | Four manual steps, one CSV entry point, separate assignments/preview, clearer store/product cards and labels, Save trip/Done behavior, mobile layout. |
| `frontend/src/components/admin/BulkTripImport.tsx` | Staged upload/preview/import-to-draft/details/review workflow, company save retries, recovery navigation, deferred refresh and completion handling. |
| `frontend/src/components/admin/TripImportPreview.tsx` | New separate original/mapped table panel, all source columns, file selection, row pagination and mapped edits. |
| `frontend/src/components/admin/SearchableRelationshipEditor.tsx` | Optional form presentation with contextual placeholders; existing spreadsheet presentation remains the default. |
| `frontend/src/components/admin/TripCargoPlanner.tsx` | Labeled truck/driver controls, default and selectable trucking company, responsive assignment cards. |
| `frontend/src/services/cargo-planning.ts` | Optional company identity/label in cargo proposals; signatures include a selected company while retaining compatibility with older proposals without one. |
| `frontend/src/services/trip-import.service.ts` | Reuse assignment reads/updates to finish company details idempotently and retain clear partial-save messages. |
| `docs/add-trip-workflow-implementation.md` | Actual UI behavior, browser checks and validation limits. |

### Executed browser checks and limits

Playwright opened the running application at localhost, and the user logged in manually. The existing screens were inspected before editing. Claude was not callable in this environment: neither a Claude tool nor executable was available, so no Claude design review is claimed.

- Inspected the updated manual and CSV dialogs on desktop and at a 390px mobile viewport. Dialog scroll width matched its 390px client width; expanded product details also stayed within the dialog. Original CSV tables scroll horizontally within their own panel.
- Parsed a 55-row, 23-column CSV through the running app; verified the final page, the extra source column, mapped edits, and all 55 valid rows through the real read-only backend preview. Import CSV advanced to details with zero source-commit requests.
- Inspected truck/driver/company lookup selection using actual read-only master lookups. Proposed 55 allocations totaling 13.75 CBM against a 30 CBM truck, then confirmed the proposal.
- Intercepted operational write requests for the save check. Simulated a company-update conflict, retried, and reopened the saved batch. Across these actions there was one 55-row source commit request, one cargo-finalization request, and two company patch attempts (the injected failure and its successful retry). Reopening and saving did not add a source commit, cargo finalization or unnecessary company patch. Final save became disabled, and Done closed the dialog.
- Inspected the actual outgoing row: edited model `UI-EDITED-MODEL`, original model `UI-MODEL-0`, separate unit/total CBM strings `0.25`, and the extra client note all survived.
- Checked two CSV files and switched their preview. Both groups inherited the selected existing dispatch `DISPATCH261021-1`; advancing through Import CSV added no operational commit request.
- Used real store/product lookups in the manual form, entered quantity `2` and Total CBM `0.5`, inspected the separate table preview, advanced through Assignments, and verified the final intercepted creation payload and dialog completion.

Write interception covered draft saves, source commits, cargo finalization, company patches and manual trip creation. Authentication bootstrap and read-only application requests were allowed. An intentionally injected HTTP 409 and temporary interception errors during harness setup are not production application failures; the interception rules were corrected and removed after verification. No synthetic source rows were sent to live persistence endpoints. No test trips/products were created or deleted in Supabase. These checks verify the UI and request/retry behavior, **not actual database persistence**. No build, TypeScript check, unit/integration suite or deployment was executed in this UI pass. Live persistence/concurrency acceptance remains follow-up work requiring authorization.

## Current integration results

### Successfully executed database changes

Target project: `hdmknewarynwpbrhfgai`. Before changes, inspection confirmed `transaction_read_only=off`, the existing column/relationship definitions, functions/triggers, RLS/grants, report projections and migration history. Normalized master-identity preflight found no duplicate groups for warehouse codes, customer codes, product SKUs, customer-scoped store codes or physical truck plates. No operational records were merged, deleted or renumbered.

Each application below returned `success: true`; the ledger was read after each migration. These are executed changes, rather than prepared SQL awaiting approval.

| Order | Repository migration | Supabase migration name | Confirmed version |
| --- | --- | --- | --- |
| 1 | `backend/migrations/2026_11_15_optional_trip_booking_fields.sql` | `optional_trip_booking_fields` | `20261021131909` |
| 2 | `backend/migrations/2026_10_21_trip_source_import.sql` | `trip_source_import` | `20261021131927` |
| 3 | `backend/migrations/2026_10_21_trip_workflow_completion.sql` | `trip_workflow_completion` | `20261021131943` |
| 4 | `backend/migrations/2026_10_21_trip_import_recovery.sql` | `trip_import_recovery` | `20261021132154` |

The generated-reference trigger/function and unique reference index were already installed, despite the absence of a matching filename in the ledger. Existing convoy migrations and their relationships were also present. Neither set was replayed. The separate proposed tracking/planned-route migration files were not replayed; completion/recovery updated the installed route functions in place. Historical `PREPARED ONLY` comments in the applied source files describe their preparation stage; this ledger is the execution record, and the applied SQL files have been retained unchanged during this execution pass.

### Installed database objects and behavior

- Optional booking fields: trip warehouse/type/loading date, stop customer/store, and product/quantity/Total CBM can remain null. This does not remove the information required to identify imported destinations or confirm physical cargo allocations.
- Source persistence: 13 structured line-item columns supplement existing fields; `trip_line_items.source_warehouse_id` links the original warehouse to master data. `trip_import_batches`, `trip_import_groups`, and `trip_import_rows` retain source identities, originals, row outcomes, target relationships and retry metadata.
- Atomic creation and master reuse: `trips.creation_request_id`/`creation_payload` and its unique index support replay-safe creation through `create_trip_bundle_v2`. `resolve_trip_master_v1` and normalized unique indexes protect stable master identities without merging historical records. Existing dispatches remain grouped by `trips.dispatch_number` with separate trip positions and generated trip references.
- Cargo persistence: `apply_trip_cargo_plan_v1` and `finalize_trip_import_cargo_v1` save quantities/CBM into the existing assignment/cargo/stop tables. Source Total CBM remains distinct from unit CBM and from each truck's allocated CBM. Existing capacity/source-total/relationship guards remain installed; the recovery ratio guard also enforces proportional whole-unit splits on later edits.
- Recovery: batch draft/revision/update/error/outcome columns, the owner/update index, `save_trip_import_draft_v1`, and `workflow_import_plan_guard` support reopen, optimistic revision checks, preserved source outcomes, retryable unsealed plans and immutable confirmed plans. Draft saves and finalization coordinate through group locks. Successful source rows retain their IDs.
- Default drivers: `drivers.assigned_truck_id` references trucks with `ON DELETE SET NULL`; an active-default unique index and service-only `set_trip_default_driver_v1` maintain the preference separately from operational history.
- Assignment integrity: the within-trip driver guard and new assignment/trip schedule triggers enforce conflicts for active overlapping truck/driver assignments. Undated planned assignments remain unreserved; assigned active trips require complete dates. Released/archived/terminal history is retained and does not reserve resources.
- Verified locations: stores and warehouses have verification flags, reviewer/profile FKs and timestamps. Location guards invalidate changed points. Historical coordinates are retained and initially unverified. `tracking_route_context_v1` and `planned_route_context_v1` use verified coordinates and the selected assignment's stop scope; tracking also reads independent assignment progress.
- Reports: `v_tms_combined`, `v_dispatch_report`, `v_trip_booking`, and `v_trip_source_master` include structured source fields plus `_cargo_allocation_id`, `line_allocated_quantity`, `line_allocated_cbm`, and `assignment_stop_progress`. Existing columns and physical relationship IDs were preserved.

Post-application catalog inspection confirmed these columns, foreign keys, indexes, enabled triggers, RPC signatures, report columns and route function definitions. All three import tables have RLS enabled with no browser policies or browser table grants. Workflow/import/master/cargo/recovery/default-driver RPC execution is granted to `service_role`, and denied to `anon` and `authenticated`. No application RPC was invoked for verification.

### Application implementation and source review

The existing implementation carries DN, source Truck Name, SP, SO No., Customer Model, Product Category, Warehouse, Province, City, unit CBM, original Total CBM and SO Approval Date through CSV/XLSX preview, API, persisted source rows/line fields and report mappings. Original cells remain in provenance. Existing-dispatch targeting, destination review, shared cargo proposals, per-truck capacity/default-driver selection and saved-import recovery were retained rather than recreated.

The frontend file inventory is in section A and the recovery additions in section G below. Core files are `AddTripForm.tsx`, `BulkTripImport.tsx`, `ImportDestinationReview.tsx`, `TripCargoPlanner.tsx`, `TripConvoyPanel.tsx`, `tripCsv.ts`, `tripImportFiles.ts`, `MasterDataView.tsx`, and the cargo-planning/import/lookup/master-data services. No additional frontend edits were necessary during this database execution pass.

Backend integration includes `trip.routes.ts`, trip/import/assignment/master-data controllers, and the workflow, recovery, import, assignment, availability, lookup, convoy, report, master-data and routing services. The existing explicit JSON parser on import cargo finalization was preserved. Source/report field names, batch revisions, saved-plan equality, source-to-line IDs, route paths and default-driver mappings were reviewed against the installed objects.

This pass additionally corrected `backend/src/services/trip-workflow.service.ts`: PostgreSQL deadlocks (`40P01`) and lock timeouts (`55P03`) now produce HTTP 409 workflow conflicts, matching assignment handling, instead of invalid-input errors. Cargo finalization rejects an array where a plan object is required. Existing prepared fixes retained include canonical recovery signatures, all three report line-ID aliases, independent assignment stop routing/progress, exact decimal cargo payloads, and assignment update/reactivation conflict checks. Detailed earlier file changes are preserved below.

SQL files applied are listed in the ledger above. The revised source-import, completion and recovery SQL contains the earlier interrupted work; no additional SQL edits or supporting migration were needed after live compatibility inspection. The prior unrelated working-tree changes were retained.

### Remaining issues and follow-up

There is no remaining migration/access blocker for these four migrations. Schema installation is confirmed; runtime correctness, successful end-to-end persistence and concurrent-write behavior have **not** been demonstrated because testing is prohibited in this phase.

Administrative data preparation remains necessary: review historical coordinates before enabling precise routing, configure positive truck capacities/default drivers, resolve ambiguous or unknown master identities, and select an origin when imported rows contain multiple warehouses. Geocoding depends on the configured provider and credentials; no geocoder request or routing calculation was executed. Incomplete imported cargo stays safely unallocated until its proposal is valid and confirmed. The DR-first packing heuristic can require manual rearrangement and does not promise an optimal packing solution.

After testing is separately authorized, validate optional manual saves/retries, CSV/XLSX field preservation and report output, existing-dispatch targeting, warehouse/product reuse, verified-location updates/routing, truck capacities/splits/progress, overlapping assignment races, cross-window draft revisions, close/reopen, partial import failures and allocation retries without duplicates. Type checks, builds, unit/integration/end-to-end tests, manual UI checks and actual persistence checks are all deferred. No test records, test transactions, sample imports or deployments were performed during this execution pass.

## Historical implementation records

Sections A-H below preserve the earlier source-only and interrupted-session records. Their statements about read-only failures, unapplied migrations and earlier feature scope describe those sessions only; the current results and confirmed ledger above supersede their pending-work status.

## A. Files modified for this request

Paths below are relative to the repository root. Existing unrelated changes were retained.

| File | Reason |
| --- | --- |
| `frontend/src/components/admin/AddTripForm.tsx` | Preserve structured source fields, original customer model and decimal text; inherit the selected dispatch; add stable creation identity, default drivers and the shared cargo proposal; retain optional blank fields and use a lighter dispatch card. |
| `frontend/src/components/admin/BulkTripImport.tsx` | Separate setup, expandable preview, destination review, cargo proposal and save review; edit source cells with originals retained; inherit dispatch; resolve warehouse identities; lock batch contents during retries; finalize confirmed cargo after source rows succeed; distinguish newly created trips in results. |
| `frontend/src/components/admin/ImportDestinationReview.tsx` (new) | Review customer/store identity, existing verification, geocoder candidates, editable address/geography and map pin; require explicit verification and conflict override. Candidate search starts when the review panel opens, without persisting its results. |
| `frontend/src/components/admin/TripCargoPlanner.tsx` (new) | Shared truck/driver selection, exact capacity display, full/over-capacity messages, DR proposals, whole-group moves, allocation edits, splits and explicit confirmation. |
| `frontend/src/components/admin/SearchableRelationshipEditor.tsx` | Disable conflicting truck/driver IDs in selectors. |
| `frontend/src/components/admin/tripCsv.ts` | Keep validated decimal text rather than rounding it through numeric conversion. |
| `frontend/src/components/admin/tripImportFiles.ts` | Preserve original CSV/XLSX cells separately from editable mapped values, including duplicate header positions. |
| `frontend/src/pages/Admin/views/MasterDataView.tsx` | Compact Stores/Products tables and explicit edit action; group modal fields into identity/location/details; field errors; location verification controls; avoid imposing new creation requirements on legacy record edits. |
| `frontend/src/services/cargo-planning.ts` (new) | Decimal arithmetic for conservation, capacity, missing-total calculation and DR-first distribution; validate truck/driver uniqueness, whole-unit splits and quantity/CBM proportions. |
| `frontend/src/services/trip-import.service.ts` | Carry warehouse mappings, destination decisions and original values; acknowledge created-trip metadata; call cargo finalization and invalidate affected caches. |
| `frontend/src/services/lookup.service.ts` | Expose truck default driver and store coordinate/verification metadata to selectors. |
| `frontend/src/services/master-data.service.ts` | Expose verification capability and exclude unverified saved points from precise map choices. |
| `frontend/src/services/api.service.ts` | Retain actionable trip/import database setup errors instead of replacing them with a generic server error. |
| `backend/src/controllers/trip.controller.ts` | Route requests with a stable creation ID through atomic bundle creation and preserve typed API errors. |
| `backend/src/routes/trip.routes.ts` | Add authenticated cargo finalization for imported trip groups. |
| `backend/src/services/trip-workflow.service.ts` (new) | Validate atomic creation/finalization requests and return clear setup/conflict errors from database functions. |
| `backend/src/services/trip-bundle.logic.ts` | Accept source decimal strings and reject duplicate drivers in the same submitted trip. |
| `backend/src/services/trip.service.ts` | Reject ambiguous product-code matches instead of taking an arbitrary first record. |
| `backend/src/services/trip-import.logic.ts` | Preserve original source values and flag missing geography without rejecting optional source fields. |
| `backend/src/services/trip-import.service.ts` | Sign original values with the preview, detect workflow setup requirements, validate destination decisions and warehouse IDs, and use the transactional import function. |
| `backend/src/services/lookup.service.ts` | Derive unambiguous active default drivers from existing `drivers.assigned_truck_id`; expose store verification through a schema-aware lookup. |
| `backend/src/types/lookup.types.ts` | Add default-driver and store location metadata to lookup types. |
| `backend/src/services/location-verification.schema.ts` (new) | Read-only capability check with a short cache so pending verification columns do not break legacy reads. |
| `backend/src/services/master-data.service.ts` | Validate coordinate pairs and reviewer metadata, invalidate changed locations, reuse the shared identity resolver when installed, and keep a legacy creation fallback. |
| `backend/src/controllers/master-data.controller.ts` | Pass the authenticated reviewer identity to master-data saves. |
| `backend/src/services/road-routing-read.service.ts` | Supply precise destination/origin coordinates only for verified master records. |
| `backend/migrations/2026_10_21_trip_workflow_completion.sql` (new, unapplied) | Prepare source-warehouse relationships, idempotent manual saves, safe master resolution, confirmed cargo persistence, import/location review and future-write integrity guards. |
| `backend/migrations/2026_11_04_proposed_tracking_atomic.sql` | Prepare verified-coordinate gating for tracking route contexts. |
| `backend/migrations/2026_11_05_proposed_planned_routes.sql` | Prepare verified-coordinate gating for planned route contexts. |
| `docs/add-trip-workflow-implementation.md` (new) | Record implementation, pending database requirements and validation status. |

## B. Causes addressed

1. **Source fields were lost in the manual CSV-to-form path.** Some client values existed only in notes or preview state, and the submitted line payload contained only the older fields. The payload now carries SP, PH truck source reference, DN, order item, both SO fields, both PO fields, original model, stocks, unit CBM, approval date, item status, warehouse, category and geography in their corresponding structured fields. Bulk import also keeps untouched original cells in provenance.
2. **Unit CBM and line totals need different meanings.** The source `CBM` column maps to `unit_cbm`; `Total CBM` maps to line `cbm`. Capacity sums use each line total once. Decimal text is retained. A missing manual total can be calculated with exact multiplication; a supplied total is preserved. Bulk discrepancies require acknowledgement and do not silently overwrite source totals.
3. **Existing dispatch selection was reset or lost.** Applying a manual CSV previously changed the dispatch mode, while the separate bulk dialog defaulted groups to a new dispatch. Manual imports now retain the selection, and bulk groups inherit it with a visible banner and explicit per-group override. The database uses the existing `trips.dispatch_number` grouping; it does not invent a dispatch foreign key.
4. **Master resolution could choose the first name match.** Shared database resolution now checks stable identities, rejects multiple matches and never overwrites an existing master with blank import values. Product-code service lookup likewise rejects ambiguity.
5. **Retries and allocation needed durable identities.** A creation UUID seals the manual payload. Import rows retain their existing source identities and batch IDs. Confirmed cargo has a sealed per-group plan, allowing an uncertain acknowledgement to be retried without allocating the same cargo twice.

These are code changes and intended outcomes, not runtime verification claims.

## C. Implemented behavior

- CSV/XLSX rows remain visible in a separate, paginated, expandable preview. Mapping, editable cells, original values, missing fields, duplicate warnings, row colors and import outcomes are available before and after saving.
- Trip setup, destination identity/location review, cargo distribution and final confirmation have distinct panels. The manual form retains its existing steps and optional blank fields.
- Warehouses match by code; an explicit warehouse mapping handles source names. Several source warehouses require an explicit trip origin or separate groups. Unknown code-only warehouses keep unknown address/coordinates blank.
- Customers reuse a unique identity; creating an unknown customer requires its code through master data. Stores are scoped to a customer and code or destination/geography. Products reuse SKU or an unambiguous model/category identity. PH TRUCK NAME remains source text and never becomes an assumed physical truck ID.
- Location review uses the existing configured geocoder and map. A candidate never verifies itself. Existing store verification is displayed when selecting a store; changed/conflicting confirmed locations require explicit review. Unresolved locations can remain unverified. Precise routing is gated on confirmed coordinates.
- Default drivers come from the existing truck assignment on driver records. Multiple active defaults require a manual choice. The driver can be overridden; the same driver/truck cannot be selected twice in a trip proposal. Existing dated availability checks in the manual form remain in place. Bulk-created trips are planned and do not infer a dated availability guarantee from a CSV truck name.
- The cargo suggestion tries whole DR groups first, then intact product lines, then exactly representable whole-unit splits. Adding another truck preserves the current proposal until the administrator recalculates or edits it. Moving a DR group does not alter its source identities or destination.
- Confirmation checks exact original quantity/Total CBM conservation, proportional splits, selected truck/driver identity and each truck's capacity. Unknown or nonpositive capacity blocks allocation confirmation. The database rechecks current capacity through the existing cargo integrity triggers.
- Manual bundle creation is one transaction. Import chunks retain per-row subtransactions: failed rows roll back their new masters/stops/trip together, while successful rows remain reported. Cargo finalization is a separate atomic transaction after the group's source rows succeed. If finalization fails, imported products remain safely unallocated and the same batch can retry it.
- Truck stop scopes and progress reuse the existing assignment-specific model. Existing delivery progress and unrelated assignments are not rewritten by these creation functions.

## D. Database changes required

`2026_10_21_trip_workflow_completion.sql` is prepared only. Review deployment dependencies explicitly rather than applying files by filename date:

1. Existing trip/assignment/master schema and optional booking fields (`2026_11_15_optional_trip_booking_fields.sql`).
2. Generated trip references (`2026_11_16_generated_trip_references.sql`).
3. Source-import schema and report projections (`2026_10_21_trip_source_import.sql`).
4. Existing convoy integrity schema (`2026_10_21_trip_convoy_integrity.sql`) and any previously approved related convoy changes used by this installation.
5. The new workflow completion migration, after database review.

The new migration prepares:

- `trip_line_items.source_warehouse_id` referencing warehouses.
- `trips.creation_request_id` and `creation_payload`, with a unique partial request index.
- `trip_import_groups.allocation_plan` for sealed cargo confirmation/replay.
- Store/warehouse `location_verified`, `location_verified_at` and `location_verified_by` (profile relationship). Historical coordinate values remain intact but initially unverified.
- Shared normalization and master resolution, manual bundle creation, import v2, cargo application and import cargo finalization functions. Execution grants are restricted to the service role.
- Location invalidation/coordinate guards and a future-write driver conflict guard within each trip.
- Normalized unique warehouse/customer codes, customer-scoped store codes, product SKUs and physical truck plates. Existing duplicate identities must be reviewed before these indexes can be approved; this migration does not merge history.
- Verified-coordinate guards in already installed tracking/planned route contexts, plus schema-cache reload notification. The two prepared routing migrations carry the same gating for later installations.

No new dispatch table, truck-default-driver table, cargo table or route calculation service is introduced. Existing relationships and cargo constraints are reused.

**Pending database features:** the updated manual Add Trip submits the creation UUID and requires `create_trip_bundle_v2`. Bulk persistence requires import v2; cargo confirmation requires its finalization function; verification writes require the added columns/guards. These features are not operational until the reviewed dependencies are applied and validation is authorized. Legacy callers without the creation UUID retain their existing backend save path. Preview can report pending setup without saving anything.

## E. Admin decisions and dependencies

- Resolve unknown customers, ambiguous product models, duplicate identities and source warehouse names through explicit master selection/maintenance. The sample CSV has no reliable customer code or physical truck plate for automatically creating those identities.
- Configure positive truck capacities and resolve ambiguous default drivers before confirming cargo. Multi-truck proposals require different drivers.
- Choose a trip origin when a group includes several source warehouses, or split the group.
- Review location candidates and historical coordinates. The geocoder must be configured and reachable; a failed or ambiguous search does not supply guessed routing coordinates.
- Supplied Total CBM remains authoritative after discrepancy acknowledgement. The allocation heuristic is not an optimizer: a suggestion may need manual rearrangement even when another arrangement could fit. Fractional or indivisible splits are never invented to make a proposal fit.
- Import source rows and cargo finalization deliberately have separate transaction boundaries. Closing an incomplete batch loses its in-memory proposal; retain the batch ID and finish it before starting another proposal. Durable draft recovery and cross-trip schedule reservations are outside these changes.
- Verify the prepared SQL against the target schema and review duplicate-index conflicts before approving deployment. Neither SQL syntax/schema compatibility nor application behavior has been executed for this request.

## F. Testing status

Tests, builds, manual import tests, and live database migrations were not executed, as requested.

Only source inspection and edits were performed. No live data was modified and no deployment was performed. Database persistence verification and UI/runtime validation remain pending authorization.

## G. Authorized database integration follow-up

### Live database inspection and execution status

The connected project URL was confirmed as `https://hdmknewarynwpbrhfgai.supabase.co`. Catalog reads inspected columns/types/nullability/defaults, relevant foreign keys and checks, indexes, triggers, RLS policies, RPC bodies/grants, report columns, and the Supabase migration ledger. Read-only REST schema metadata and relevant catalog definitions are retained in `backend/scripts/trip-workflow-schema-snapshot.json` and `backend/scripts/trip-workflow-catalog-before.json`.

The live schema differs from the previous assumptions:

- Generated `trip_reference`, its trigger function, trigger and unique index already exist. Do not replay the backfill or overwrite references.
- Convoy integrity, assignment-specific stops/progress, cargo allocations and related projections/history are already installed and recorded in the migration ledger. Do not recreate these tables or replay the old convoy migrations.
- Most optional booking fields are already nullable, but `trip_stops.customer_id` is still NOT NULL. The optional-booking migration is therefore still required.
- The import tables, extended line source fields, workflow RPCs, location verification fields and default-driver relationship are missing.
- Contrary to the earlier source-only assumption, live `drivers` has no `assigned_truck_id` column. The follow-up migration adds the explicit default relationship rather than deriving a permanent default from historical trips.
- Some live legacy report views identify cargo with `line_item_id`. The source migration now recognizes `_trip_line_item_id`, `trip_line_item_id` and `line_item_id` when appending fields.
- The existing route context functions include every trip stop. The follow-up migration replaces them with assignment-scoped, verified-coordinate contexts.
- Normalized duplicate-identity preflight returned zero duplicate groups for warehouse codes, customer codes, product SKUs, customer-scoped store codes and normalized truck plates. No records were merged, deleted or renumbered.

**Successfully applied migrations: none in this follow-up.** The authorized optional-booking migration was attempted, including its ledger insert in the same transaction. Supabase returned `25006` before the first ALTER could execute. A retry after the user reauthenticated returned the same error. Both attempts failed; neither changes nor ledger records are reported as applied. The session exposes read tools and `execute_sql`, but no `apply_migration` capability. A refreshed write-enabled MCP session is required; changing the local configuration alone has not refreshed this active connection.

### Follow-up files changed

The earlier file inventory remains in section A. These files were added or further changed during this integration follow-up:

| File | Follow-up change |
| --- | --- |
| `backend/migrations/2026_10_21_trip_source_import.sql` | Resolve all three live line-identity aliases when appending source report columns. Unapplied. |
| `backend/migrations/2026_10_21_trip_workflow_completion.sql` | Carry reviewed destination geography into new stores; keep durable source acknowledgements; integrate reviewed import schedules with atomic cargo finalization. Unapplied. |
| `backend/migrations/2026_10_21_trip_import_recovery.sql` (new) | Default-driver FK/unique active-default index and service-only setter; batch drafts/revisions/outcomes/errors and owner index; optimistic draft-save RPC; overlapping truck/driver schedule guards; assignment-specific verified routing contexts. Unapplied. |
| `backend/src/services/trip-import-recovery.service.ts` (new) | Owner-scoped saved-batch list/reopen/save APIs; derive Pending, Partially Imported, Awaiting Allocation, Completed and Failed states from durable source/plan records; retain failure reasons and IDs. |
| `backend/src/services/trip-workflow.service.ts` | Explicit input guards and setup messages, default-driver API service, recovery timestamps after confirmed finalization. |
| `backend/src/services/trip-import.service.ts` | Canonical signing survives JSONB object-key reordering on reopen; preserve field validation; retain import recovery metadata. |
| `backend/src/controllers/trip-import.controller.ts` | Retain unexpected chunk failure reasons for recovery. |
| `backend/src/routes/trip.routes.ts` | Saved-batch endpoints, default driver and driver availability endpoints; parse cargo-finalization JSON explicitly because import routes bypass the global JSON parser. |
| `backend/src/services/truck-availability.service.ts` | Driver schedule snapshots and overlapping active assignment checks; ignore archived, released and terminal historical assignments. |
| `backend/src/services/lookup.service.ts` | Preserve truck lookup availability while the default-driver column is pending. |
| `backend/src/services/road-routing-read.service.ts` | Read each assignment's actual stop scope and independent progress; retain verified-coordinate gating. |
| `frontend/src/components/admin/BulkTripImport.tsx` | Debounced server draft saves, explicit save, saved-batch list/reopen, revision handling, preserve latest edits before switching/closing, retry pending allocation without reimporting saved products; handle skipped external duplicates separately from owned cargo. |
| `frontend/src/components/admin/TripCargoPlanner.tsx` | Loading/delivery dates, explicit unreserved planning acknowledgement, truck/driver schedule conflicts in selectors, save chosen driver as truck default. |
| `frontend/src/components/admin/AddTripForm.tsx` | Check and exclude known overlapping driver schedules alongside existing truck availability checks. |
| `frontend/src/services/cargo-planning.ts` | Stable tuple-based signatures survive JSONB recovery; carry import schedule review. |
| `frontend/src/services/trip-import.service.ts` | Typed saved-batch/draft/default-driver APIs and recovery states. |
| `frontend/src/services/lookup.service.ts` | Driver availability API and optional existing-trip exclusion for schedule reads. |
| `backend/scripts/trip-workflow-schema-snapshot.json` (new) | Read-only live REST metadata snapshot; no credentials or operational rows. |
| `backend/scripts/trip-workflow-catalog-before.json` (new) | Relevant existing constraints/indexes/triggers/policies/function definitions retained before any migration. |
| `docs/add-trip-workflow-implementation.md` | Actual inspection, source changes, rejected execution attempts, dependencies and remaining blocker. |

### Required application order after the connection is refreshed

1. Apply `2026_11_15_optional_trip_booking_fields.sql` and record it transactionally. It removes the remaining customer requirement for blank manual stops; it fabricates no master IDs.
2. Retain the already installed generated-reference and convoy objects. They satisfy those dependencies without replaying their old migrations.
3. Apply the revised `2026_10_21_trip_source_import.sql`: 13 structured source fields, three import tables, provenance/idempotency indexes, service-only import function, appended report fields and the source master projection.
4. Apply `2026_10_21_trip_workflow_completion.sql`: source warehouse relationship, creation request/payload identity, sealed group allocations, source acknowledgements, store/warehouse verification and reviewers, shared master resolution, atomic manual bundle/import/cargo functions and identity indexes/guards.
5. Apply `2026_10_21_trip_import_recovery.sql`: default truck-driver relationship, durable draft/revision/error data and outcomes, recovery/default-driver RPCs, future-write resource schedule validation and assignment-scoped verified route functions. The existing routing ACLs remain service-only.
6. Record only confirmed executed SQL in the migration ledger and this report. The failed optional migration's proposed version `20261021100001` was not inserted by these attempts; inspect the ledger again before choosing execution versions.

The prepared recovery schema adds `drivers.assigned_truck_id` (truck FK with SET NULL), a unique active default per truck, `trip_import_batches.workflow_draft`, `workflow_revision`, `updated_at`, `last_error`, `workflow_outcomes`, and an owner/update index. Source acknowledgements and timestamps are also declared idempotently in the completion migration so its import RPC never depends on a later missing column. No new operational cargo/dispatch tables are introduced. Drafts/import tables remain inaccessible to browser roles; authorized backend services enforce owner scope.

### Recovery and scheduling behavior in the new source

Before importing any source chunk, the frontend persists the preview, original/editable file data, destinations, target dispatch/trip, reviewed cargo plans, flags and stable batch ID. Edits are also saved after a debounce and through an explicit Save draft action. Reopening loads the same signed rows and IDs, durable source outcomes and sealed cargo state. Completed product rows are not resubmitted. An unfinished cargo proposal can be adjusted/reconfirmed and finalized independently. Cross-window draft revision conflicts require reopening rather than overwriting another editor. Closing waits for the latest save; an explicit unsaved-close action is offered if persistence fails.

Pending plans survive failed allocation transactions. Failure reasons remain stored rather than being erased by routine draft autosave. New source signatures use deterministic object ordering; cargo signatures use explicit ordered tuples, preventing JSONB's key reordering from invalidating otherwise unchanged recovered drafts.

Known overlapping active truck/driver schedules are excluded in selection UI and rechecked at the database write boundary. Database triggers cover assignment writes and trip date/status changes under a transaction lock. Complete schedules reserve resources. Undated planned assignments remain explicitly unreserved until dates are supplied; assigned trips cannot be activated with an incomplete schedule. Released, archived and completed/cancelled historical records do not reserve resources. Existing historical rows are not rewritten by the new guards.

Default-driver edits change the explicit master preference only; they do not rewrite historical operational assignments. Coordinates require explicit reviewer confirmation. Tracking and planned routing use only verified store/warehouse coordinates and the selected truck's assigned destinations/progress.

### Remaining issues and testing status

The database integration is **not complete**: the active Supabase connection still rejects writes. None of the prepared database-dependent functionality can be claimed operational yet. Once a refreshed write-enabled session is available, apply the reviewed dependencies above and update this report with actual Supabase confirmations. No deployment or live sample trip/import has been performed.

Tests, builds, manual CSV import tests, and end-to-end tests were not executed, as requested. Catalog/schema reads and migration prerequisite inspection were performed because they were explicitly authorized; they are not application acceptance tests. Runtime, persistence and concurrency behavior remain untested.

## H. Focused completion after interrupted edits

This pass inspected the existing repository changes and completed only assignment conflict handling and `2026_10_21_trip_import_recovery.sql`. The existing frontend/import/report changes were retained. No tests, builds, application execution or database commands were run in this pass.

Assignment handling now uses the same preflight for creation, resource changes and reactivation. It checks duplicate trucks/drivers within the trip and overlapping active schedules across trips, excluding the assignment being edited. It checks only the requested driver rather than loading every driver. Released assignments bypass reservation checks; terminal/archived trips do not reserve resources, and unchanged resource updates do not trigger new historical schedule requirements. An undated PLANNED assignment remains unreserved; an active assigned trip needs both schedule dates. Driver selection is preserved when omitted, including explicit unassignment with null; the service no longer borrows a driver from another trip's history. Known database constraint and concurrency conflicts retain HTTP 409 responses through the already completed controllers.

The recovery migration now checks its source/workflow/convoy/routing dependencies before changing objects and uses a bounded migration lock wait. Draft revisions reject null, negative and unsafe-integer values, use null-safe comparison, and validate the files/plans/targets/preview structure. Submitted source data, explicit targets and inherited dispatch targets cannot be changed by autosave. Group row locks serialize draft saves with cargo finalization; a guard rejects finalizing a stale persisted proposal, and confirmed plans cannot be replaced or cleared. Owner checks run before locking another batch's groups. Existing errors/outcomes and unrelated operational records are retained. Trigger helper execution is revoked from public/browser roles. Report extension checks all required physical IDs and rejects partially installed projection columns instead of silently treating them as complete.

Files edited in this focused pass:

- `backend/src/services/assignment.service.ts`: shared truck/driver conflict preflight, safe update/reactivation handling and consistent conflict classification.
- `backend/src/services/truck-availability.service.ts`: optional driver-ID scope for the shared preflight; existing public callers retain their behavior.
- `backend/migrations/2026_10_21_trip_import_recovery.sql`: dependency checks, draft/plan integrity, locking and projection/permission completion described above.
- `docs/add-trip-workflow-implementation.md`: this scoped completion record. Existing assignment-controller typed error handling was inspected and preserved.

Remaining work: apply the missing source/workflow dependencies and this migration through a write-enabled Supabase connection, record only confirmed executions, then perform tests/builds/runtime and concurrency validation when authorized. This focused pass did not apply migrations or recheck the earlier read-only connection failure. The application preflight provides early feedback; concurrent-write guarantees depend on the database guards being installed. SQL syntax and target-schema compatibility remain unexecuted.
