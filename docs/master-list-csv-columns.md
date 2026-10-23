The Trips → Master List follows the headers, spelling, and order from
`2026 Trip Booking Details.xlsx - Master List.csv` in Downloads. Its original
`2026 Trip Booking Details.xlsx` workbook was also inspected for the actual
Master List header fills, theme, table style, and conditional formatting.

Page No. is omitted from the table and Excel export at the user's request. The
active layout has 43 source columns, starting with Dispatch no., followed by the
existing system action. Page-number storage, import support, and saved settings
remain intact. The 44-position mapping below documents the original source CSV.

The former layout used the separate 22-field cargo source spreadsheet and then
appended operational fields. Of the booking CSV's 44 columns, 29 already had a
visible equivalent and 15 needed to be exposed: Page No., Trip type, Email date,
Added by, Incident Date, Backload Reason, No. of Box (Backload), IR Status,
IR Submitted Date, Backload comments, No. of Box (Offload), Offload Reason,
POD status, POD comments, and Invoice no.

Existing equivalents were reused, including Comments/Remarks, Trucker GC
Name/Trucking Company, Ship From/Warehouse, DR/DR Number, Delivery completed
date/Finish Unloading, and LBC tracking no./LBC Tracking Number. Existing
operational fields outside the CSV remain in their underlying tables and other
sheets. The existing Trip Details action follows the displayed source columns.

| CSV position and header | Storage / relationship |
| --- | --- |
| 1. Page No. | `trip_line_items.source_page_no`; existing `trips.page_no` is the fallback |
| 2. Dispatch no. | `trips.dispatch_number` |
| 3. Added to report? | `trips.added_to_report` |
| 4. Comments | `trips.remarks` |
| 5. Trip type | `trips.trip_type_id` → `trip_types.name` |
| 6. Letter status | `trips.letter_status` |
| 7. Plate no. | Existing primary truck assignment → `trucks.plate_number` |
| 8. Trucker GC Name | Existing primary assignment → `trucking_companies.name` |
| 9. Trip no. | Existing generated trip reference presentation; remains read-only |
| 10. Email date | `trips.request_received_at` |
| 11. Added by | `trips.created_by` → existing profile |
| 12. WH CODE | `trips.warehouse_id` → `warehouses.code` |
| 13. Ship From | Same warehouse → `warehouses.name` |
| 14. Ship To | `trip_stops.store_id` → `customer_stores.name` |
| 15. Customer Name | `trip_stops.customer_id` → `customers.name` |
| 16. DR | `trip_line_items.dr_number` |
| 17. SAP SO No. | `trip_line_items.sap_so_number` |
| 18. Customer PO | `trip_line_items.customer_po_number` |
| 19. PO NO. | `trip_line_items.internal_po_number` |
| 20. Product Category | `trip_line_items.source_product_category`, falling back to product category |
| 21. Customer Model | `trip_line_items.customer_model` |
| 22. Qty | `trip_line_items.quantity` |
| 23. Total CBM | `trip_line_items.cbm` |
| 24. Province | `trip_line_items.source_province`, falling back to destination province |
| 25. City | `trip_line_items.source_city`, falling back to destination city |
| 26. Incident Date | Scoped `incidents.incident_date` |
| 27. Backload Reason | Scoped `backloads.reason` |
| 28. No. of Box (Backload) | Scoped `backloads.number_of_boxes` |
| 29. IR Status | Scoped `incidents.status` |
| 30. IR Submitted Date | Scoped `incidents.submitted_date` |
| 31. Backload comments | Scoped `backloads.comments` |
| 32. No. of Box (Offload) | Scoped `offloads.number_of_boxes` |
| 33. Offload Reason | Scoped `offloads.reason` |
| 34. Delivery status | `trip_stops.delivery_status` |
| 35. Delivery completed date | `trip_stops.finish_unloading_time`, with a date and time editor |
| 36. POD status | Stop/DR-scoped `pod_records.pod_status` |
| 37. Signed DR uploading date to Google Drive | `trips.signed_dr_upload_date` |
| 38. Transmittal date | `trips.transmittal_date` |
| 39. TMS date | `trips.tms_date` |
| 40. TMS done by | `trips.tms_done_by` → existing profile |
| 41. POD/AC shipping date | `trips.pod_ac_shipping_date` |
| 42. LBC tracking no. | `trips.lbc_tracking_number` |
| 43. POD comments | Stop/DR-scoped `pod_records.remarks` |
| 44. Invoice no. | Existing trip billing's `invoice_number` |

