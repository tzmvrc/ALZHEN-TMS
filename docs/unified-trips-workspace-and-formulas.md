# Unified Trips workspace and Excel-style formula editing

## Scope and navigation

Trips is the primary spreadsheet workspace. The separate Reports sidebar entry and user-facing Combined Report tab were removed. Five bottom sheets reuse retained ReportDataView instances:

| Sheet | Existing data source | Design/formula namespace |
| --- | --- | --- |
| Trips | Dispatch Monitoring projection, without the former active-transaction/archive-only constraint | trips |
| Dispatch Monitoring | Dispatch Monitoring projection | report:dispatch-monitoring |
| Dispatch Report | Dispatch Report projection | report:dispatch |
| Trip Booking | Trip Booking projection | report:trip-booking |
| Store Calling | Store Calling projection | report:store-calling |

No records or tables are merged. The Combined backend view, APIs and export dependencies remain. Transmittal Tracker stays accessible through a workspace toolbar action, with a Back to Trips action. Existing flexible-table sections remain accessible; no placeholder add-sheet button was introduced.

Each visited sheet retains its component state through React Activity: filters, sorting, selection, drafts, scroll positions, view mode and layout remain local to that sheet. Hidden effects/subscriptions pause and resume through the existing retained-view infrastructure. Existing report-page caches deduplicate reads. Trips preloading now warms the four existing report projections with bounded concurrency. Main Trips and Dispatch Monitoring share the same API projection but retain separate layout/formula namespaces.

The last explicitly chosen sheet is a user/role-scoped sessionStorage preference containing only its key, never cell values or drafts. Explicit report notification/deep-link navigation takes precedence. Legacy internal report IDs normalize to Trips. Protected routes /reports, /reports/:reportKey, /trips and query forms ?sheet=... / ?report=... open the corresponding workspace sheet. Existing /trips/:tripId?stop=... details routes and physical stop context remain unchanged. Combined links resolve to the main Trips sheet. Report notification targets are translated to that sheet's existing projection.

## Feedback and save recovery

Removed the persistent collaboration reconciliation banner from ReportDataView. Existing error/draft state, canonical reconciliation, polling, request validation and conflict protection remain. Refresh trouble produces a concise deduplicated warning toast and a small Retry updates action. Competing saved edits retain a meaningful conflict warning. Genuine source-save failures still use existing actionable error feedback; ordinary confirmed cell saves remain quiet. Refresh failure diagnostics log only the table, source type and HTTP status.

## Formula editing

- The existing shared formula bar now displays a selected-cell address such as C5 and occupies a full-width row beneath formatting controls, above the spreadsheet.
- Ordinary values still call the existing authorized source-cell save adapters. Relationship labels require their existing searchable selectors and cannot rewrite foreign keys through typed labels.
- Typing = or pasting a formula in an ordinary spreadsheet editor switches to a bounded in-cell formula editor. Existing overlay cells can be edited in place by double-click or keyboard activation. No formula text is submitted to the normal source-value API.
- In-cell formula editing and the bar use the same draft. Edits in one surface appear in the other. Buffered ordinary source drafts mirror into the formula bar without forcing a full-grid render for each source-editor keystroke.
- Reference clicks insert at the active editor's caret, preserve the target cell and do not trigger blur saves or other cells' source editors. Referenced physical cells receive a subtle outline. Preview extraction reuses the existing tokenizer, supports unfinished expressions such as =A1+, and ignores quoted strings.
- Enter commits once; Escape restores the last confirmed formula/source display. Valid intentional blur uses the same guarded commit path. Focus transfer between the cell editor, bar and help does not commit. There are no idle saves.
- Arrow keys move between focused data cells. Tab/Shift+Tab and Enter from the formula cell editor commit and navigate after confirmed success; arrow keys within an editor retain normal caret behavior.
- A no-op successful bar save now closes the original source editor consistently.
- Formula drafts, picked physical references and source-edit baselines survive retained-sheet hiding. Active fill listeners are cleaned up; account/table changes do not reuse another session's source editor.
- Flexible Tables use their existing custom-cell formula storage and editor. Reference insertion works from the focused in-cell editor as well as the bar, with matching address and preview behavior.

## Storage, calculation and integrity

Reused installed migration 20261020074222 and existing report formula endpoints. Operational expressions remain versioned rows in spreadsheet_cell_formulas; source records are unchanged by overlay writes. Flexible expressions remain in flex_cells.formula. Calculated results are derived for display, not copied into operational fields.

The shared safe parser/evaluator supports arithmetic, parentheses, SUM/AVERAGE/MIN/MAX/COUNT/IF, ranges and absolute/relative references. It does not use eval. Dependency evaluation is deterministic and uses physical references. Invalid references, division by zero and cycles fail safely with spreadsheet-style diagnostics. Existing version checks, API role validation, financial/deletion safeguards and source record identity validation remain unchanged.

Saved references bind author-time A1 notation to physical row and column identities:

