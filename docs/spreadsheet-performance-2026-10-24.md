# Spreadsheet reliability and scale work — 2026-10-24

## Status and verification boundary

Backend/frontend changes and the database migrations below were implemented. Both application builds and the targeted automated regression suite pass. Large-data tests use disposable PostgreSQL and browser fixtures, not thousands of new production trips.

The connected Supabase project temporarily stopped responding to SQL, Auth health and REST reads during verification. Connectivity subsequently recovered. Authenticated checks returned HTTP 200 for all eight report endpoints. Live export and two-page authenticated Realtime checks subsequently passed as described below. Separate Admin-versus-Staff browser sessions were not exercised.

The database initially had 30 saved demo trips, 60 stops and 40 assignments. Later read-only checks showed zero trips, followed by one trip and 56 Master List rows. This task did not delete those records or update that new trip. After explicit user approval and connectivity recovery, the guarded restore was executed. Read-back confirms **31 trips: 30 restored demos and the untouched non-demo trip**.

## Root causes and fixes

* **Formula 503:** 100 composite physical row identities, each about 173 characters, produced oversized PostgREST GET URLs. Reading 50 identities succeeded while 120 failed. Reads now batch by encoded byte size as well as item count; recursive dependencies stay bounded. The existing formula table/RPC already existed and was not replaced.
* **Master List formulas:** the backend allowlist omitted product-level columns such as `quantity`, and formula source verification used stop-level rows for product-level identities. The allowlist and physical source projection now match the actual sheet. Saved arithmetic formulas were read back and evaluated to 14 without changing operational quantities.
* **Formula conflict delays:** the RPC raised serialization error `40001` for a version conflict, causing retries. It now raises explicit HTTP conflict `PT409`; the service returns 409, retains version checks, and rejects circular dependencies. The original saved formula's content hash remained unchanged during verification; the temporary verification overlay was removed.
* **Missing CSV view:** the existing reviewed Master List migration had not been applied. Its view and authorized save/import RPCs were installed. This removes the repeated `v_trip_master_csv` 404 capability probes.
* **Slow search:** the frontend deliberately removed source-row search from the server request and scanned every page. Search now stays in PostgreSQL, including generated trip identifiers, before sorting/counting/pagination.
* **Slow Master List SQL:** single-record lateral lookups were flattened into expensive nested-loop plans. Keeping the existing uniqueness condition plus an explicit `LIMIT 1` preserves results and prevents that plan. The live 120-row projection had an identical content hash before and after this change.
* **Other full scans:** active-trip counts and quick filters previously enumerated all matching trip IDs and sent them back in `IN` URLs. These predicates now remain in SQL views. Report route labels use one bounded query instead of a sequence of relationship reads.
* **Trip Exceptions:** its configured legacy view denied SELECT to `service_role`. The backend read grant was restored; browser grants were not expanded. Legacy plural reason fields are mapped to the API's display fields.
* **Navigation during upstream failure:** stalled identity-provider reads could occupy the shared authorization read gate indefinitely. Verification reads and session bootstrap now have deadlines. Upstream outages fail closed with 503 rather than falsely expiring a valid session; invalid tokens still fail with 401.

## Shared loading architecture and coverage

`useSpreadsheetInfiniteScroll` observes the viewport and content, loads near the bottom, fills short pages, prevents overlapping submissions, resumes after a confirmed page, and pauses for drafts, saves, loading or recoverable errors. Manual retry remains available. Query changes reset vertical position; appending pages does not deliberately reset scrolling.

`useVirtualSpreadsheetRows` renders a window plus overscan and keeps the focused/editor row mounted. It uses stable physical IDs, measured/configured row heights, and spacer geometry. Expanded Operations detail rows participate in measurement. Header heights, pinned columns, and horizontal synchronization retain their existing components.

Coverage:

| Surface | Data loading | Rendering |
|---|---|---|
| Master List, Dispatch Monitoring, Dispatch Report, Trip Booking, Store Calling, Combined Report component | 50-row server pages; automatic append | Shared variable-height virtualization |
| Transmittal Tracker | Existing paged endpoint; automatic append; query-wide selection/export | Shared variable-height virtualization |
| Operations reports table | Existing SQL filtering/sorting/count endpoint; automatic append; lightweight sheet-wide identity selection | Shared variable-height virtualization, including expanded rows |
| Warehouses, Trucks, Trucking Companies, Stores, Store Contacts, Products | Existing 30-row server pages; shared automatic loader | Existing shared grid/virtualization retained |
| Admin & Staff, Truckers | Existing authorized directory pages; same shared loader/grid | Same shared virtualization |
| Custom/flexible spreadsheets | New bounded server pages and case-insensitive server search; only transitive formula dependencies are included separately | Shared virtualization and stable-ID shared row heights |

Full-dataset sort/filter/search stays on the server. Append merges preserve confirmed rows rather than overwriting edits with overlapping older pages. Report pagination now has deterministic physical tie breakers. POD files and POD records have distinct identities instead of collapsing multiple files belonging to the same stop.