The Master List always uses CSV order. Stored custom order is retained but does
not override that order. Existing column widths, colors, header formatting,
visibility settings, and pin settings remain stored. WH CODE is no longer
unconditionally hidden in this sheet. Other sheets keep their previous column
sets and order. Excel export obtains the same 43-column metadata and uses the
worksheet name Master List, including the full delivery completion date.

New related-field editors use an authenticated, management-only endpoint and a
single database transaction. They reuse a matching record or create one when
absent. A trip lock serializes Master List writes. Multiple matching reports or
billings are never silently selected or multiplied into cargo rows: these cells
require selection of the specific record through the existing workflow. Other
clients still refresh through the existing report change subscriptions. The new
related-field endpoint confirms the committed field and row identity; it does
not create synthetic collaboration versions for related records.

CSV/XLSX import recognizes every booking header. Additional values are signed
with the preview and saved through a wrapper around the existing source import,
in the same database transaction. Original source cells and metadata remain in
provenance. Conflicting shared values stop the chunk rather than overwrite each
other. Names must match existing relationship records; the wrapper does not
create new profiles, trip types, trucks, or trucking companies. Generated dispatch
and trip identifiers remain authoritative; their CSV values remain in provenance.
WH CODE identifies the normalized origin and Ship From displays its label.
Spreadsheet errors and Excel zero-dates become preview warnings and are retained
as original source text rather than saved into typed operational fields.

Database work still required, before this can be fully used:

1. Obtain approval for `backend/migrations/2026_11_17_proposed_master_list_csv.sql`.
2. Apply its one nullable text column, `trip_line_items.source_page_no`. CSV Page
   No. varies by cargo row, so the existing trip-level page number cannot store
   these values independently. There is no backfill and no existing value changes.
3. Create `v_trip_master_csv` to project the existing source view and relationships.
   The existing report views are retained.
4. Create `save_master_list_cell_v1` and `import_trip_master_rows_v1` with execution
   restricted to `service_role`; the new view is likewise service-role-only.
5. Reload the PostgREST schema cache, as included in the proposed migration.

The existing source import/workflow/recovery migrations are prerequisites. Until
the proposed migration is approved and applied, the source headers are available but
new projections cannot load fully; source reads retain their existing fallback.
New related-field saves and Master List imports report setup-required errors.

No tests, builds, validation commands, browser sessions, application servers,
Supabase queries, or migration execution were run for this change. The work was
limited to reading the CSV and repository sources and editing files. Runtime
behavior has not been verified.

Performance and appearance follow-up:

- The displayed CSV data columns retain their authoritative order; the existing Trip
  Details system action follows them. Stored visibility, widths, pins, colors,
  and other formatting remain intact.
- Other report sheets retain the Excel/client, admin/staff, and driver category
  palette. Master List headers use the original workbook's five color groups
  below, rather than those role-based categories.
- Master List preloading and the initial header request now include
  `source_lines=true`, matching the actual page request and its cache key.
  The header bootstrap and page load share one in-flight metadata request.
- Column metadata has a session/token/projection-scoped cache, separate from row
  invalidation. A row refresh no longer forces another column request. Its
  existing 90-second lifetime remains, with explicit fresh metadata reads still
  supported and session resets clearing metadata and pending requests.
- Schema availability checks share in-flight work. Successful capability results
  live for 60 seconds, missing-schema results for five seconds, and unexpected
  failures are not cached. No operational records or permissions are cached here.
- The CSV view proves source-schema availability, avoiding a separate source
  probe. The Master List skips the allocation-column capability probe and the
  loading milestone, route, and product-photo enrichment queries used by other
  sheets. Those values are outside its current column/visual-card layout. Other
  reports keep those queries, and Trip Details loads its own data separately.
- The parent-trip request still runs once per page and is reused for identity
  fallbacks and generated trip references. Nonlegacy Master List reads now select
  only the four parent fields needed for those operations. Exact source numeric
  reads, row identity metadata, pagination, search, and filtering are retained.
  The main view still returns the metadata needed by editing and row actions.