- Sorting, filtering, pagination and column reordering do not rebind saved references to different records. Expressions preserve their authored notation; they are not automatically relabeled to the new visual order.
- Newly created expressions bind to the currently available row/column axis. References to unloaded rows cannot be invented.
- Inserting rows does not silently expand an existing bound range or change its members.
- Deleted/inaccessible references produce #REF! rather than binding to a sibling stop/truck row.
- Formulas are scoped to the existing table namespace. Switching sheets preserves each sheet's formulas and drafts; cross-sheet expression syntax is not implemented.
- Existing fill-down shifts relative references and preserves absolute anchors, using the current bounded batch endpoints.

Existing Supabase Realtime invalidation triggers formula metadata refresh and dependency recalculation; active drafts are retained. Source live-typing transport remains unchanged. Formula drafts are ephemeral local state; saved overlays use the existing saved-update mechanism. No new Socket.IO protocol or broker was introduced.

Normal operational exports remain source-based. Explicit calculated-page export remains separately labeled and escapes formula-injection prefixes. No computed result replaces authoritative export data implicitly.

## Files changed in this request

Application:

- frontend/src/App.tsx
- frontend/src/pages/Admin/DashboardPage.tsx
- frontend/src/pages/Admin/views/ResourceView.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- frontend/src/components/admin/ReportsWorkspace.tsx
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/ReportSpreadsheetShared.tsx
- frontend/src/components/admin/SpreadsheetFormulaBar.tsx
- frontend/src/components/admin/SpreadsheetPresentation.tsx
- frontend/src/components/admin/useOperationalFormulas.tsx
- frontend/src/components/admin/useSpreadsheetCollaboration.tsx
- frontend/src/services/trips-workspace.ts
- frontend/src/services/admin-preload.service.ts
- frontend/src/index.css
- packages/spreadsheet-formula/index.js
- packages/spreadsheet-formula/index.d.ts

Verification/documentation:

- frontend/tests/trips-workspace-formulas.test.ts
- frontend/tests/retained-reports.browser.js
- frontend/tests/unified-workspace.browser.js
- frontend/tests/unified-trips-sheets.browser.js
- docs/unified-trips-workspace-and-formulas.md

Other existing worktree changes were preserved. Browser tooling also appended its existing console log.

## Verification results

- Frontend targeted Node tests: **25 passed, 0 failed** (8 files). Includes 9 workspace/formula tests plus source confirmation, physical row ownership, report cache isolation, preloading, action columns and collaboration-label regressions.
- Backend targeted Node tests: **9 passed, 0 failed** (report-edit-persistence, trip-line-item-edit, table-design, collaboration-record). Fixtures replace database clients/use isolated test configuration.
- Isolated browser fixtures: **3 passed**:
  1. retained-reports: all five sheets retain state, hidden subscriptions pause, Tracker stays accessible, Combined tab is absent, cleanup succeeds.
  2. unified-workspace: real shared formula hook, two isolated contexts, mocked saved-update signaling; typed and clicked formulas, caret/reference highlighting, Escape, source update/recalculation, refresh-failure draft retention and duplicate-submit prevention.
  3. unified-trips-sheets: actual five ReportDataView grids; four expected backend sources, five exact physical-stop source writes and five separately stored overlays. Ordinary source drafts mirror into the bar. Trips starts a formula inside the cell and constructs it by clicking references. Operational remarks remain unchanged by all overlay saves. Zero fixture page errors.
- Frontend and backend no-emit TypeScript checks passed; a final frontend check is recorded after the last source edits.
- Targeted ESLint is **not clean: 8 errors and 2 warnings** remain in existing shared code: mixed component/helper exports and toast dependencies, an existing generic any and refresh-effect cleanup warning, Dashboard and ResourceView state effects, and Flexible Tables' existing reorder immutability diagnostic. Newly introduced workspace synchronization effects/ref-render diagnostics were corrected. No lint rules were disabled.
- Git diff whitespace checks passed.

Initial verification found an incorrect JSX runner mode and an assertion using non-normalized absolute-reference keys; both were corrected, and final tests pass. Browser fixture selectors/import interop were corrected during fixture setup. No production build was requested or run.

## Remaining limits and approval needs

No new Supabase migration, grant, RLS, Storage or Realtime configuration is required. No Supabase SQL or live operational writes were performed.

Live authenticated Supabase saves and actual cross-user delivery of formula Realtime events were not exercised. Browser acceptance used isolated Auth, API and saved-event fixtures; it is not production acceptance. Full operational export downloads, every specialized editor/permission combination, large-dataset performance and every layout/pinning variation were not comprehensively browser-tested here. Existing source identity, cache and shared-design regression tests provide narrower coverage.

Replacing an overlay with an ordinary source value still uses two existing APIs: source save, then versioned overlay removal. If removal cannot be confirmed after source success, the UI reports that distinction rather than claiming atomicity.

All production trips, stops, truck/driver assignments, PODs, reports and attachments were preserved. No deployment, commit, push, n8n or email work occurred.
