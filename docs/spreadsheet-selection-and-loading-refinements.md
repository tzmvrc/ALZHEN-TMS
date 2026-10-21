# Spreadsheet selection, loading and editing refinements

## Implemented in code

### Selection

The main repeated work was linear row lookup inside each visible formula-cell renderer (`allRowIds.indexOf`), along with repeated physical-row scans in selection/source adapters and trip-issue ID rebuilding/sorting. An empty formula snapshot was also allocated again before hydration, invalidating calculation memos. Selection/focus could dispatch the same cell state more than once.

- Shared formula editing now uses memoized row positions, row records, uniqueness counts and column positions.
- Operational source adapters and presence lookup use physical-key maps.
- Duplicate focus/selection state changes return the existing state.
- Empty formula/virtual-row defaults are stable; selecting a different cell does not rebuild the formula evaluator or request formula data.
- A local DOM outline is applied on pointer capture, independently of HTTP and presence acknowledgements. Range, context-menu, keyboard and formula-reference interactions restore their normal selection rules. Existing dirty-draft guards still govern leaving an unsaved editor.
- Trip-issue identities and provider values are memoized across selection changes.
- Existing virtualization, row-height measurement, stable references, save guards and Realtime reconciliation remain in place. This is not a replacement grid implementation.

### Headers and controls

- Column headers open their existing menus at the pointer on right-click. Header three-dot controls and their old positioning handlers are removed from operational reports, Tracker and Flexible Tables. Shift+F10 / Context Menu keys provide keyboard access.
- Rename inputs are borderless overlays inheriting the header appearance; the title retains its layout footprint. Focus selects the title. Enter/valid blur save, Escape cancels, and unchanged titles do not issue an alias save.
- Spreadsheet action controls use pointer cursors, while editors and resize handles keep their appropriate cursors.
- Formula input value text is 10px; the address indicator and data-cell typography are unchanged.
- Arrow-only page navigation is removed from the search/filter toolbar. A compact explicit page field retains pagination below the grid when needed; continuous Master List does not gain pagination controls.

### Preloading and caches

- A delayed, single background worker complements the active sheet's own loading. It warms the other report pages, Tracker, shared design/width metadata, dropdown metadata and common relationship lookup roots.
- Master List keeps continuous fetching. When entered from another sheet, its background collection is warmed after the smaller jobs. Joining a pending collection receives its latest partial result immediately.
- Data requests reuse existing authenticated caches and deduplication. Hidden grids are not mounted just to preload them. Background work stops between jobs/pages on cancellation.
- Shared design/width metadata has a short freshness window for mounts/preloads; Realtime/focus refreshes and conflict retries force a fresh read and preserve revision checks/pending changes.
- Retained sheet components continue preserving scroll, filters, sorting and local selection. No new socket connections or database publications were added.

### Dropdowns

- Relationship search opens without filtering by the saved value, while the current option is indicated separately. Cached results appear immediately; empty search restores the relevant options. Typed search filters cached options immediately and uses the existing bounded server lookup with debounce for additional results.
- Existing customer/store constraints, creation forms and explicit relationship-ID commits are retained.
- Configurable options display labels only. Internal keys are generated from labels; users no longer type stored keys in option forms.
- Compact in-place label editing, edit icons and trash controls replace deactivate/reactivate controls. Existing stored keys are preserved during renaming.
- Operational option removal rechecks usage on the server and blocks protected/system or used options. Flexible-table option removal/key changes likewise check saved cell usage. Removal uses the existing inactive-choice retention mechanism; historical option rows are not hard-deleted. Existing authorization/audit logic remains.
- Shared column-metadata options lack a global usage-check endpoint. Newly staged options can be removed; removal of saved metadata options is blocked with an explanation rather than guessing about historical usage.

## Limitations

- Runtime behavior and performance have not been verified in this task; tests, builds, lint, TypeScript checks and browser automation were intentionally not run.
- Existing lookup result limits remain. Typing searches the server for other matching records; the editor does not download every master-data record up front.
- Background warming is incremental, not instantaneous. A sheet opened before its preload finishes follows its existing loading path.
- Active cells with unsaved/invalid drafts retain the established commit/cancel safeguards; selection optimizations do not bypass validation or save failures.
- Existing large-format payload limits and continuous-collection memory/network costs remain.
- No Supabase SQL, migrations or operational data mutations were executed. These changes need no new schema. Safely removing saved shared-metadata options would require an additional authorized global usage-check implementation, not an unverified delete.
- No deployment, commit or push.

## Files changed in this task

### Frontend components

- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/components/admin/useWorkspacePreload.ts` (new)
- `frontend/src/components/admin/useOperationalFormulas.tsx`
- `frontend/src/components/admin/useSpreadsheetHeaderFormatting.tsx`
- `frontend/src/components/admin/SpreadsheetFormulaBar.tsx`
- `frontend/src/components/admin/SearchableRelationshipEditor.tsx`
- `frontend/src/components/admin/ReportDropdownEditor.tsx`
- `frontend/src/components/admin/ReportSpreadsheetShared.tsx`
- `frontend/src/components/admin/SpreadsheetColumnConfiguration.tsx`
- `frontend/src/components/admin/FlexibleColumnConfiguration.tsx`
- `frontend/src/components/admin/OptionLabelEditor.tsx` (new)
- `frontend/src/components/admin/TransmittalTrackerView.tsx`
- `frontend/src/components/admin/OperationsReportsView.tsx`
- `frontend/src/components/admin/TripIssues.tsx`
- `frontend/src/components/admin/SpreadsheetPresentation.tsx`
- `frontend/src/components/admin/useSharedTableDesign.tsx`
- `frontend/src/components/admin/useSharedTableWidths.tsx`
- `frontend/src/pages/Admin/views/FlexibleTablesView.tsx`

### Services and styles

- `frontend/src/services/lookup.service.ts`
- `frontend/src/services/dropdown-option.service.ts`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/shared-table-widths.ts`
- `frontend/src/services/report.service.ts`
- `frontend/src/index.css`
- `backend/src/services/dropdown-option.service.ts`
- `backend/src/services/flexible-table.service.ts`
