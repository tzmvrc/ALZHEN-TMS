# Phase 4.2.1 ? Compact Trips headers and editable formula bar

## Findings and implementation

Trips reused the wrapping report header rules with long titles and a minimum-height content wrapper. Added a Trips-only `data-compact-headers` style: report-sized 4px vertical padding, normal compact line height, no wrapper minimum height, and single-line ellipsis titles. Existing title tooltips, aliases, menus, resizing, pinning and user header formatting remain. Data-row heights are unchanged.

The operational formula hook previously accepted only expressions, with no ordinary-source save adapter. The shared text editor also reclaimed focus from every formatting-toolbar descendant, including the formula input. The formula input now receives focus without triggering the in-cell source save; other formatting controls retain their existing behavior.

## Editing and persistence

- Shared operational hook accepts a source-editor adapter. Ordinary values call the view's existing validated source handler; `=` expressions use existing separate formula-overlay persistence and safe evaluation.
- Trips, Combined Report, Dispatch Monitoring, Dispatch Report, Trip Booking and Store Calling use ReportDataView's physical edit-target resolution and `commitEditableCell` handler.
- Transmittal Tracker uses existing per-stop drafts, status validation, conflict checks and `saveCell` handler.
- Operations uses its existing source handler for editable dispatch, delivery-time and remarks fields. Relationship, item aggregate and report-type fields require their existing specialized editors. Original reporter remains protected.
- Flexible Tables uses existing `saveFlexCell` persistence. The bar now accepts ordinary editable custom date, dropdown and Boolean values as well as text/numbers. Expressions remain limited to supported custom text/number cells. Active dropdown labels resolve to stored values; Boolean inputs validate Yes/No or true/false.
- Relationship labels cannot be typed into the bar to replace foreign keys. Their existing searchable selectors remain authoritative. A permitted calculated-only cell is identified as ?Formula only,? with a reason; protected sources are not made writable.
- Formula expressions remain separate from operational source values. Existing physical reference bindings, evaluator, dependency calculation, fill-down, exports and saved-update subscriptions are reused.
- Replacing an overlay with an ordinary value first saves the validated source, then removes the versioned overlay. These existing APIs are not one atomic transaction. If the second operation fails, feedback explicitly states the source was saved but overlay removal was not confirmed.

## Lifecycle and selection

Enter commits through an in-flight guard; blur commits a changed draft through the same path. Escape cancels the draft without a source write. Formula reference picking prevents focus loss and ordinary cell activation, inserts at the input selection, and preserves the target cell and physical bindings. Draft text remains independent of incoming formula snapshots. The bar captures the active source draft and its existing edit baseline when focused. Source-session references clear on table/session cleanup.

Tracker's formula hook was moved below the helper initializations used by its source adapter. ReportDataView's hook remains below `pageOptions`, preserving the previous initialization-order repair.

## Files changed

- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/ReportSpreadsheetShared.tsx
- frontend/src/components/admin/SpreadsheetFormulaBar.tsx
- frontend/src/components/admin/useOperationalFormulas.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- frontend/src/index.css
- docs/phase-4-2-1-formula-bar-and-trips-headers.md

## Verification and limits

Targeted frontend compilation: `tsc -p tsconfig.app.json --noEmit --pretty false` passed (exit 0) after fixing adapter type errors. No tests, browser automation, lint, production build or live save checks were performed. Browser focus, visual sizing and two-session behavior remain unverified in this pass. No backend files changed for this phase.

No Supabase queries, SQL, migrations, operational writes, deployment, commit or push were performed. Existing migration `20261020074222` remains intact; no schema changes are required.
