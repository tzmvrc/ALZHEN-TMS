# Trip modal layout refactor

## Layout rationale

The 960px shell gives the form one vertically scrolling body and keeps navigation and actions visible.
A 60px header replaces the breadcrumb/title/subtitle/chip stack; each reference appears once per view.
The sidebar is replaced by a slim Stops / Qty / CBM / Trucks / capacity bar above the action row.
Forms use a 12-column grid, aligned 40px controls and consistent 16/24px gaps.
A sticky stop-chip strip and paginated All stops overlay replace the store rail; the selected editor uses the full body width. See stores-products-layout.md for the latest refinement.
CSV source views are tabs; a persistent trip-group rail shows one selected group with Details / Stops / Trucks & cargo tabs.
Compact DR cards show two groups per column initially; Show more grows the board naturally, with horizontal scrolling only and a line editor below it.
Existing navy, fonts and save guards remain; automatic allocation is pure and exact-decimal. The separately authorized address change adds optional trip-stop coordinates.

## Component tree and implementation

```text
AddTripForm / BulkTripImport
  tripModalShell + useTripModal
    TripModalHeader / TripModalSteps
    .trip-flow-body (the only vertical scroll container)
      AddTripForm
        Details: Dispatch section + Schedule grid
        Stops: StoreMasterDetail / StopsBar / StoreEditor / DeliveryAddressCard / ProductsSection
        Cargo: Assignment fields + TrucksCargoTab
      BulkTripImport
        Upload: TripFileUpload + inline workflow + resume link
        Preview: CsvSourceTabs / TripImportPreview / SmartImportMapping
        Complete details: GroupRail
          Details: ImportTripDetailsCard + destination/warehouse disclosures
          Stops: ImportStoreCards / StoreMasterDetail / AddressCard
          Trucks & cargo: TrucksCargoTab
        Review: ReviewSummary
          Sticky save/status row + existing single final confirmation
          AttentionList / collapsed trip rows / Advanced details
    TripSummaryBar + .trip-footer-row

TrucksCargoTab
  This trip summary / truck chips / add + settings popovers / schedule line
  useAutoAllocation -> proposeAllocation (pure engine)
  Dismissible automatic-allocation notice / Undo / Re-run
  CargoAllocationBoard -> CargoBoard
    Unassigned | Truck 1 | Truck 2 ...
    Compact DR cards / Move to / Lock + Unlock / Show more
    Expanded line editor below the board

AddressCard
  Store + status / From CSV vs Suggested match / Confirm address
  Default-off Also update store checkbox / edit + pin TripPopover
```

Compatibility exports retain the existing `StoreAddressReview` and `TripCargoPlanner` import paths. Hooks and existing parents still own validation, drafts, API calls and cargo save shapes. Allocation locks and undo snapshots are ephemeral per-trip UI sessions, retained across group/tab changes. Recovered placements are conservatively locked until explicitly unlocked; no new lock fields are added to saved CargoPlan payloads.

The pure engine uses best-fit decreasing over whole DRs, excludes conflicts and nonpositive/unknown capacities, preserves all locked placements, and returns a partial proposal when needed. Only an oversized DR may split, at product-line boundaries; an individually oversized product remains unassigned for an explicit manual split. Normal-size DRs stay whole when remaining capacity is fragmented.

## Refinement checklist

- [x] Delivery address is one card with source/match comparison, adjacent confirmation and a default-off store-update toggle. No separate verification checkbox or standalone store-save button remains.
- [x] Edit address and Adjust pin open focused dialogs with Escape/focus containment. Pending, needs-address and verified states use text plus subtle status colors.
- [x] CSV bulk confirmation only accepts complete, unambiguous suggestions. No-match stores stay flagged. Undo restores untouched decisions without overwriting subsequent manual edits.
- [x] Auto-allocation runs on selected-truck/source/conflict changes, supports partial proposals, exact totals, locks, unlock, undo and explicit re-run. Old distribution-review confirmation controls are removed.
- [x] Known conflicting trucks and drivers are excluded from selectors and automatic allocation. Existing server save checks still run.
- [x] Trip groups use a persistent 240px rail and three tabs. The full-width Stops tab and mobile use a select and Groups sheet. Previous/Next group and Alt+Up/Down work; tabs support arrow/Home/End navigation.
- [x] Trucks & cargo uses compact truck chips, searchable add/settings dialogs, a schedule line, per-truck capacity and compact DR cards. There are no in-column carousels or vertical scroll areas.
- [x] Review is a decision screen: sticky save/status, grouped attention items with exact location Fix navigation, historical approve-all, collapsed trip rows and Advanced details. The editable store browser is absent.
- [x] The existing final review approvals are covered by one checkbox beside Save; unverified locations remain optional as required by existing save rules. Unassigned cargo blocks only where the existing rules require it.
- [x] Group demand/capacity is labeled This trip; footer totals are labeled All trips and use the same eligible source lines and selected-truck capacities.
- [x] One vertical modal body, no overlapping controls or clipped DR cards; nested tables/board scroll horizontally only. Details use disclosures for less frequent destination/warehouse settings.

## Acceptance checklist

