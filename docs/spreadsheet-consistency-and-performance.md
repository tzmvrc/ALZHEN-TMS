# Spreadsheet consistency and performance repair

## Scope and safety

Continued the existing worktree without reverting earlier implementation work. No SQL, migrations, production fixture writes, commits, pushes or deployment. Browser fixture REST responses and identities are synthetic; the two-context collaboration run uses the isolated in-memory Socket.IO fixture on port 5199. Local application servers on 5173 and 5000 were already running and were preserved.

## Changes and root causes

- Removed `skewY(-8deg)` and narrow-header angle metadata. The shared header surface retains left alignment, natural wrapping, readable adaptive font sizing, resize/pin/sort/menu handlers and full-title tooltips.
- Shared Pencil/Trash action buttons now use the same 32px rectangular button and 16px icons, with accessible scope-specific labels. Master List's parent deletion uses that component. No separate cargo-delete fallback is offered in Master List, including for Staff.
- Centralized projected-row cargo deletion eligibility. Store-call and incident/backload/offload projections cannot substitute deletion of cargo or a parent trip. Exact trip/stop/line-item IDs are required, with projection deduplication. Partial failures remain selected; retries send only failed targets. The existing maximum of 20 and session-authorized endpoints remain unchanged.
- Tracker's header and body gutters now share centering, padding and checkbox geometry. Header sticky offsets use the measured formatting-toolbar height, so a wrapping toolbar does not misalign the gutter. Resized rows retain vertical centering.
- Selection previously used a module-wide external store shared by every report instance, including the two Dispatch Monitoring projections. It is now scoped to each retained grid and passed to its action toolbar. Other sheets no longer receive selection changes.
- React Activity reruns effects when showing a retained sheet. Initialization effects previously cleared searches, filters, pins and row selection on every return. Sheet/account and query guards now limit resets to actual scope changes. Session-token refresh alone does not reset a sheet.
- Viewport cleanup removed its calculated height while hiding retained content, expanding it and resetting scrollTop. Cleanup now disconnects observers without removing retained geometry. The browser regression reproduces the original 300px-to-0 reset and confirms 300px-to-300px after the fix.
- Memoized workspace grids, skipped identical applied-design snapshots and Tracker selection state, and separated DOM geometry reads from writes. Header font/title writes occur only when changed. Existing virtualization, background preloading, query caches and Realtime transports remain in place.
- Formula-bar typing mounted an inline editor with unconditional autofocus and changed the reference insertion focus owner. The inline editor now takes focus only for an intentional inline editing action; rendering it does not replace the active input reference. Formula-bar and inline reference selection now both pass the browser regression.
- Fixed the frontend layout inference errors: empty hidden/colors fallbacks inferred `never[]`/unindexable `{}`, and Flexible Tables pin metadata widened to arbitrary strings. Explicit existing layout/pin types preserve current behavior.

## Actions by sheet

| Sheet | Edit | Delete scope |
|---|---|---|
| Master List | Existing mapped row editor, shared Pencil | Existing Admin-only **Delete Entire Trip / Delete Selected Trips**; shared Trash; parent IDs deduplicated |
| Dispatch Monitoring | Existing mapped row editor | Cargo only when the projection supplies an exact line-item/stop/trip identity. Normal stop-only rows have no safe generic Delete |
| Dispatch Report | Existing mapped row editor | Exact cargo line-item endpoint; report/incident projections excluded |
| Trip Booking | Existing mapped row editor | Exact cargo line-item endpoint when all three IDs exist |
| Store Calling | Existing editor; `store_call_remarks` saves to `/store-calls/:store_call_id` | No delete endpoint exists; no unrelated cargo or parent fallback is exposed |
| Transmittal Tracker | Existing authorized tracker row editor | Existing explicitly labeled Admin whole-trip action preserved. No independent transmittal-record deletion is claimed |

### Remaining deletion dependencies

`DELETE /trips/:trip/stops/:stop` is routed to the legacy transaction cleanup workflow; deleting a final stop can delete its parent. It is not used for generic report deletion. A separate unexposed stop service is not an audited replacement and is not wired around the existing safeguards.

Store-call routes provide GET and PATCH only. Safe deletion needs a narrowly scoped, audited transaction covering the physical call and any retained/shared flexible-source references. Tracker is a delivery-stop projection with source/override cells, not one deletable transmittal object. Archiving an arbitrary flex row is not equivalent to deleting a tracker record and can be regenerated from its stop. A reviewed stop/call/transmittal deletion contract is needed before those child actions can be enabled. No SQL proposal was fabricated without checking live dependencies, and no migration was applied. UI consistency changes themselves need no Supabase changes.

## Verification

