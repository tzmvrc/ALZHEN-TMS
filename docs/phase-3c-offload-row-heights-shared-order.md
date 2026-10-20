# Phase 3C - Offload rendering, compact rows and shared column order

## Offload white-screen root cause

Phase 3B reused `tableUi.pageBtn` for Operations pagination but did not import `tableUi` in `OperationsReportsView.tsx`. With the paginated path active, evaluating the footer referenced an undefined identifier. Added the existing dashboardStyles import. The formatter, grid and shared footer remain in their connected shell. The All dataset remains the default; category buttons were not restored. This diagnosis is based on code inspection, not a browser run.

## Compact rows and resizing

- Default/minimum row height: 30px; drag preference maximum: 1200px.
- Shared grid body padding is reduced to py-1 with vertically aligned text. Flexible Table input/cell padding is also compacted.
- Added `useSpreadsheetRowHeights`, reused by ReportDataView (Trips, Combined and other reports), Tracker, Operations/Offload and Flexible Tables.
- Drag the bottom edge of a real row-number gutter. Pointer motion updates the entire tr height; pointer release records the preference in component state.
- The resize strip has a row-resize cursor and a subtle hover/focus indicator. Arrow keys adjust height; Shift uses larger steps; double-click restores 30px.
- Pointer cancellation, window blur, unmount and account/table scope changes clean up listeners and restore cursor/selection styles.
- A table row height is a minimum, not a clipping constraint. Long remarks and multiple child editors may expand beyond it.
- Real rows are keyed by their physical report/stop/custom-row identities. Filler rows remain presentation-only, use a 30px baseline and do not acquire record IDs, API writes or selection membership.
- Filler calculations subtract actual rendered row heights, so resizing consumes or releases blank rows.
- Height state is independent of column order, format metadata, data refreshes and pinning. Printed Transmittal sheets were not assigned interactive row heights.

### Persistence limitation

Row heights are **temporary, account/table-scoped component state**. Retained mounted views keep them during navigation; unmount/reload resets them. No localStorage persistence or cross-user height synchronization is claimed.

The current API supports `ColumnDesign.position`, pin/color/visibility and per-cell font/color formats, but no row-height setting. `table-design.logic.ts` rejects unknown design/format keys; `flex_rows` exposes no height update field. This implementation does not invent a persisted field or endpoint.

For durable shared heights, a separately reviewed extension should add bounded, revisioned row-height metadata to the existing table-design contract (physical row key -> height). An existing design JSONB namespace could potentially hold this metadata without a new table, but its reserved key, validation, authorization and live constraints must be reviewed before choosing SQL. No Supabase change is required for the temporary interaction shipped here, and no SQL has been prepared or executed as an assumed requirement.

## Shared column order

### Existing architecture reused

ReportDataView, Tracker and Operations already used the existing authorized shared table-design API and `shared_table_column_widths.design.position`. They also had legacy browser layout fallbacks. Flexible Tables use `flex_columns.position` and versioned column updates; that existing authority remains in place.

The API response middleware already emits `table:layout-updated` after successful shared-design responses. The initial service-only inspection did not show that event, but tracing the complete middleware confirmed it; no duplicate backend emitter was added.

### Application improvements

- Added a shared order-save helper that queues all physical column-key positions before starting the existing revisioned writer. It merges with pending column patches instead of replacing widths, colors, pins or cell formats.
- ReportDataView, Tracker and Operations use that common save path. Generic layout setters do not enqueue duplicate position patches.
- Hidden columns remain in the full saved order. Position writes use actual column keys and stable existing table identifiers.
- Layout role checks guard drag/reorder handlers; controls wait for the authorized shared layout to load. Inactive saves report a permission error rather than claiming success.
- Existing Socket.IO layout invalidation, Supabase reconciliation, reconnect handling and edit/resize pauses remain. Added focus reconciliation to the same deduplicated loader.
- Fixed the Operations legacy reader that previously rebuilt registry order instead of honoring the saved sequence.
- Flexible Tables now support header drag/drop as well as their existing move buttons, immediately update visible order and save only changed positions through their existing authorized versioned API. Hidden columns, settings and formatting are retained. Failures reload the confirmed server order and show an error, never a saved toast.

### Limits

Position updates use the existing per-column revision model. This is not a new atomic table-wide reorder RPC. Flexible reorder can partially persist if a later request fails; the UI reports failure and reconciles rather than pretending the whole reorder succeeded. A future atomic order transaction would require a separately reviewed API/database capability. Concurrent conflicting changes remain subject to existing revision checks and retained design drafts.

## Files changed in Phase 3C

- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/SpreadsheetPresentation.tsx
- frontend/src/components/admin/ReportSpreadsheetUtils.ts
- frontend/src/components/admin/useSharedTableDesign.tsx
- frontend/src/components/admin/useSpreadsheetRowHeights.tsx (new)
- frontend/src/components/admin/spreadsheet-row-layout.ts (new)
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- frontend/src/services/shared-table-design.ts
- docs/phase-3c-offload-row-heights-shared-order.md

## Verification and safety

Code inspection and implementation only. No test suites, new tests, browser automation, Playwright, lint, TypeScript checks or production builds were run. Offload visual rendering, row drag behavior and two-session ordering remain pending actual acceptance. No runtime/browser success is claimed.

No backend changes, Supabase SQL, migrations, production data writes, feature activations, deployment, commit or push. Existing unrelated working-tree changes were preserved.
