# Optional-data trip review

## Rationale

Review now uses the master list's real 43-column metadata and one row per source product. Missing optional details become visible yellow flags rather than confirmation gates. Row actions, historical recovery and truck selection sit beside the data they affect. Save remains in the fixed footer, the table header follows the modal-body scroll, and utility columns stay visible while scrolling horizontally. No backend contracts or SQL were changed for this update.

## Components

```text
BulkTripImport / AddTripForm
  ReviewPreviewTable (CSV review)
    Actual /reports/dispatch-monitoring/columns?source_lines=true metadata
    Grouped product rows / sorting / column filtering / search / Flagged only
    FlagReasonTooltip / visible row menus / right-click / Shift+F10
    RowColorMenu / Shift-Ctrl-Meta multi-selection
  PreviousImportSummary
    One Approve all action using existing recovery flags
    PreviousImportDetailsTable (collapsed DR groups / Skip / existing-model matches)
  TruckPicker (shared by both flows)
    Existing truck catalog + schedule availability + default-driver metadata
  Existing group rail / full-width stores / allocation engine / locks / undo
```

Annotations use the existing JSON import draft under optional `review_annotations`; the JSON draft endpoint already stores additional metadata. No annotation fields are sent to the commit endpoint or added to source rows. Manual colors override automatic colors. Mark as reviewed records a canonical fingerprint of the source/context/reasons; unchanged recovery keeps it cleared, while changed data re-enables automatic highlighting. Reset removes the manual/review override. Skip affects only the requested source line, not existing records.

## Live schema minimum

Read-only PostgREST schema metadata was checked on 2026-10-24. This was metadata inspection only; no live records or schema were changed.

| Table | Non-null fields reported by the live schema |
| --- | --- |
| trips | id, dispatch_number, status, created_at, updated_at, collaboration_version |
| trip_stops | id, trip_id, stop_sequence, delivery_status, created_at, updated_at, dr_version, collaboration_version |
| trip_line_items | id, trip_id, created_at, updated_at, collaboration_version |

IDs, relationships, sequences, defaults and audit fields are supplied by the normal save path. **Product code/product_id/customer_model, quantity, CBM, DR, loading date, estimated delivery, trip type, store and customer IDs are nullable.** A product code, quantity or DR is therefore not presented as a universal database requirement. Foreign keys, allowed statuses, date ordering and numeric types still apply when values are supplied.

The signed CSV preview endpoint is stricter than the database: it currently excludes missing Customer Name, Ship To, trip group, all source identifiers, malformed decimals/dates and conflicting mappings. Those exclusions remain visible with their returned reasons. The frontend never edits signed rows to pretend the API accepted them. Manual malformed numeric lines are excluded, while the remaining lines still save; decimal quantities remain exact.

## What saves now

- Optional trip type, dates, truck/driver, unmatched delivery coordinates and incomplete cargo no longer gate CSV review or the row-save action.
- Save is enabled for at least one preview-accepted, non-skipped row, except while another operation is running or the batch is already finished. Infrastructure failures are reported truthfully rather than presented as successful saves.
- A verified trip-only map pin can trigger `TRIP_DELIVERY_LOCATION_SETUP_REQUIRED` on servers without the stop snapshot column. Only that known preflight/no-write error retries once without pins; the fallback sends `verified:false`, blank coordinates and no store-master update, while retaining the full reviewed point in the draft. The UI warns that map pins were not persisted. Other 503s and post-commit follow-up failures are not automatically retried.
- Unmatched location payloads retain the CSV/typed plain text, `verified:false`, blank coordinates, and `update_store_location:false` unless explicitly opted in. No fake point or automatic shared-store update is sent. Persisting that text on a trip stop still needs the backend work below.
- Incomplete allocation remains in the draft; it is not sent to the strict finalization endpoint. Optional allocation/company failures do not abort saves for other product groups. Complete compatible plans still use the existing allocator/finalizer.
- Empty default trip details do not require the versioned details RPC; populated details still use the existing details contract. Saved/frozen targets are preserved on retries.
- Unapproved missing-history products stay flagged and pending because the unchanged server rejects their recreation. Other eligible products can save. Approve all is one click and uses the real restoration/version flags; annotations never silently grant recovery approval.
- Row-scoped warehouse/store/recovery preflight errors are isolated so other rows can save. Network, setup, signature and immutable-batch errors are not split or blindly retried.
- A failed Save no longer leaves an untouched batch permanently locked. Save completion rechecks the existing recovery endpoint; server counts and actual record IDs distinguish recorded rows from synthetic missing-history warnings. Missing-history warnings alone clear the attempt lock, even when the outcome list is nonempty. Reopening an untouched batch likewise ignores the stale draft `started` flag. Recorded or uncertain results retain their protection, with an inline warehouse explanation. Unmatched source warehouses offer explicit creation through the existing master-data API.
- Busy/maintenance trucks are visible with a reason. Busy trucks remain disabled because current server/SQL assignment guards forbid schedule conflicts. Available-only, plate/type/driver search, driver prefill, Change driver and Assign later are provided. Manage trucks opens the real Database/Trucks view through a scoped frontend deep link.

## Verification

