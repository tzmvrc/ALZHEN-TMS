# Client trip request import

Implemented in the existing Add trip dialog and Trips spreadsheet. No live data has been imported and no live migration has been executed. The prepared migrations have been executed and verified in an isolated in-memory PostgreSQL fixture.

## Database approval required

Review and execute `backend/migrations/2026_10_21_trip_source_import.sql` only after approval. The existing generated-trip-reference migration must already be installed. The source import migration is transactional and reloads PostgREST's schema cache.

The migration:

- Adds 13 nullable source fields to `trip_line_items`, without changing historical rows or normalized master data.
- Creates `trip_import_batches`, `trip_import_groups`, and `trip_import_rows` for provenance, retry destinations and idempotency.
- Adds a service-role-only import function, `import_trip_source_rows`. Authenticated ADMIN/STAFF users reach it through the backend, never directly from the browser.
- Appends source columns to existing line-granularity booking, dispatch and combined views, preserving their current definitions and allocation joins.
- Adds `v_trip_source_master`, a projection of the existing Dispatch Monitoring view expanded by line item. Only the Master List requests it; Dispatch Monitoring keeps its existing stop granularity.

Before the live migration, bulk preview returns HTTP 200 with a setup-required state and explicitly unavailable duplicate checks; saving stays disabled. The Master List uses the existing booking view to retain physical product IDs and enriches delivery execution fields from existing stop records. The migration and actual row persistence have been tested in an isolated PostgreSQL fixture, including all 160 samples, exact re-imports and 5,000-row batches. Live rollout, live trigger/policy compatibility and true concurrent-session acceptance remain pending explicit live approval.

## Inspection

No Supabase MCP tool was available. Read-only inspection used the authenticated PostgREST OpenAPI schema and repository migrations. It confirmed that `quantity`, `cbm`, DR/SAP/customer/internal PO identifiers and `customer_model` already belong to `trip_line_items`; source-specific identifiers, stocks and approval timestamps were absent. Existing trips, stops, normalized customers/destinations, generated references and truck allocations are reused.

## Exact mapping

All source values are retained in provenance as strings/null. Database ownership is shown below. New category, warehouse and geography snapshots avoid overwriting shared product/store/warehouse records during import.

| CSV label | Existing or new TMS field | Ownership |
|---|---|---|
| SP | `sp_reference` (new) | Line item |
| PH TRUCK NAME | `ph_truck_reference` (new) | Line item source reference |
| DN | `dn_reference` (new) | Line item |
| DR | `dr_number` (reused) | Line item |
| Order Item No. | `order_item_number` (new text) | Line item |
| Customer Name | `trip_stops.customer_id` → `customers.name` (reused) | Normalized customer |
| Ship To | `trip_stops.store_id` → `customer_stores.name` (reused) | Normalized destination |
| SAP SO No. | `sap_so_number` (reused) | Line item |
| SO NO. | `so_number` (new) | Line item |
| Customer PO | `customer_po_number` (reused) | Line item |
| PO NO. | `internal_po_number` (reused; no duplicate `po_number`) | Line item |
| Product Category | `source_product_category` (new snapshot) | Line item |
| Province | `source_province` (new snapshot); copied to newly created destinations | Line item / new destination |
| City | `source_city` (new snapshot); copied to newly created destinations | Line item / new destination |
| Customer Model | `customer_model` (reused; no implicit catalog changes) | Line item |
| Qty | `quantity` (reused numeric) | Line item |
| stocks | `stock_quantity` (new numeric) | Line item |
| Warehouse | `source_warehouse` (new snapshot) | Line item |
| CBM | `unit_cbm` (new per-line numeric; catalog `products.unit_cbm` remains separate) | Line item |
| Total CBM | `cbm` (reused numeric; no duplicate `total_cbm`) | Line item |
| SO Approval Date | `so_approval_date` (new timestamp without time zone) | Line item |
| Item Status | `item_status` (new text) | Line item; separate from delivery/trip statuses |

