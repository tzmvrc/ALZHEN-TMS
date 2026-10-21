# Trips table redesign and preview setup repair

## Why preview returned 503

Read-only inspection confirmed `trip_import_rows` is absent from the live PostgREST schema (`PGRST205`) and `trip_line_items.unit_cbm` does not yet exist (`42703`). Preview previously depended on those tables for duplicate checks and threw 503 before returning parsed source rows.

Preview now returns HTTP 200 with all parsed/validated rows, `setup_required: true`, `duplicate_check_status: unavailable`, and an explanatory setup notice. Saving remains disabled until the required schema exists. Genuine upstream failures still return an error rather than implying duplicate checks succeeded. Revalidate after the approved migration is applied.

**No live migration or sample import has been executed.** The migration was executed only in an isolated, in-memory PostgreSQL test fixture using the approved development-only PGlite dependency.

## Product row creation service (toolbar controls retired)

The empty spreadsheet slots were presentation/formula rows. They had no physical `trip_line_items.id`, selected parent creation flow, or backend batch-create operation. Existing cell editing correctly rejected slots without a real product identity; typing into them did not create persistent cargo. Also, the Master List's original monitoring projection displayed stops rather than each physical product, so simply inserting cargo could still hide it after refresh.

The creation service and draft lifecycle below remain implemented, but the latest UI request removes Add Row, Add related, Add dispatch and Use client column order from the toolbar. Add trip is the only creation control. The following describes the retained service behavior, not currently exposed toolbar controls:

- Select a physical row and choose **Add Row**, with a custom count from 1–100 per draft batch (including 5 or 10).
- New rows appear directly below that visual anchor, inheriting only trip/stop/customer context. DR, product/model, quantities, source identifiers and allocations are not copied.
- Enter data in cells or the existing formula bar. Enter/blur updates the new-row draft; typing has no database side effects. Escape cancels the selected edit. **Save new rows** is the explicit database commit, and **Cancel new rows** removes unsaved drafts.
- A missing parent opens a trip/stop picker instead of inventing a trip or stop. Related controls create actual delivery stops or truck assignments through their existing APIs. **Add dispatch** creates a new dispatch with its first trip through the existing Add trip form; dispatches remain the existing reference grouping, with no new dispatch table.
- `POST /trips/:id/stops/:stopId/line-items/batch` validates each nonempty row, verifies parent ownership, inserts the batch with preassigned unique UUIDs, and confirms the actual saved records. Conflict handling does not overwrite existing rows and makes an uncertain acknowledgement safe to retry.
- Empty placeholders are rejected. The service changes only line items, never siblings or stop/trip-level business values.
- Existing TSV paste can populate several new draft rows. Values pass the same field validation before final batch creation.
- Unsaved drafts remain visible if their anchor leaves the loaded page. A browser refresh warns about unsaved drafts. After saving, refresh applies normal sorting/filtering; the draft notice explains this ordering behavior.
- Draft rows do not emit presence/draft writes for nonexistent records. Plain formula-bar source edits work immediately; formula expressions are enabled after the row exists in the database.
- The Master List uses line-granularity source projection after migration. Before activation, it uses the existing booking view and enriches stop execution fields, so manual product creation remains visible after refresh even while new source-only fields await schema setup.

Truck-specific cargo selection remains in **Trip details → Truck allocation**. New rows start unallocated, and PH TRUCK NAME is never used as a plate or an allocation instruction.

## Column order, names and categories

The default Master List begins with these exact adjacent source labels:

`SP`, `PH TRUCK NAME`, `DN`, `DR`, `Order Item No.`, `Customer Name`, `Ship To`, `SAP SO No.`, `SO NO.`, `Customer PO`, `PO NO.`, `Product Category`, `Province`, `City`, `Customer Model`, `Qty`, `stocks`, `Warehouse`, `CBM`, `Total CBM`, `SO Approval Date`, `Item Status`.

Admin fields follow: Dispatch Number, Trip Number, Loading Date, Estimated Delivery Date, Assigned Truck / Plate Number, Assigned Driver, Trucking Company, Truck Allocation, Assigned Warehouse, Trip Status and remaining planning/report fields. Driver execution fields follow that group. Existing fields are retained rather than removed.

The shared metadata property `fieldCategory` carries `EXCEL`, `ADMIN` or `DRIVER` independently of edit permissions:

| Responsibility | Default header background | Default text | Examples |
|---|---|---|---|
| EXCEL | `#DBEAFE` | `#1E40AF` | All 22 client columns |
| ADMIN | `#F3E8FF` | `#6B21A8` | Dispatch/trip references, dates, assigned truck/driver/company, allocation, operational warehouse/status |
| DRIVER | `#DCFCE7` | `#166534` | Warehouse/store arrival, unloading/departure, delivery status, POD and backload/offload fields |

Category colors apply only to headers by default; data cells stay neutral. Explicit saved header/column formatting has priority. Light category colors stay consistent regardless of system theme. Clicking a category label slides horizontally to its first visible column without changing vertical position. Existing resizing, hiding, pinning, reordering, selection and role permissions are retained. Default source labels no longer render through a forced uppercase class.

Intentional saved positions, colors and aliases are respected. The client-order reset control has been removed; existing saved layouts are preserved.

## Fields and migration