- The provided `Cebu trip request 1.csv` was read directly, without copying it into the repository: **56 product lines, 1 PHTRUCK group, 4 stores, 29.688 CBM**.
- `frontend/tests/trip-review-warnings.browser.js` accepts an optional local CSV path; its default is a synthetic 56-row fixture. The actual supplied file passed with mocked APIs: all 56 unmatched-address rows saved, absent type/dates/truck/driver remained absent, the 43 headers matched the real metadata order, colors cleared via right-click and Shift+F10, multi-row colors applied, draft colors/review state recovered, one-click historical approvals saved all rows, Skip/Include retained source identities, and truck rows showed drivers plus busy/maintenance status. The test also saves a manual trip with a decimal quantity, no product/DR, and a malformed second row excluded.
- Six review sizes cover 1366x768, 1440x900, 1920x1080, 1093x614, 1152x720 and 375x812. Reduced CSS viewports emulate 125% zoom footprints; native browser-chrome zoom was not used.
- The existing populated-modal suite has 120 layout checks, including full-width stores, 53 stops, allocation locks/undo and both preview modes. The shell/accessibility suite adds 14 sizes.
- All 29 focused unit tests pass, covering annotation precedence/recovery/reset/data changes, row-error isolation, address confirmation and allocation rules. Run with `node --test tests/optional-trip-address.test.ts tests/import-batch-lock.test.ts tests/review-annotations.test.ts tests/isolate-import-rows.test.ts tests/propose-allocation.test.ts tests/address-review.test.ts tests/api-trip-import-errors.test.ts` from `frontend`. New components/services pass targeted ESLint; the Vite production bundle passes.
- All browser saves are intercepted; **no production writes or live migrations occur**.
- Full frontend TypeScript checking still encounters the pre-existing reporting errors at `ReportDataView.tsx:1297` and `UserActivityHistory.tsx:17`.

## Acceptance checklist

- [x] Optional-address/type/date/truck/cargo warnings do not disable the row-save action.
- [x] Existing backend-accepted rows save with unmatched addresses; source values, quantities and CBM are unchanged.
- [x] Yellow rows have accessible reason text and clear via right-click, visible menus or keyboard; bulk colors and Reset work.
- [x] Reviewed/manual colors survive draft recovery without being invented as master-list fields.
- [x] Previously imported products use one summary and Approve all action; existing records are not replaced.
- [x] Truck rows show type, capacity, driver, availability and known reasons; forbidden conflicts are visible.
- [x] One vertical body, sticky table header, fixed Save, horizontal column navigation and visible utility menus.
- [ ] Unapproved historical rows saved as ordinary lines: requires server-policy changes below.
- [ ] Trip-only unverified address text and permanent master-list annotations: require persistence changes below.

## Backend needs

1. **Trip-only delivery text/coordinates:** `POST /api/trips` and `POST /api/trips/import/commit` must persist an independent stop snapshot. The prepared `trip_stops.delivery_location` proposal is not installed in the checked live schema. Extend its writer to accept `{address, province, city, latitude:null, longitude:null, verified:false}` as well as verified coordinates. Read APIs and routing must use the trip snapshot appropriately. Keep all shared `customer_stores` writes behind the existing explicit `update_store_location:true` opt-in. The current writer only persists verified snapshots, so unverified plain text presently remains in the draft/source data.
2. **Rows optional under the import contract:** align `/api/trips/import/preview` and `/api/trips/import/commit`, their warehouse/store resolver and source RPCs with the nullable schema. Missing optional names/models/dates/quantities should retain source text and nullable references plus warnings; reject only genuinely unrepresentable values. Preserve signatures, permissions, idempotency and existing-record protections. Do not fabricate customers, warehouses, products or coordinates merely to satisfy a resolver.
3. **Historical approval as a flag:** `commitTripImport` and `import_trip_source_rows_v3`/details variants currently require `restore_missing_source` plus `restore_history_version`. To save unapproved missing-history lines as normal flagged lines, relax that policy while still atomically checking whether a live line reappeared. Reuse a live line or create only an absent line; never replace an existing record or lose the original quantities/CBM.
4. **Permanent row review metadata:** no row color/flag field exists in the current master-list columns. Propose nullable `trip_line_items.review_color` (yellow/red/green/blue/none), `reviewed_fingerprint`, and structured `review_flags`, with validation and versioning. Add explicit row annotations keyed by existing source identity/client key to commit/manual-save contracts, and return them in master-list report rows so the real sheet can render the same state. These are proposals only; the frontend does not send these invented fields today.
5. **Truck catalog completeness/booking details:** `/api/lookups/trucks` already returns `default_driver_id`, `default_driver_name`, and `default_driver_ambiguous`, derived from active `drivers.assigned_truck_id`; no new default-driver endpoint is needed. It is limited to 500 rows, so add pagination/completeness metadata if the full fleet can exceed that. `/api/trips/truck-availability` currently returns a generic reason; add actual conflicting trip reference and date range for precise booking labels. Keep conflicts disabled until a separately approved planned/unreserved-assignment policy exists. `/api/trips/import/allocate` still requires a complete capacity-valid plan, explicit unreserved confirmation when dates are missing, and drivers for multi-truck cargo; allowing partial planned cargo would require changing that contract/policy.
6. **Deployment prerequisites:** populated trip details/recovery still depend on the prepared versioned import-details/recovery RPC migrations. The UI cannot remove a missing-RPC 503. Apply only through the project's approved migration process; none were applied here.
