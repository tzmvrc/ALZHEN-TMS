# Smart trip CSV import

Implementation was inspected and edited only. No tests, builds, lint, TypeScript checks, browser sessions, servers, SQL, or migrations were run. The reference counts below come from reading the supplied CSV contents, not importing them into the application.

## Reference files

Source directory: `Downloads/drive-download-20261022T125441Z-1-001`.

| File | Headers | Source rows | Observations |
| --- | ---: | ---: | --- |
| CDO trip request 1.csv | 14 | 23 | `PHTRRUCK`; no warehouse, province, unit CBM, or stocks columns |
| CDO trip request 2.csv | 19 | 37 | Three PH truck references; `Warehouse` values include `SQ CDO`; month-first approval timestamps |
| Cebu trip request 1.csv | 22 | 56 | `PH TRUCK NAME`, `Order Item No.`, `stocks`; warehouse `Cebu SQ`; year-first approval timestamps |
| Cebu trip request 2.csv | 19 | 44 | `TRUCK NAME`; warehouse `Cebu SQ` |

All 160 rows are source product lines. Repeated DR/customer/order references are not a reason to collapse them. No supplied header requires an unknown destination after the new aliases are applied. Whether source warehouses, customers, stores, and products match live records remains unresolved until the application reads the existing catalog.

## Central mapping and canonical storage

The authoritative alias configuration is `packages/trip-import/index.js`, shared by the frontend and backend. `index.d.ts` provides its types. Header normalization uses Unicode NFKC, trimming, case folding, repeated whitespace normalization, and punctuation/underscore/hyphen separators. Matching is by explicit normalized aliases, never substrings. Original headers and cells are retained separately with column ordinals so duplicate source headers cannot erase audit values.

`trip_line_items` is abbreviated as `li` below. The import destinations are existing source fields and relationships; they do not rename Master List columns.

| Recognized CSV headers | Import destination | Existing database storage / Master List relationship |
| --- | --- | --- |
| Warehouse; WH Code; Warehouse Code | `source_warehouse` | `li.source_warehouse` preserves original text; `li.source_warehouse_id` links the selected existing warehouse. The selected trip origin continues to supply the existing trip-level WH CODE / Ship From columns; individual source warehouses remain on their product lines. |
| PHTRRUCK; PHTRUCK; PH TRUCK NAME; TRUCK NAME; PH Truck Reference | `ph_truck_reference` | `li.ph_truck_reference`, not a physical truck plate |
| DR; DR No.; DR Number | `dr_number` | `li.dr_number` / DR |
| DN; DN No.; DN Number; Delivery Number | `dn_reference` | `li.dn_reference` |
| SO NO.; SO Number | `so_number` | `li.so_number`, separate from SAP SO |
| SAP SO No.; SAP SO; SAP SO Number | `sap_so_number` | `li.sap_so_number` / SAP SO No. |
| SP; SP No.; SP Number | `sp_reference` | `li.sp_reference` |
| Customer Name; Customer | `customer_name` | Existing `customers` matched by name or explicit selection; `trip_stops.customer_id`; raw name in import provenance |
| Ship To; Ship To Name; Ship To / Destination; Store; Store Name; Destination; Destination Name; Delivery Destination; Delivered To | `ship_to` | Existing `customer_stores` scoped to the customer and supplied geography; `trip_stops.store_id` / Ship To; raw label in provenance |
| Customer PO; Customer PO Number | `customer_po_number` | `li.customer_po_number` / Customer PO |
| PO NO.; PO Number; Internal PO Number | `internal_po_number` | `li.internal_po_number` / PO NO. |
| Customer Model; Model Code; Product Model | `customer_model` | `li.customer_model`; existing `products.model_code` lookup and `li.product_id` |
| Qty; Quantity | `quantity` | `li.quantity` / Qty |
| CBM; Unit CBM | `unit_cbm` | `li.unit_cbm`, separate from Total CBM |
| Total CBM | `cbm` | `li.cbm` / Total CBM |
| Product Category; Category | `product_category` | `li.source_product_category` / Product Category; also used for product matching |
| Province | `province` | `li.source_province` / Province; store identity constraint when supplied |
| City | `city` | `li.source_city` / City; store identity constraint when supplied |
| SO Approval Date | `so_approval_date` | `li.so_approval_date` |
| Item Status | `item_status` | `li.item_status`, separate from operational Delivery status |
| Order Item No.; Order Item Number | `order_item_number` | `li.order_item_number` |
| stocks; Stock Quantity | `stock_quantity` | `li.stock_quantity` |

Hyphen/underscore versions such as `ship-to` and `ship_to` normalize to the same explicit alias. The existing operational Master List destinations (Comments, incident/backload/offload/POD/billing fields, etc.) are also in the shared configuration and retain their existing backend mappings. The manual-only legacy `warehouse_code` destination does not automatically compete with `source_warehouse` for WH Code.

SKU, Product Code, Store Code, and Ship To Code are deliberately not treated as model/name aliases. They identify different business concepts and require manual review if encountered. `Ship From` remains separate from `Warehouse`; `Delivery status` remains separate from `Item Status`. The four reference files do not contain those unresolved code-only headers.

## Preview and approval

