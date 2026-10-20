# Phase 3F - Header formatting, report toolbar and Offload bulk deletion

## Verification boundary

Coding and source inspection only. No tests or new test files, browser automation, lint, TypeScript checks, builds, Supabase queries/SQL, production deletion, deployment, commit or push were performed. Existing unrelated worktree changes were preserved. This document describes implementation, not runtime acceptance or live incident reproduction.

## 1. Shared headers

Combined Report's compact header is the shared reference: four pixels of vertical padding around a minimum 24px content track, normally producing a 32px single-line header. Shared CSS controls typography/alignment, while titles wrap and increase height naturally. There are no separate per-report fixed header heights. Existing column drag, menus, pin offsets and resizing remain in their components.

Applied through ReportDataView (Trips, Combined and internal reports), Transmittal Tracker, Operations/Offload and Flexible Tables. The same scoped header CSS applies to other spreadsheet grids.

## 2. Header-only color selection and persistence

A shared `useSpreadsheetHeaderFormatting` hook keeps ephemeral header selection separate from data-cell selection. Header clicks/keyboard activation show an outline and route the formatting toolbar to colors only. Bold, italic and underline are not offered for a selected header. Column titles stay read-only; column menu, sorting and drag controls retain their existing behavior. Selecting a data cell restores normal cell formatting. No report rows are bulk-selected by header color selection.

Existing column-design JSON now supports a narrowly validated `header` object containing only `color` and `backgroundColor`. Backend validation rejects other header attributes and invalid colors; frontend/backend merge functions preserve unrelated metadata and merge independent color changes. The existing revision-aware table-layout API, authorization, retry and synchronization are reused. Headers inherit whole-column defaults, with explicit header colors taking precedence; these overrides are never applied to body or filler cells.

Flexible Tables stores the same color overrides under its existing versioned `settings.appearance.header` metadata. Its existing manager-authorized column update API and Realtime refresh remain in use. Local previews are immediate, and failed Flexible header saves roll back only their own optimistic metadata. Shared design failures retain the existing unsaved-draft/retry behavior. No database fields or endpoints were added.

Cross-user persistence is implemented through these existing shared APIs and synchronization channels; it was not tested live in this phase. The running backend must load the updated validator before shared header writes are usable.

## 3. Report navigation and toolbar

`REPORT_TOOLBAR_ROW_CLASS` supplies one common responsive flex row. Combined Report's formerly separate right action groups are joined. Transmittal uses the same layout. ReportsWorkspace now passes the navigation slot into OperationsReportsView and OperationsEventsTable instead of rendering Offload tabs on a separate line.

The left slot contains the existing report navigation. The right slot retains existing viewer avatars, search, conditional Edit/Delete, and each report's actions. ColumnFinder continues to own its existing viewer/search controls, so no duplicate presence subscriptions or search controls were added. The formatting toolbar remains attached to the grid. Retained views are preserved. Narrow screens may wrap the toolbar without forcing a separate desktop navigation row.

## 4. Bulk deletion: code-level findings and corrections

The exact user's live request was not reproduced. Inspection identified these concrete failure paths:

- The combined All dataset includes trip-scoped Loading reports. Their legacy record-delete read incorrectly selected `trip_stop_id`, unlike the existing Loading read projection. The query now selects only `id, trip_id` for Loading. Existing receipt/history restrictions remain.
- The frontend target resolver returned an invalid selection when multiple visual rows referenced the same physical report. It now validates each source identity, deduplicates by `(source_type, source_record_id)` and retains all associated selected row IDs for reconciliation.
- Selection scope included the entire changing row snapshot. A successful partial deletion or refresh consequently cleared failed selections. Scope now follows authenticated account, page, filter/search and sort context, intersected with the available real rows, rather than the mutable row-list fingerprint.
- A non-ApiError late in a backend batch could discard all earlier outcomes. Each record now receives an explicit confirmed-success or unconfirmed-failure outcome. A notification failure cannot turn a committed deletion into a failure. Cleanup acknowledgement exceptions after committed cargo deletion return cleanup-pending, retaining the durable journal.
- Outcome messages could lose their useful counts through generic error sanitization. Strictly matched locally composed count summaries are retained; raw backend messages remain sanitized.

The Offload screen's Select All selects visible Offload/Backload report records only. Loading/Unloading records remain visible and can still be individually selected for their existing edit workflow, but do not expose this cargo bulk-delete action. The handler also rejects non-cargo targets. No report type is converted or deleted implicitly.

## 5. Exact deletion scope and API

The screen continues to use `POST /reports/operations/reports/delete` with the current account password and immutable source-type/record-ID batch. Existing ADMIN/STAFF management authorization and current-user password checks remain; no whole-trip API/RPC is used.

OFFLOAD uses `delete_offload_with_cleanup_v1`; BACKLOAD uses `delete_backload_with_cleanup_v1`, through the existing shared cargo deletion/cleanup service. Their approved ownership, pending upload, retention, audit and durable cleanup checks remain unchanged. Only the selected physical report and eligible exclusively owned child data/attachments are eligible. Parent trips, stops, trip line items, assignments, unrelated PODs/transmittals/reports and shared objects remain outside this action.

A batch is a sequence of independently protected record operations, not an atomic all-or-nothing batch. Success/failure counts reflect unique physical reports. Failed records stay selected. Successful physical keys are excluded locally from stale responses. The confirmation retains password confirmation, a loading spinner and duplicate-submission guard; the 20-record batch limit is applied to deduplicated targets. Storage cleanup pending is reported as a warning, never as a failed relational deletion or a completed file removal.

Successful deletions publish existing management-authorized Socket.IO commit/invalidation events with stable event IDs. The existing frontend Realtime bridge reconciles cargo/operation cache sources and cleanup metadata. No new socket connection, event protocol or publication was introduced. Existing deferred refresh preserves active edits; remote invalidations do not create another initiating-user success toast.

## Files changed in this phase

Frontend:

- `frontend/src/components/admin/useSpreadsheetHeaderFormatting.tsx` (new shared selection hook)
- `frontend/src/components/admin/ReportSpreadsheetShared.tsx`
- `frontend/src/components/admin/ReportSpreadsheetUtils.ts`
- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/TransmittalTrackerView.tsx`
- `frontend/src/components/admin/OperationsReportsView.tsx`
- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/components/admin/SpreadsheetPresentation.tsx`
- `frontend/src/pages/Admin/views/FlexibleTablesView.tsx`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/flex-column-appearance.ts`
- `frontend/src/services/operations-report-delete.ts`
- `frontend/src/services/realtime.service.ts`
- `frontend/src/index.css`

Backend:

- `backend/src/services/table-design.logic.ts`
- `backend/src/services/operations-report.service.ts`
- `backend/src/services/offload-deletion.service.ts`

Documentation:

- `docs/phase-3f-header-formatting-offload-deletion.md`

DashboardPage and useSharedTableDesign were inspected and reused without additional Phase 3F changes.

## Supabase requirements and limitations

No new Supabase migration, permission, RLS, Storage policy or Realtime publication change is required by these changes. They depend on the previously installed shared-design JSON metadata and cargo cleanup RPCs. Those live definitions were not reverified during this coding-only phase.

Later acceptance must cover header selection versus sorting/dragging, color saves across two sessions/devices, permissions, responsive navigation, duplicate physical report rows, partial failures, password failures, cleanup retries, active drafts and concurrent cache updates. A local backend restart or its existing watcher is needed to load the updated backend code; no service restart or runtime acceptance is claimed here.