Existing Realtime listeners and deferred-edit gates remain in place. Reconciliation rereads the loaded prefix rather than every historical page. Query caches have bounded historical entries, with mounted report windows protected from eviction. Unnecessary duplicate preloading was removed. Home's two per-trip detail requests were replaced with one authorized batched read and batched private-image signing.

Exports explicitly traverse all matching authorized pages, not the rendered window. Report exports retain current search/filter/sort and reject changed totals or duplicate identities. Tracker exports no longer have the previous fixed 20,000-row rejection. Pagination remains stable offset/range pagination for the existing arbitrary spreadsheet sorts; this work does not claim transactional snapshots across concurrent multi-page exports.

## Applied database changes

1. Existing `2026_11_17_proposed_master_list_csv.sql`: restored CSV projection, nullable source page field and authorized existing-workflow RPCs.
2. `2026_10_24_spreadsheet_query_performance.sql`: case-insensitive search projections and eleven paging/relationship indexes.
3. `2026_10_24_flex_paged_search.sql`: service-role-only custom-row search projection.
4. `2026_10_24_active_trip_listing.sql` and `2026_10_24_active_trip_listing_plan.sql`: active-transaction visibility without client ID scans or full report-join planning.
5. `2026_10_24_formula_conflict_response.sql`: explicit conflict response; no formula value changes.
6. `2026_10_24_report_route_projection.sql`: route display labels in one SQL read.
7. `2026_10_24_report_filter_flags.sql`: server-side quick-filter predicates and demurrage lookup index.
8. `2026_10_24_master_list_lateral_plans.sql`: bounded single-scope lookups and billing lookup index.
9. `2026_10_24_report_parent_projection.sql`: parent references for display/sorting without a second network lookup.
10. `2026_10_24_trip_exception_service_read.sql`: backend-only legacy report read grant.

Thirteen indexes were added in total. Existing operational foreign keys, integrity triggers, authentication requirements and RLS policies were not disabled. New helper views are service-role-only. The explicit installed report projection catalog excludes expensive search/filter expressions from returned list cells.

## Measured results

These are repeatable local PGlite measurements using the application's actual report definitions and indexes, with **10,020 trips, 40,080 Master List rows and 309,618 related fixture records**. They are not production latency promises and do not include internet/Auth latency.

| Query | Before | After |
|---|---:|---:|
| Master List first 50 rows | 10,048 ms | 3,041 ms |
| Master List deep page | 10,028 ms | 3,634 ms |
| Master List exact count | 5,419 ms | 468 ms |
| Master List case-insensitive search | 10,070 ms | 3,875 ms |

Operations' actual narrow page projection took 771 ms in the optimized large fixture. A separate 30,000-row isolated query test verifies indexed paging, sorting and an unloaded mixed-case match. No Mapbox requests are generated by those fixtures.

Earlier authenticated Playwright checks loaded 2,000 report rows with only 35 mounted data rows and found row 9,999 via server-adapter search. The final isolated production-mode run loaded 500 report rows with 36 mounted rows, paged Database with 39 mounted rows, saved a deep edit on Enter, resized a stable-ID row, selected/deselected all 10,000 matching records, and confirmed no mobile page overflow at 390px. Its writes remain intercepted.

After connectivity recovered, authenticated Playwright opened all six Trips sheets, all six Database sheets and both Users sheets without backend error responses. Direct authenticated reads of all eight report endpoints returned HTTP 200. A formula read for all 176 current Master List identities succeeded. A live Excel export contained 176 data rows plus its header while the grid had only 50 mounted rows. Two independently connected browser pages using the existing Admin session received one shared row-height change event and read back the saved height; the temporary demo-row formatting change was restored immediately. This proves cross-page propagation, not separate Admin/Staff principal coverage.

The restored Home showed 28 simulated truck markers. Hover disclosed Demo/Simulated GPS; selecting a marker showed its assignment and delivery progress; Back to All Trucks restored fleet mode; clicking the selected marker again opened Trip Details with the correct second-truck assignment query parameter. At the nationwide fleet zoom, nearby truck markers can overlap; a topmost marker was used for the interaction check.

## Tests, builds and reproduction

The targeted 35-test suite covers formula storage/recalculation/role denial/CAS/cycles/transaction rollback, byte-bounded IDs, 10,000-row page merging, 10,001-row selection, 30,000-row indexed queries, scoped report edits/search, Tracker/Operations pagination, flexible-table permissions/dependencies, authorization outages, and guarded demo restoration.

From `backend`:

```powershell
node --import tsx --test tests/auth-upstream-unavailable.test.ts tests/spreadsheet-scale.test.ts tests/spreadsheet-formula-storage.test.ts tests/flexible-table-pagination.test.ts tests/flexible-table.validation.test.ts tests/report-source-scope.test.ts tests/trip-detail-report.test.ts tests/trip-source-report.test.ts tests/tracker-pagination.test.ts tests/operations-pagination.test.ts tests/report-edit-persistence.test.ts tests/report-read-budget.test.ts tests/report-read-timing.test.ts tests/postgrest-search.test.ts tests/demo30-restore.test.ts
node scripts/benchmark-spreadsheet-queries.mjs 334
node --import tsx scripts/build-spreadsheet-fixture.mjs
```