- [x] 1. Compact single-row header, inline breadcrumb, close action; subtitle is screen-reader-only.
- [x] 2. Dispatch reference and trip number each appear once in the current view; step-one fields give way to header references on later manual steps.
- [x] 3. Summary bar replaces the scrolling side panel; no second scroll column.
- [x] 4. The modal body is the sole vertical scroll container in the layout. The All stops overlay has its own list scroll; product rows, CSV rows and review source lines grow or paginate. Wide tables and the cargo board scroll horizontally only.
- [x] 5. Grid children use min-width:0, labels stay above fields, controls are 40px, table tracks contain their pickers, and DR cards remain within board bounds. Cards do not overlap or clip their content.
- [x] 6. Sections inside a group/store use borderless divisions; at most two bordered structural levels.
- [x] 7. Repeated introductory/helper text and oversized empty states are removed; safety-relevant guidance is retained.
- [x] 8. CSV metadata, inline draft status, text Save draft, Back and primary action share one desktop action row. The row wraps on small phones.
- [x] 9. Disabled import/review/save actions have adjacent reason/fix links; save blocker count is derived from the existing guards.
- [x] 10. Review contains collapsible read-only trip summaries and paginated source-line details, not the editable store/product workspace. Blocker Fix links open the owning group and section; delivery checks start collapsed under Verified/Unverified groups.

## Verification

- Frontend: 16 unit tests pass: 10 allocation cases, 4 address-review cases and 2 actionable API-error cases. Run from frontend: `node --test tests/propose-allocation.test.ts tests/address-review.test.ts tests/api-trip-import-errors.test.ts`.
- Backend: all 3 new trip-address tests pass, covering opt-out isolation, explicit opt-in and invalid coordinates. The wider check `node --import tsx --test tests/trip-bundle.test.ts tests/trip-delivery-address.test.ts` reports 11 pass / 1 existing failure: `trip-bundle.test.ts:42` expects fractional quantities to throw. The tested validator is unchanged by this work.
- `frontend/tests/trip-modal-layout.browser.js`: 120 populated layout checks across 15 states at 1366x768, 1440x900, 1920x1080, 768x1024, 375x812 and desktop dimensions divided by 1.25 (1093x614, 1152x720, 1536x864). These emulate the CSS viewport footprint of 125% browser zoom; native browser chrome zoom was not exercised.
- Assertions cover header/footer visibility, one vertical body, no horizontal modal overflow, label/input collisions, table-track spill or clipped DR cards. Functional coverage includes store shortcuts, attention filtering, address confirmation/default-off toggle, address-dialog Escape, bulk verification/undo, locked DR placement/re-run/unlock/undo, group shortcuts/tab keyboard navigation, exact group/tab/store Fix links, read-only review and the existing save confirmation.
- `frontend/tests/trip-modal-design.browser.js`: 14 shell sizes plus focus wrap/restoration, Escape, dropdown keyboard use, date errors, invalid files, CSV drop/preview, setup-required blocking, draft retention and reduced motion.
- Browser authentication and API responses are mocked; no production writes occur. Layout checks wait for dynamic viewport units to settle after rapid browser viewport resizing.
- `npx vite build` passes (2847 modules); existing large-chunk and ineffective-dynamic-import warnings remain. Windows sandbox native-process restrictions required running the bundle check outside the sandbox.
- Targeted ESLint passes for all new address/group/cargo/review/engine/hook/popover modules. `git diff --check` passes.
- Full frontend TypeScript checking still stops on existing errors in `ReportDataView.tsx:1297` (unused visibleSelectionKeys) and `UserActivityHistory.tsx:17` (unknown-to-ReactNode). Backend build stops on the existing `report.service.ts:817` query type error. No new TypeScript errors remain in changed files.
- Live commit/recovery, trip-address persistence and downstream route generation were not exercised against production services.

## Authorized address-storage exception and deployment

The user separately authorized a backend change for trip-only coordinates. `trip_stops.delivery_location` is a nullable JSON snapshot; existing stop reads select all columns, exposing it independently of shared store data. Optional location review/toggle fields are the only new save-contract fields. Cargo, product, trip-group and dispatch contracts remain unchanged. Existing shared-store opt-in still uses the established write path; opting out sanitizes the legacy import RPC's coordinates so it cannot update the shared store point. A preflight check stops before trip creation when snapshot storage is not available. Follow-up failures retain the same retryable batch/request identity.

Prepared SQL has **not** been applied to a live database:

1. `backend/migrations/proposals/2026_10_23_proposed_trip_delivery_location.sql`: adds the nullable snapshot column, a comment and a schema-cache reload. No backfill or destructive statements.
2. `backend/migrations/proposals/2026_10_23_proposed_import_trip_details.sql`: existing prerequisite, adds the two versioned details import RPCs. Its absence is the observed cause of the reported CSV commit 503. UI changes cannot make that RPC available.

The proposal headers require explicit approval before live application. Trip-only coordinate saving needs the first migration and deployment of the backend code. CSV commits with trip details also need the existing details RPC proposal and its documented prerequisites. Existing routing SQL was not rewritten in this modal/address-storage change; downstream consumers must explicitly read the trip-stop snapshot before relying on it for route generation.

Design reference: [Framer Marketplace SaaS templates](https://www.framer.com/marketplace/templates/categories/saas/). The implementation keeps the application's own navy palette and Plus Jakarta Sans font and uses one compact, restrained visual direction.