- Frontend targeted tests: **37 passed, 0 failed** (10 files).
- Backend collaboration/auth/record/event/socket targeted tests: **10 passed, 0 failed** (5 files; injected dependencies/in-memory sockets).
- Frontend `npx tsc -b --pretty false`: passes.
- Backend `npx tsc --noEmit --pretty false`: passes.
- Six Playwright fixtures pass:
  1. `spreadsheet-consistency.browser.js`: all six real retained sheets, headers, action visibility/dialog opening, zero data reads on cached return visits, query/selection isolation, scroll preservation, checkbox geometry and screenshots.
  2. `spreadsheet-row-actions.browser.js`: physical child DELETE URLs, no password, submission lock, partial success, failed selection retention, retry only failed targets, Staff/Trucker action restrictions, exact Store Calling source edit.
  3. `spreadsheet-editors.browser.js`: decimal/date commits, Escape, numeric wheel protection, configurable dropdown labels, relationship options with an existing value, search/select, viewport-contained popover and one reused lookup request.
  4. `unified-workspace.browser.js`: safe formula evaluation, source/overlay separation, inline and formula-bar references, selected expression vs unselected result, Escape, dependency recalculation, two-context mocked saved updates, failed refresh preserving drafts, Enter/blur deduplication.
  5. `live-cell-drafts.browser.js`: two browser contexts with real isolated Socket.IO transport; letter-by-letter previews, no typing/cancel writes, independent competing drafts, conflict notifications, failed-save preservation, reconnect snapshot, token refresh, browser refresh and logout cleanup.
  6. `live-cell-draft-performance.browser.js`: 5,000 mounted collaborative cells; 100 incoming draft events did not rerender the table owner or unrelated cells and made no HTTP requests.
- Runtime checks: frontend and backend health HTTP 200; unauthenticated report read and exact-child DELETE HTTP 401, before any data access/mutation.
- Existing assertions were updated for intentional current behavior: Master List naming, neutral pre-hydration layout, explicit forced stale-width polling, selected formula expression rendering, number-only gutters and concise toast copy. JSX tests run with `--tsconfig tsconfig.app.json` to use the application's automatic JSX runtime.

## Performance observations and limits

The initial development fixture saw occasional pointer-to-next-frame stalls above 100ms (one sample about 215ms). A warmed post-change 20-pointer sample was approximately 1?17ms and ten real cell clicks made zero API requests. These measurements are local samples, not a production latency guarantee or a controlled before/after benchmark. Twenty pointer frames measure immediate selection paint; complete editor activation remains a separate path.

The 220-record fixture rendered about 40 actual rows through existing virtualization. Warm sheet-return runs made **zero report-data reads**, but Playwright tab-click-to-ready timings still ranged from roughly 0.17 to 1.34 seconds across development runs. Network duplication is resolved in the fixture; more profiling with production-size column definitions is warranted before claiming Excel-level switching speed.

The 5,000-cell draft fixture painted 100 queued previews in about 38ms, with zero owner/unrelated renders and zero API requests. Two-session letter previews arrived in about 82?114ms including Playwright interaction overhead. Tracker checkbox horizontal center delta was 0px and resized-row vertical delta was below 1px (70px row).

Full production datasets, live authenticated deletion, live Supabase delivery/replica policy behavior, exhaustive export workflows and every field type on every report were not exercised. No production operational records or attachments were modified or deleted.

## Files changed in this pass

Application:
- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/ReportSpreadsheetShared.tsx`
- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/components/admin/SpreadsheetPresentation.tsx`
- `frontend/src/components/admin/SpreadsheetRowDeletionDialog.tsx`
- `frontend/src/components/admin/TransmittalTrackerView.tsx`
- `frontend/src/components/admin/useOperationalFormulas.tsx`
- `frontend/src/components/admin/useSharedTableDesign.tsx`
- `frontend/src/components/admin/useSpreadsheetSurface.ts`
- `frontend/src/pages/Admin/views/FlexibleTablesView.tsx`
- `frontend/src/services/report-row-actions.ts`
- `frontend/src/index.css`

Fixtures/tests:
- `frontend/tests/spreadsheet-consistency.browser.js`
- `frontend/tests/spreadsheet-row-actions.browser.js`
- `frontend/tests/spreadsheet-editors.browser.js`
- `frontend/tests/report-row-deletion.test.ts`
- `frontend/tests/report-row-actions.test.tsx`
- `frontend/tests/shared-design.test.ts`
- `frontend/tests/shared-widths.test.ts`
- `frontend/tests/trips-workspace-formulas.test.ts`
- `frontend/tests/unified-workspace.browser.js`
- `frontend/tests/live-cell-drafts.browser.js`
- `frontend/tests/live-cell-draft-performance.browser.js`

Screenshots are under `frontend/tests/artifacts/`. Earlier unrelated worktree modifications were preserved. No backend application source changes were needed in this pass.
