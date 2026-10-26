# System-wide performance implementation — 26 October 2026

## Scope and evidence

Inspected the shared spreadsheets, navigation and cache services, report and master-data APIs, CSV pipeline, realtime dependencies, Storage enrichment, and database catalog/query statistics. Changes preserve the current UI and business rules. No operational data was deleted, no policies were disabled, and no backend services were restarted or deployed.

The live database currently has approximately 29 trips, 120 line items and 60 stops according to catalog estimates. This is too small to establish performance at tens of thousands of records. Cumulative query statistics showed a trip-master listing query with 126 calls and an approximately 80.62 ms mean; that is historical database execution time, not an end-to-end UI measurement. Read-only EXPLAIN inspection found existing stop indexes already in use, so a speculative duplicate index was not added. No EXPLAIN ANALYZE or production load generation was used.

Automated tests and Playwright were **not run**, as requested. Compilation, targeted lint, production bundling, source review, catalog inspection and migration verification are the verification performed here.

## Module findings and changes

| Module | Root cause / existing bounds | Implementation |
| --- | --- | --- |
| Trips / Dispatch / report sheets | Workspace warmup fetched every inactive sheet and tracker. Static imports loaded heavy grids before use. Selection summaries repeatedly searched the same rows. | Removed inactive-sheet preload; lazy report and tracker modules; indexed selected-row lookup and Set membership. Existing server paging, query filters/sort, cell patching, formula and virtualization behavior retained. |
| Transmittal tracker | Shared eager workspace loading and repeated linear membership checks when formatting selections. | Lazy module loading and Set-based selection membership; existing editing, document links and paging retained. |
| Database: customers, warehouses, stores, store contacts, products, trucks, drivers, trucking companies | Visited hidden sheets remained mounted with active effects. Returning to the tab discarded state. Broad invalidation evicted unrelated reference data. | Retain visited workspaces with React Activity; pause hidden effects; reuse fresh cache on return and revalidate expired/invalidated data. Cache the static database source catalog. Shared spreadsheet fixes apply to every master-data sheet. Existing server-side search/sort/pagination and dependency-aware mutations remain. |
| Users: Admin & Staff / Truckers | Same hidden-sheet effects and remounting behavior. Optional legacy user-list photo enrichment made one signing call per image. | Retained Activity workspaces and fresh-cache checks. Batched profile-picture signing. The current user directory already uses server-side pagination/search/sort; its table rendering uses the shared virtual spreadsheet. Legacy `/users` full-directory behavior was not removed or silently repurposed. |
| Operations: loading, unloading, backload, offload | Existing server pagination and virtualized events table were already present. Receipt/evidence lists signed every image individually. | Shared virtualization memory fix and batched signed URLs for receipts and linked delivery evidence. Existing edit and refresh behavior retained. |
| Flexible/custom tables | Existing server paging and shared virtual row rendering were already present. Measured-row cache retained deleted/searched-out keys. | Shared virtual row measurement pruning and bounded rendering while inactive. Formula bindings, permissions, shared formatting and pinned columns retained. |
| Trip detail / delivery workspace | Required delivery evidence was signed with individual Storage requests. | Batch signing with the original expiry and required-image failure behavior. Removed a confirmed unused constant. |
| Home / overview | Dashboard lists and monitoring are already bounded; map/chart bundles are substantial. | Shared cache/realtime and lazy resource-module improvements apply. No speculative dashboard SQL rewrite. Optional legacy recorded-location map still loads saved map locations when explicitly used. |
| Calendar, notifications, profile activity | Calendar is date-scoped, notifications and activity are bounded/paged. | Shared invalidation deduplication and reference-cache preservation apply. Existing event permissions and notification delivery remain. |
| Billing / requests and small local tables | Some views use local/sample collections rather than large operational queries. | No unrelated rewrite. Existing rendering and navigation preserved; no claim of database-scale performance for sample-backed views. |
| CSV upload / preview / review | Large file parsing ran on the UI thread; preview transformed all rows to render 50. Review mounted every product row. Cargo readiness was repeatedly recalculated per product. | Parse files of at least 256 KiB in a disposable worker using the original parser/mapping. Map only the visible 50 preview rows. Review pages are 50/100/200 rows with deferred search and memoized projections. Compute cargo readiness and allocation indexes per trip group. |

## Shared rendering and navigation

- Removed `useWorkspacePreload.ts` after verifying its only production caller. Removed its unused ready-tracking state.
- Heavy report and tracker grids load when visited. Database and Users retain state and scroll between navigation, with hidden effects paused through React Activity.
- The virtual row hook previously expanded to **all loaded rows** when measurement was disabled. It now keeps its bounded row window, focused/editing row and spacer geometry. Removed obsolete height entries when dataset keys change.
- Cell-edit, formula, pinning, sizing, visibility, selection and collaboration implementations were retained. No replacement table library was added.
- Report edit diagnostics are opt-in via `VITE_REPORT_EDIT_DIAGNOSTICS=true` in development, rather than logging every read by default.

## API, reference data, Storage and realtime

