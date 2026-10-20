# Phase 3D - Spreadsheet visual consistency

## Implemented

1. **Gutters and checkboxes:** shared centered gutter styling covers row labels, select-all and row selection controls, including variable-height rows. Checkboxes use a global 14x14px size without changing their handlers or focus behavior. Filler rows reserve the same checkbox slot as real rows, while number-only Flexible Table gutters remain centered. Existing gutter widths and pin offsets are unchanged.
2. **Compact headers:** shared header typography is 12px with compact vertical padding and natural wrapping. Offload sortable buttons and static titles no longer truncate or force a single line. Menus retain separate flex space and resize handles remain at the column edge. No fixed header height clips wrapped headings.
3. **Column appearance:** added a shared `reportColumnAppearance` resolver, reused for ReportDataView, Tracker, Operations, Flexible Tables and management-column defaults. Existing `ColumnDesign.format`, legacy column background and cell overrides resolve together. Headers and filler cells receive only column defaults; actual cells additionally receive their own overrides. Explicit cell false values can override a column's bold/italic/underline. Flexible Table appearance settings are read through their existing versioned settings object. No data values or persistence API were changed.
4. **Offload spacing:** the viewport alone owns available-height sizing; table/thead/tbody stay natural height. Filler count uses the actual scroll container clientHeight, subtracting toolbar, header and measured real rows. Filler rows remain after actual rows and use the 30px baseline. Existing row resizing remains a minimum height so meaningful multiline content can expand. No extra scrolling wrapper or overflow masking was added. This is a code-level correction, not confirmation of the user's screenshot at runtime.
5. **Typography:** the live spreadsheet tables share a 12px default, including inherited editor/control text. Row labels remain 11px. Inline user font sizes/families are preserved. Selectors are scoped to spreadsheet tables, excluding page headings, dialogs and printed transmittal sheets.
6. **Detail actions:** a shared `SpreadsheetDetailsAction` renders an ArrowUpRight icon with accessible label, tooltip and focus style. Trips/Combined preserve the actual trip/stop navigation and modifier-click behavior; Operations preserves the report-details modal. Default action widths are compact, but saved shared widths are honored. Edit/delete actions and row menus are untouched.

## Whole-column versus individual formatting

Whole-column background, text color, weight, italic, underline and supported fonts now render in the header, real cells and visual blanks. Cell-specific styles take precedence only in their own data cell. Existing shared revision handling, layout saves and Realtime invalidation are reused; no new persistence field is introduced. Table selection/focus indicators remain visible over formatted cells.

## Files changed in Phase 3D

- frontend/src/components/admin/ReportSpreadsheetUtils.ts
- frontend/src/components/admin/SpreadsheetPresentation.tsx
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/components/admin/useManagementTableColumns.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- frontend/src/services/flex-column-appearance.ts
- frontend/src/index.css
- docs/phase-3d-spreadsheet-visual-consistency.md

## Limitations and verification

No tests, new tests, browser automation, Playwright, lint, TypeScript checks or builds were run, as requested. Header wrapping, visual spacing, dark fills, variable row heights, selection and two-session formatting/order still need runtime acceptance. Column-format rendering supports the existing saved metadata; this phase does not add new font controls or change which appearance controls each table offers.

Temporary row-height persistence limitations from Phase 3C are unchanged. No claim of live/browser verification is made.

## Safety

No Supabase SQL, migration, configuration or database change is required or was performed. No backend changes, feature activations, production data edits, deployment, commit or push. Existing unrelated worktree changes were preserved.