`PH TRUCK NAME`, `PHTRRUCK`, `PHTRUCK` and `TRUCK NAME` all map to the same source field. They do not resolve plates, drivers, physical trips or truck assignments.

## Workflow

1. Open **Add trip → Import CSV / XLSX**. Select any number of files within the request's 20 MB preview payload size. XLSX includes every populated worksheet. The old operational CSV draft loader remains available, but redirects client source formats to the complete importer to prevent field loss.
2. Open each file's mapping section. Correct detected mappings, inspect missing optional fields and unmapped columns. Missing optional fields become null.
3. Explicitly review trip groups. A file is proposed as one group for review, never inferred from PH TRUCK NAME. Rename all rows in a file or edit individual row groups to split or combine them.
4. For each group, choose a new dispatch/new trip, a new trip in an existing dispatch, or new delivery stops in an existing trip. Search existing trips/dispatches to select an exact record. Confirm missing-customer/destination creation separately; otherwise unmatched or ambiguous names fail without changing master records.
5. Validate the preview. All rows remain accessible across pages of 50; this is a display page size, not an import limit. Headers show all 22 canonical labels.
6. Review any potential business matches and CBM discrepancies. Exact duplicate source rows skip automatically; ambiguous matches require explicit authorization to create separate cargo. Supplied Total CBM is preserved after review, never silently recalculated.
7. Confirm grouping and import all valid rows. Requests use chunks of at most 100, process every group, and continue until all selected rows have outcomes.
8. Review imported/skipped/failed/invalid counts, error details and batch reference. Download failed/invalid rows with their errors. Retry incomplete rows using the same batch. Network uncertainty is safe to retry because the database checks committed source identities.

## Grouping, provenance and safety

- One physical `trip_line_items.id` is created per source row, including repeated models or repeated DR/DN/SP references.
- A row identity hashes canonical file contents plus its position among nonempty data rows. Renaming a file, changing header aliases or changing grouping does not bypass exact-file duplicate detection.
- A separate business fingerprint includes DR/DN/SP, Order Item No., SAP/SO/PO identifiers, customer, destination and product. Changed files and matching pre-existing manual cargo are flagged for verification; they are not silently skipped or overwritten.
- Exact identical rows within the same document remain distinct because they have different source positions.
- Provenance records batch, filename/worksheet, physical row number, canonical source values, identity, fingerprint, saved line ID, status and write errors. Preview validation errors are available in the preview/error download; no operational record is created for an invalid row.
- The import function serializes import checks and wraps each source row in a PostgreSQL subtransaction. A failed row rolls back its new trip/stop/master inserts and records a failure; successful rows remain committed. Repeating a successful source identity skips it, even if its cargo was subsequently deleted.
- Stops are reused only within the same import group and batch, by normalized customer/destination plus source geography. Existing delivery stops are not overwritten when appending cargo to an existing trip.
- Imports do not create physical truck/driver allocations or change existing assignments, cargo allocations, delivery progress, POD, billing or operational statuses. New trips start PLANNED; source Item Status stays separate.
- Signed previews prevent editing source values between validation and commit without revalidation. Database duplicate checks run again at commit to cover concurrent imports.
- Decimal strings go directly to PostgreSQL numeric. Report reads cast numeric cargo values to text at the database boundary, preserving precision before JavaScript parsing. Approval timestamps retain source-local wall-clock time without timezone conversion.

## Spreadsheet integration

The existing spreadsheet, selected-cell/formula editing lifecycle, layouts, column customization, scrolling and exports are retained. New source fields use physical line item IDs for writes and collaboration drafts. Numeric values save as decimal strings on Enter/blur, not while typing. Source approval timestamps use validated text editing to avoid browser timezone shifts. Master List collection paging keeps each physical line identity, so a stop with three products displays three selectable lines. New columns participate in report search (text/numeric as appropriate), exact filters, sorting, layouts and normal exports. Approval timestamps use exact timestamp filtering rather than invalid timestamp ILIKE queries.

Realtime still observes the existing trips/stops/line-items/allocations tables. A completed import also invalidates report/trip caches and signals mounted spreadsheets to refresh, including after partial completion.