- Reference-option projections are reused with a WeakMap keyed by the exact API-cache response. Freshness, session isolation and authorization remain owned by the existing cache.
- Realtime cache invalidation now follows explicit master-data/lookup dependencies. Importing a product line no longer evicts every lookup, and changing a customer still invalidates dependent store labels. Truck image and default-driver dependencies are retained.
- Repeated invalidation of the same prefix/report cache is deduplicated within an incoming change-feed batch. Existing shared subscription management, conflict handling, saved-edit semantics and recovery notifications were retained.
- A shared `signStoragePaths` helper deduplicates paths and uses Storage bulk signing in batches of 100 instead of one HTTP request per image. Applied to report product images, profile options, legacy managed-user images, operations receipts and delivery evidence. It only receives paths from authorized reads; no shared signed-URL cache was introduced. Required evidence still fails if its URL cannot be generated; optional photos remain optional.
- Abandoned queued truck-image reads are discarded before HTTP starts. Forced refreshes and existing concurrency/cache caps remain.
- Location-verification schema checks now share the existing deduplicated capability cache instead of independently probing repeatedly.
- Eligible-assignee lookup formerly paged through the entire Auth directory. It now checks only the at-most-500 candidate IDs through a service-only database function. Save-time eligibility checks remain authoritative. Missing-function fallback supports environments where the additive migration has not yet deployed; other errors fail closed.

## CSV and automation

- Large CSV/XLSX parsing runs in a module worker and releases the worker on success, error or message-deserialization error. Small files and environments without Worker support retain the original parser path.
- Unmapped-column membership is calculated once per file, not repeatedly per source cell.
- Preview mapping and validation lookup maps are memoized. Review filtering/search projections and row fingerprints are reused; only the current review page is mounted.
- Group-level readiness and cargo allocation lookup work is reused across product rows, without changing validation or save payloads.
- Backend existing-product candidates are indexed by DR **and product model**, avoiding irrelevant comparisons inside large DR groups. Exact duplicate comparisons and existing record protection remain.
- Existing import RPCs, row isolation/fallback, duplicate prevention and dispatch/trip/stop/truck relationships were preserved. Import commit throughput was not benchmarked and no operational import was executed.

## Database migrations applied and verified

Both applied through the Supabase migration API to the configured project, with matching local migration files and bounded lock timeouts:

1. `20261026055922_table_source_reference_performance_indexes.sql`
   - `trip_line_items(source_warehouse_id)`
   - `offload_items(trip_line_item_id)`
   - `backload_items(trip_line_item_id)`
   - Additive source-reference indexes justified by missing-FK-index inspection. All three verified valid and ready. No existing indexes, objects or constraints removed.
2. `20261026060321_bounded_assignee_account_lookup.sql`
   - Adds `eligible_assignment_profile_ids_v1(uuid[])`, capped at 500 IDs.
   - Fixed `search_path=pg_catalog`; execution revoked from PUBLIC, anon and authenticated, granted only to service_role. Grants verified after application.

Post-change security and performance advisors were inspected. Existing advisories still include other [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS initialization plans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), unused/duplicate indexes and security configuration findings. They were not bulk-fixed: unused indexes may serve infrequent operational paths, and changing policies/functions without a dependency audit would risk correctness or access control. Existing security findings should be reviewed separately; this pass did not relax them.

The CSV recovery/details functions and trip-only delivery-location column were also confirmed present. No additional prerequisite migration was required in this pass.

## Earlier requested bulk deletion

- Fixed the selection action that only appeared for one parent trip.
- Added Admin-only Delete all trips using an identity-only paged snapshot across all Trips records, independent of current filters/search, matching the user's explicit scope.
- Counts and impact are shown for confirmation; records created after the snapshot are excluded.
- More than 20 parent trips are handled in bounded 20-trip transactions, with one current-session confirmation. Existing authorization, financial/retention checks, feature flag, database deletion rules, image cleanup and collaboration events remain.
- Acknowledged deletions are removed locally; a later batch failure retains unconfirmed IDs and stops. Completed batches are not rolled back or automatically replayed. Preflight reads can be cancelled.
- Added/updated regression test source, but did not run it. No actual trip deletion was executed.

## Verification and remaining limits

- Frontend and backend TypeScript checks passed.
- Targeted ESLint passed for the changed review/preview, deletion dialog/service, workspace, worker, lookup and realtime files. This is not a claim that the entire legacy repository is lint-clean.
- Vite production build passed (3,307 modules). Separating grids reduced the observed ResourceView chunk from approximately 276 KiB in the earlier build during this pass to approximately 24 KiB; report and tracker code are now separate chunks. This is build output, not a measured navigation latency improvement.
- `git diff --check` passed. Automated tests, browser checks, visual/zoom checks and production-scale benchmarks were not run.
- Large optional map/export bundles remain (approximately 1.89 MB map chunk and 930 KB ExcelJS chunk before gzip). The import worker includes XLSX tooling (approximately 947 KB). Build warnings remain visible rather than being suppressed.
- Some paged spreadsheets accumulate pages as the user scrolls; virtualization bounds DOM rows, not all retained data. Long-session heap behavior and deep offset/count query costs need representative-scale profiling before claiming a hard memory/latency bound.
- Broad operational report invalidation and authoritative refetches remain where joined/computed rows cannot safely be reconstructed from an event. This pass reduces redundant invalidation; it does not claim all realtime changes became individual-row patches.
- User-selected exports, select-all identity collection, legacy directory helpers and optional saved-location mapping can still intentionally traverse many records. They are not eager tab-open preload paths.
- Large parser results still need structured cloning into the browser; this reduces parsing work on the UI thread but does not guarantee zero main-thread work for huge files.
- Bulk deletion is a bounded synchronous request and may encounter infrastructure timeouts for extremely large snapshots; partial acknowledgements and current database state must be respected. Per-confirmation snapshot cap is 100,000 parent IDs.
- The application code must be deployed/restarted through the normal release process. The two database migrations are already applied. No percentage speedup or guaranteed tens-of-thousands-row scrolling result is asserted without the browser/load verification the user excluded.