The exact 22-field mapping and ownership remain documented in [trip-source-import.md](trip-source-import.md). Existing quantity/total CBM, DR, SAP SO, customer PO, internal PO, customer model, customers and destinations are reused. Thirteen missing source fields/snapshots are added to `trip_line_items`, not to `trips`. Approval timestamps remain source-local timestamps, identifier fields remain text, and decimal strings reach PostgreSQL numeric without JavaScript rounding.

The required live migration is **`backend/migrations/2026_10_21_trip_source_import.sql`**, after the existing generated-trip-reference migration. The source migration also prepares provenance tables, row-safe bulk import, source report projections and indexes for `(fingerprint)`, `(batch_id, group_key, status)` and `(dr_number, customer_model)`.

Before live execution, review the SQL and approve the target database. Restart/reload the running backend if it does not watch source files, refresh the page, and validate the import again after schema activation. No automatic live SQL execution is wired into preview or row creation.

## Bulk processing and performance

- Source rows remain distinct even when DR/DN/SP repeat. File identity plus row position prevents exact re-import duplicates; business matches require review and do not overwrite operational edits.
- All four PH TRUCK NAME aliases map to the same source field; no truck/driver/location data is inferred.
- Preview renders 50 rows per page, including when the input contains 5,000 rows.
- Frontend imports use 100-row backend chunks rather than one API call per product, and refresh mounted reports after the overall attempt, not after every inserted line.
- Customer/store/stop lookup caches avoid repeating identical relationship queries for every row inside a chunk. Duplicate preview matching indexes rows by DR instead of scanning every uploaded row for every database result.
- Existing Master List virtualization and paged collection loading remain active. Row and formula identities include the physical line item ID.
- Unknown columns containing data require explicit mapping review. Their values are retained under `__unmapped_columns` in source provenance rather than silently discarded.
- Supplied CBM mismatches remain review warnings. Cebu request 2, row 32 supplies 4.11600000 instead of the calculated 3.43000000; the source value is kept only after explicit review confirmation.

## Verification

The prepared SQL ran in an isolated in-memory PostgreSQL fixture with foreign keys and normalized trips/stops/line items. Persisted counts were checked by SQL, not inferred from a success message:

| Fixture | Verified result |
|---|---|
| Four actual client files | 23 + 37 + 56 + 44 = **160 persisted line items** |
| Master List source view | **160 physical product rows** |
| Re-import of all four files | Still **160**, all repeated source identities skipped |
| Sum of supplied Total CBM | **158.11870000** |
| Large source import | **5,000 persisted lines**, one stop, 50 backend chunks |
| Manual Add Row batch | Five unique new children; retry keeps the count unchanged |
| Existing sibling | Original quantity remains 17 |
| Empty manual draft | Rejected, no placeholder persisted |
| Existing trip append | Both existing trucks, delivered stop, trip status and old cargo preserved |

Browser checks use the actual React workspace and importer with mocked APIs. Current navigation checks verify category links, live row filtering, repeated-cell highlights, column lookup without filtering records, light colors under a dark system theme, and a compact scrollbar synchronized in both directions and across sheet changes. The scrollbar occupies approximately one-quarter of the footer at the right of the tabs. Search waits 250 ms after typing. The Master List searches enriched table values literally, including generated references and punctuation, using cached authorized pages and reading any remaining pages in batches of 200. Large uncached searches must read their remaining pages; they do not discard later matches. Auto fit sits immediately left of the compact scrollbar and measures every loaded record, including virtualized rows, against its header (60?600 px bounds). Fit widths are local to the retained sheet; explicit column resizing still works. The grid hides its full-width horizontal bar and forwards horizontal/Shift wheel gestures to its scroll position. Horizontal scrolling skips virtual row measurement. Product row creation remains covered by isolated backend fixtures. A 5,000-row setup-required preview returns HTTP 200, renders only 50 rows at once, exposes 100 pages, and keeps saving blocked until setup.

Frontend and backend production builds pass. Targeted source, creation, report editing, duplicate, numeric/date, multiple-truck and read-budget tests pass. Existing lint debt in the formula hook remains (its pre-existing `any` type and dependency warnings); new standalone dialog, import and category modules pass their focused lint check.

These fixture tests do not exercise every live trigger, permission policy or actual network race. Live rollout and production data writes still require explicit approval. The source CBM discrepancy and proposed import grouping remain deliberate user decisions in the preview.

## Main files added or extended

- Backend: `config/trip-source-columns.ts`, `services/trip-row-creation.service.ts`, `trip-import.logic.ts`, `trip-import.service.ts`, `report.service.ts`, report metadata types, routes and the prepared source migration.
- Frontend: `ReportDataView.tsx`, `TripRowContextDialog.tsx`, `BulkTripImport.tsx`, `useOperationalFormulas.tsx`, `trip-row-drafts.ts`, `trip-column-categories.ts`, import/report/trip API services, `ResourceView.tsx` and category CSS.
- Tests: `trip-source-persistence.test.ts`, `trip-table-redesign.test.ts`, `trip-sheet-navigation.browser.js`, `trip-search-pagination.browser.js`, `trip-import-setup.browser.js`, with existing source/report regression suites retained.
- Development dependency: `@electric-sql/pglite` for isolated PostgreSQL verification only.