## API changes

- `POST /api/trips/import/preview`: read-only validation and duplicate inspection; returns every row and a signed manifest.
- `POST /api/trips/import/commit`: accepts batch UUID, group, confirmed destination, verification choices and up to 100 signed rows; returns row-level imported/skipped/failed outcomes.
- `GET /api/reports/dispatch-monitoring?source_lines=true`: Master List line-granularity projection after migration; other requests retain the original monitoring view.
- `GET /api/reports/:key/columns?source_lines=true`: source-aware Master List metadata. Existing booking/dispatch/combined metadata gains source columns after migration.
- Existing scoped line-item PATCH endpoints now support source fields and decimal quantities. No new edit module is introduced.

## Verification

| File | Parsed / valid rows | Quantity | Supplied Total CBM |
|---|---:|---:|---:|
| CDO trip request 1.csv | 23 | 43 | 5.1923 |
| CDO trip request 2.csv | 37 | 206 | 37.7556 |
| Cebu trip request 1.csv | 56 | 227 | 29.6880 |
| Cebu trip request 2.csv | 44 | 281 | 85.4828 |
| Total | **160** | **757** | **158.1187** |

There is one review warning: **Cebu trip request 2.csv, physical CSV row 32**, model `TWT-80Z2`: Qty 10 × CBM 0.34300000 = **3.43000000**, but supplied Total CBM is **4.11600000**. All 160 rows are parseable/valid; this row requires explicit CBM review confirmation before commit. No source file was changed.

Automated coverage includes actual sample row counts, all four aliases, all 22 labels, repeated product/DR retention, decimal precision, optional nulls, timestamps, invalid values, physical row numbering, canonical duplicate identities, signed-preview tampering, potential-match detection, CBM confirmation, multi-sheet XLSX and physical edit identity. Existing CSV, trip bundle, report editing and read-budget tests were also run.

Browser smoke testing used the real React importer with all four actual files and mocked APIs: 160 rows, four accessible preview pages, confirmation gates, a 160-row result, and no body overflow at a 390px viewport. No live API writes were made. Frontend/backend production builds passed. The SQL migration, persisted sample count (160), Master List count (160), exact re-import protection, decimal total 158.11870000, five-row manual creation/retry and 5,000-row batching have now been verified against an isolated embedded PostgreSQL fixture. Existing trucks, delivered stops and sibling cargo are preserved by an append test. Live deployment and real multi-session concurrency acceptance remain separate from these fixture checks.

## Files changed

| Area | Files |
|---|---|
| Database | `backend/migrations/2026_10_21_trip_source_import.sql` |
| Import backend | `backend/src/services/trip-import.logic.ts`, `trip-import.service.ts`, `trip-import.schema.ts`; `backend/src/controllers/trip-import.controller.ts`; `backend/src/routes/trip.routes.ts`; `backend/src/app.ts` |
| Report/edit backend | `backend/src/config/trip-source-columns.ts`, `cell-draft-fields.ts`; `backend/src/controllers/report.controller.ts`; `backend/src/services/report.service.ts`, `trip.service.ts`, `collaboration.logic.ts` |
| Import frontend | `frontend/src/components/admin/BulkTripImport.tsx`, `tripImportFiles.ts`, `tripCsv.ts`, `AddTripForm.tsx`; `frontend/src/services/trip-import.service.ts` |
| Spreadsheet frontend | `frontend/src/components/admin/ReportDataView.tsx`; `frontend/src/pages/Admin/views/ResourceView.tsx`; `frontend/src/services/report.service.ts`, `report-editing.config.ts` |
| Tests | `backend/tests/trip-source-import.test.ts`, `trip-source-api.test.ts`, `trip-source-report.test.ts`, `trip-line-item-edit.test.ts` |

Decisions needed before live import: approve the migration, confirm the proposed trip group destinations, decide whether to create unmatched customers/destinations, and confirm or correct the one supplied CBM discrepancy. These are exposed in the workflow; no physical truck allocation is inferred from the CSV.