The fixture build uses a clearly isolated test account, lives under ignored `.playwright-mcp`, and never replaces the application build. Its browser runner intercepts every API operation. Generated screenshots, logs and compiled fixture output stay ignored. Both regular application builds pass; Vite still reports the existing large-chunk/dynamic-import advisories.

## Demo restoration and cleanup

Thirty previously removed demo trips were restored after explicit user approval. No thousands-scale data was added to the connected project; large fixtures live only in disposable local databases/browser interception.

User approval to restore the previous 30 trips is recorded in the conversation. `scripts/prepare-demo30-restore.mjs` generated `migrations/proposals/2026_10_24_demo30_restore.sql` from the approved original payload: at most 1,139 missing records across 19 tables. It validates the active Admin coordinate reviewer, statuses, reserved namespace, identities and relationships; inserts only missing IDs; preserves existing edits; checks cargo totals and responsible stops; and rolls back on collisions or integrity failures. Its local test passes repeated/partial restoration, preservation of an unrelated operational trip and rejection of a namespace collision.

**Restoration executed successfully through Supabase MCP.** Verified namespace totals: customers 4; trucking companies 3; products 6; trip types 1; warehouses 8; trucks 40; drivers 40; stores 60; trips 30; assignments 40; stops 60; cargo lines 120; assignment stops 60; cargo allocations 120; loading reports 25; unloading reports 36; incidents 4; trip events 255; driver updates 227. These are the verified complete namespace totals; existing reference records were preserved rather than reinserted. Statuses are 18 IN_PROGRESS, 5 PLANNED and 7 COMPLETED. There are 28 explicitly simulated GPS events. Reuse the original exact-ID manifest and guarded `2026_10_24_demo30_cleanup.sql` for future explicitly authorized cleanup. No cleanup was executed by this task. Planned routing remains enabled. All 33 eligible assignment road routes were regenerated through Mapbox and verified in the hourly cache after respecting retry cooldowns. The existing guarded alignment script placed the 28 static demo GPS fixes on their own cached routes; no live telemetry, sessions or consent records were created.

## Remaining verification

* Separate Admin/Staff browser-session propagation and every legacy report's export combination were not exhaustively exercised. The shared authorized paths and targeted role/transaction tests are covered.
* Existing chart-size warnings occur when retained Home charts are hidden during tab navigation; this work did not redesign those charts. Vite reports existing large-chunk/dynamic-import advisories.
* Custom-table search matches stored values and expressions; it does not materialize formula results into operational data or database search columns.
* Offset pagination is reconciled through existing Realtime/refetch gates. A continuously changing dataset can require retrying an export/selection; it is never reported as a complete truncated export.

No commits, pushes or deployments were performed. Unrelated pre-existing worktree changes remain intact.

## Files changed in this optimization task

Backend: `src/config/{http,supabase,report-projections}.ts`; `src/controllers/flexible-table.controller.ts`; `src/middleware/auth.middleware.ts`; `src/routes/trip.routes.ts`; `src/services/{flexible-table,operations-report,report,spreadsheet-formula,trip-image,trip-route,trip,user-activity,home-trip-details}.service.ts`; `src/services/operations-pagination.ts`; `src/utils/{postgrest-batches,report-read-timing}.ts`.

Frontend: `src/components/admin/{DatabaseSpreadsheet,OperationsReportsView,ReportDataView,TransmittalTrackerView,UserActivityHistory}.tsx`; `useOperationalFormulas.tsx`; `useVirtualSpreadsheetRows.ts`; `useWorkspacePreload.ts`; new `useSpreadsheetInfiniteScroll.ts`; `src/context/AuthContext.tsx`; `src/pages/Admin/views/{FlexibleTablesView,OverviewView}.tsx`; `src/services/{admin-preload,api,flexible-table,operational-formula,operations-report,report,transmittal-tracker,trip}.service.ts`; `report-row-identity.ts`; new `spreadsheet-pages.ts`.

SQL: the ten new `backend/migrations/2026_10_24_*.sql` files listed above, plus the existing reviewed Master List migration applied to Supabase. Restoration adds `backend/migrations/proposals/2026_10_24_demo30_restore.sql` and its generator `backend/scripts/prepare-demo30-restore.mjs`.

Verification: `backend/scripts/benchmark-spreadsheet-queries.mjs`, `build-spreadsheet-fixture.mjs`, `verify-spreadsheet-{scale,isolated}.playwright.js`; `backend/tests/{auth-upstream-unavailable,demo30-restore,flexible-table-pagination,spreadsheet-formula-storage,spreadsheet-scale}.test.ts`; updated report scope/detail/source and Tracker regression tests; two sanitized scale fixtures under `backend/tests/fixtures`.

Pre-existing Home, tracking and original demo-seed changes remain in the worktree and are not attributed to this optimization task.