- Each original source header shows a sample, destination selector, and status: Automatically Matched, Needs Manual Mapping, or Conflicting Mapping. Explicit overrides show Manually Matched. Absent destinations show Missing Optional Field; required Customer Name / Ship To are identified separately.
- Two source columns selecting one destination are a conflict; neither silently wins. Resolve the conflict or keep one source unmapped. Both the frontend and preview API reject unresolved duplicate destination mappings.
- Unmapped nonempty cells remain in the signed preview, saved draft, and provenance. Saving requires explicit acknowledgement that these cells should stay unmapped. No database columns are created for unknown headers.
- Approved templates are browser-local, account-scoped, and keyed by the exact normalized ordered header layout. Reuse requires clicking Apply saved mapping; one format cannot silently override another. Source rows/sample values are not stored in templates.
- Missing optional columns stay empty. Mapped fields can be filled without renaming the source CSV. Blank source cells do not authorize overwriting existing operational records.
- Warehouse matching reads active code/name pairs once per preview, uses exact normalized identities, and reports unique/missing/conflicting matches. Missing or ambiguous labels require selection of an existing warehouse. Original warehouse strings remain unchanged. Selected IDs are rechecked at commit.
- Missing province/city does not prevent reuse of a uniquely matching existing store within the correct customer. All supplied geography must match; ambiguity requires explicit selection. Existing store geography can fill the relationship decision without changing the raw source cells or automatically marking a location verified.

## Rows, grouping, and types

- The 50-row preview pages are display pagination only. All valid rows continue through the existing 100-row commit loop and atomic import RPC.
- Files initially remain separate groups. Users can explicitly suggest groups by PH truck reference or dispatch/trip, and review/edit groups before saving. A PH truck reference is not assumed to identify a whole trip or a physical truck. CDO request 2 has three such references and needs a grouping decision.
- Existing Dispatch → Trip → assigned trucks → Stops → Products relationships, multi-truck cargo planning, partial-save recovery, and allocation confirmation remain in use.
- Existing document identity plus source-row ordinal distinguishes repeated lines within a file. Exact reimports use the provenance ledger and skip existing rows. Business identifier matches across different documents require review; sharing a DR alone never merges or deletes product lines.
- CSV identifier strings retain leading zeroes. Quantities/stocks/CBM use validated decimal strings until PostgreSQL numeric insertion; CBM discrepancy checks use integer scaling, not floating-point multiplication. Unit and total CBM remain separate. XLSX numeric values no longer get rounded to their display format; simple all-zero identifier masks retain leading zeroes.
- SO Approval Date accepts `YYYY-MM-DD` or month-first `MM-DD-YYYY` / `M/D/YYYY`, optionally with time, and preserves local source time. These match the supplied reference files. Day-first files need correction/review; the UI states the month-first convention. No locale-based month/day guessing was added.
- Creation of missing master records defaults off for new imports. Explicit creation controls remain available for supported workflows. Unknown warehouse labels cannot bypass the requirement to select an existing warehouse. PH references do not create trucks or drivers.

## Query and rendering changes

- Schema availability uses the existing short-lived single-flight capability cache instead of one schema probe per preview (60 seconds when available, 5 seconds when unavailable). Operational records and permissions are not cached in this helper.
- Duplicate-history reads select identities, fingerprints, and only the three JSON location fields needed for comparison, rather than full source/audit JSON. Duplicate-history and existing-cargo pagination now have deterministic ordering; neither query is capped at the first Supabase page.
- Warehouse catalog reads are per preview, not per row. Selected warehouse IDs are checked in one commit query. Older immutable recovery targets can still reuse uniquely matching existing warehouse codes without changing their stored target snapshot.
- Existing request-local customer/store caches are retained. Destination lookups are explicitly deduplicated within each commit request in addition to the existing location cache and in-flight lookup reuse.
- Location follow-up uses maps instead of repeated linear searches, deduplicates line-item IDs, and batches notification upserts in groups of 500 while retaining idempotent event keys and retry handling. Necessary per-store conditional location writes remain.
- Existing report/trip cache invalidation, Realtime subscriptions, source-row save batching, and per-row database RPC checks remain. Product resolution inside the deployed RPC was not changed; changing it would require separately approved SQL.
- Container build/runtime copy instructions include the shared mapping package. No container or application build was run.

## Compatibility and database approval

No new tables, columns, functions, policies, migrations, or database execution are required by these smart-mapping code changes. The four files use the existing 22 source-import destinations. Master List column order, pastel header assignments, widths, visibility, pinning, editing, and Excel export configuration were not changed.

The live database was not queried or modified for this work. Saving still requires the existing source-import/workflow/recovery schema and RPCs. If those are not already installed, their existing migration files need separate review and explicit approval. Importing operational Master List extras still depends on the previously prepared `2026_11_17_proposed_master_list_csv.sql`: the nullable line-item `source_page_no`, `v_trip_master_csv`, `save_master_list_cell_v1`, and `import_trip_master_rows_v1`. That SQL remains unexecuted. It is not needed merely to recognize the headers in these four trip request files.

Unresolved before a real import: live catalog identity matches for `SQ CDO` / `Cebu SQ`, customers/stores/models, the desired grouping of multiple PH references, any ambiguous branch selections, and any business-match/CBM warnings shown by the existing preview. No province, warehouse, plate, or driver was inferred from a filename.