- A confirmed scalar edit may keep the currently fresh, reconciled Master List
  collection usable when returning to the tab. This is limited to edits that do
  not affect the active search, filters, or sort and have no pending dirty
  Realtime signal. Other projections retain their normal invalidation.
- Related-record edits queue a refresh of the affected trip after editing ends,
  instead of always refreshing every loaded collection page. Search/sort/filter
  changes and dirty Realtime signals retain the broader refresh path. Queued trip
  refreshes are tied to their original session/query snapshot.
- Rendering reuses a column lookup map and stable Master List editor definitions
  rather than repeatedly scanning columns or rebuilding editor maps per cell.
  Existing virtual rows and bounded loading remain unchanged.

This follow-up makes no SQL or database-object changes. The earlier proposed
Master List migration remains pending approval/application if it has not already
been applied. No tests, builds, validation commands, browser testing, servers, or
Supabase operations were run. Performance improvements are inferred from the
removed request paths and allocations; they have not been benchmarked.

Original workbook header colors:

| Source header color | Excel cells / original columns | Pastel header fill |
| --- | --- | --- |
| Cyan: theme accent4, tint `-0.249977111117893` (fill 17) | A1 Page No.; Z1:AE1 Incident Date, Backload Reason, No. of Box (Backload), IR Status, IR Submitted Date, Backload comments | `#CEF3FA` |
| Teal: theme accent1, inherited from `Master_List` table's `TableStyleLight9` | B1:K1 Dispatch no. through Added by; X1:Y1 Province, City | `#D3EFE2` |
| Purple: theme accent5, tint `-0.249977111117893` (fill 8) | L1:W1 WH CODE through Total CBM | `#EFE4EE` |
| Orange: theme accent2, tint `-0.249977111117893` (fill 18) | AF1:AG1 No. of Box (Offload), Offload Reason | `#F7EAE3` |
| Navy: RGB `#002060` (fills 19 and 20) | AH1:AR1 Delivery status through Invoice no., including all POD and TMS headers | `#D2DCF5` |

The theme in `xl/theme/theme1.xml` supplies accent1 `#156082`, accent2 `#E97132`,
accent4 `#0F9ED5`, and accent5 `#A02B93`. Direct cell fills in `xl/styles.xml`
override the built-in table header. Cells with fill 0 inherit the table color;
they are not white headers. The built-in `TableStyleLight9` header uses theme
accent1, as documented in the
[Apache POI preset definitions](https://raw.githubusercontent.com/apache/poi/trunk/poi-ooxml/src/main/resources/org/apache/poi/xssf/usermodel/presetTableStyles.xml).
The source conditional-formatting rules do not add another color to the header
texts. Fills 19 and 20 both specify `FF002060` despite different background
attributes, so the final eleven columns must remain one group.

Pastels use dark text for readability. Cyan uses a brighter sky tint, teal uses
a mint tint, and navy uses a stronger blue tint so these groups are easier to
distinguish. Purple and orange retain their original pastel shades. Columns are explicitly assigned by their original workbook cells;
no semantic prefixes or responsibility-based guesses determine colors.
`MASTER_LIST_COLUMNS` supplies names, order, and header metadata in the existing
columns response. A legend uses these same groups. The same header fills apply
to Excel export, while data cells retain their existing formatting.

The original header names and groups take precedence over saved header aliases,
header colors, and whole-column colors in this sheet. Those saved settings are
not deleted or rewritten. Header rename/color controls are disabled for source
headers; font-size, width, visibility, pinning, input configuration, record
editing, and existing cell/column body formatting remain available. System
columns retain their existing controls and follow the CSV columns. Every user
receives the same original-header mapping through the shared API metadata.

No database lookup or layout write is needed to apply the workbook colors.
The existing deduplicated metadata cache, schema capability cache, bounded row
loading, confirmed-edit reconciliation, and Realtime subscriptions are retained.
No further redundant data request was introduced to read or apply these colors.
The original workbook was inspected as source data only; it was not saved or
modified. No tests, builds, validation commands, application/browser testing,
servers, or Supabase SQL were run for this header-color update.
