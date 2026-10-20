# Phase 4.1 - Trips layout and formula bar

## Changes implemented in source

1. Trips and Combined Report continue using the same report grid header/body classes and row-height hook (30px default minimum). Removed the stacked related-field renderers and the extra placeholder line in issue-free Trips cells, which were forcing taller rows. Header gutter padding now uses the same compact vertical padding as the shared headers. Explicit row-resize state and natural expansion for real multiline remarks/issues remain intact.
2. Driver, Plate Number, Dispatch Number, and DR fields render through their separate original column definitions and physical edit targets. Trips retains the stop-specific transaction DR mapping. The combined-column menu and rendering suppression were removed; saved legacy `combined` metadata is ignored. Existing column order, aliases, widths, formatting, and explicitly user-hidden columns are not rewritten. The Phase 4 stacking implementation never stored hidden flags for its secondary fields, so removing its render-time suppression restores those fields without overwriting intentional visibility preferences.
3. The shared formatting toolbar now groups size, bold, italic, underline, and color controls on the left and the formula bar at the far right, with responsive wrapping. The font-size selector is available for normal selected cells as well as selected headers. Existing formatting handlers and shared persistence are reused.
4. The existing formula bar remains editable for authorized custom text/number cells in Flexible Tables. Enter commits through the existing versioned cell service; Escape clears the draft/reference picks; leaving the bar commits a changed valid expression/value. Invalid formulas retain their draft and report an error. Reference clicks preserve the active formula, insert its canonical cell address, and return the caret after the inserted reference. No keystroke writes are added. The existing safe engine, physical reference bindings, fill-down, and formula metadata are retained.
5. Unsupported operational fields and headers show a read-only indicator and an accessible explanation. Trips does not gain a fake formula save path. A shared help button beside fx opens a compact portal popover with arithmetic, SUM, AVERAGE, and IF examples, cell picking, Enter/Escape, fill-down, and relative/absolute reference guidance. Its listeners are cleaned up on close/unmount.
6. Trips filter chips now occupy the left side of the existing report toolbar, with viewers, search, and existing actions on the right. The page title occupies its own full-width line, and the old separate filter row is removed. Filter identity, pagination reset, edit/fill guards, conditional actions, and existing realtime behavior are retained.

## Files changed for Phase 4.1

- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/ReportSpreadsheetShared.tsx
- frontend/src/components/admin/SpreadsheetFormulaBar.tsx
- frontend/src/components/admin/TripIssues.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- docs/phase-4-1-trips-layout-formula-bar.md

## Limits and verification

These are source changes only. No tests, browser checks, lint, TypeScript checks, builds, or runtime verification were performed, as requested. Existing per-row resizing remains session-local, as before. Formulas remain restricted to eligible custom cells; operational report fields are read-only in the formula bar. Existing formula-fill limits and individually versioned saves remain unchanged.

No backend change or Supabase change was required or executed. The installed Phase 4 formula/color migration remains intact. No operational data, feature flag, deployment, commit, or push was performed.
