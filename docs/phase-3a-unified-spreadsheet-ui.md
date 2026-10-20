# Phase 3A - Unified spreadsheet table UI

## Implemented

1. **Shared formatting:** retained `ReportCellFormattingToolbar` and the existing formatting handlers. It now has a uniform 36px rectangular container. Italic and Underline are available by default and retain their unboxed icons, keyboard focus states, tooltips and active colors. Tracker renders italic/underline and inherits saved text colors. Operations/Offload uses the same toolbar and the existing revision-based shared column-design cell metadata. Trip/dispatch aliases map to their registered columns.
2. **Tracker alignment:** the right group is viewers, search, Prepare Sheet, conditional edit/delete actions, then Export. The existing report switch remains on the left. Controls continue to wrap on small screens.
3. **Feedback:** removed shared-design saving labels, per-cell Saved/Saving labels and the Operations refresh banner/footer label. Confirmed cell saves and failures use the existing toast provider. Cached report rows stay visible during background requests. Conflict resolution and actionable error/retry controls remain. Initial grid loading uses skeleton cells in presentation rows; empty datasets retain a blank grid.
4. **Spreadsheet body:** added shared measured viewport sizing, numbered sticky selection gutters and visual-only filler rows. Viewport sizing uses the actual table position, rendered footer/control heights, viewport resizing and ResizeObserver measurements. Filler height follows actual rendered rows, including expanded content. Left-pin offsets account for the numbering gutter. Numbers use pagination offsets and continue through filler rows. Blank rows have no record identity, controls, edit targets or data mutations and do not enter selection, export arrays or pagination totals. Null cell placeholders in the affected spreadsheets render blank.
5. **Fill handles:** ReportDataView handles now sit outside the content-height collaboration wrapper and directly inside the positioned table cell. ReportDataView and Tracker handles anchor to bottom:0/right:0, preserving the existing pointer/fill handlers and pinned-cell stacking.

## Flexible Tables

Flexible Tables reuse the toolbar, existing row-number column and shared filler/viewport/feedback helpers. Cell appearance is stored in the existing versioned column settings (`cell_formats`, keyed by physical row ID) using the existing authorized column-update endpoint. Other column settings are preserved. Formatting follows the existing manage-permission boundary for appearance changes; edit-only users do not gain metadata-management permissions. Its existing version conflict and Realtime refresh paths remain in use. No separate layout store or endpoint was introduced.

## Files

- frontend/src/components/admin/SpreadsheetPresentation.tsx (new)
- frontend/src/components/admin/ReportSpreadsheetShared.tsx
- frontend/src/components/admin/ReportSpreadsheetUtils.ts
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/components/admin/useSharedTableDesign.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- docs/phase-3a-unified-spreadsheet-ui.md

## Verification and deferred coverage

Frontend TypeScript (`tsc --noEmit -p tsconfig.app.json`) passed. Initial checks caught a layout-property mismatch in the filler-row styling; it was corrected to use the existing report pin registry.

As requested, no full test suites, lint suite, production build, browser automation or database fixtures were run. Visual acceptance, resize/scroll checks on multiple screens, multi-user formatting/typing regression, exports and fill-range interactions remain for the later testing phase. No live visual or collaborative acceptance is claimed.

## Safety

No Supabase SQL, migrations, schema, RLS, Storage or Realtime configuration changes are required or were executed. No backend endpoints or data-saving lifecycle changes were introduced. Existing environment flags were not changed. No deployment, commit or push. The pre-existing modified Playwright console log was preserved.
