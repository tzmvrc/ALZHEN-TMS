# Spreadsheet UX, Realtime, selection and performance

## Implementation status

Implemented in application code. Runtime verification is deferred at the owner's request. No Supabase SQL, migrations, operational data changes, deployment, commit or push was performed.

## Workspace

- The stable `trips` sheet key now displays **Master List**. Existing formula identities, table-design namespace and bookmarks remain intact.
- Transmittal Tracker is the sixth retained bottom sheet. The redundant toolbar navigation button is removed. Existing Tracker editing, search, Prepare Sheet and Excel export remain in its original component.
- Bottom tabs retain connected active styling and recessed inactive styling, with slightly increased padding.

## Continuous records and rendering

- Master List explicitly disables the ongoing-only restriction and reads successive authorized report pages of 200 records. There is no aggregate 100/500-record cap.
- Physical identities deduplicate records between pages. Existing server-side search, filters and sorting apply to every request.
- Dispatch Monitoring server ordering includes the existing physical trip/stop/assignment keys as tie breakers.
- Shared, session-scoped collection requests are deduplicated, progressively delivered and cached. Abandoned queries stop requesting subsequent pages when no consumer remains.
- Version changes during a sweep mark its cache stale instead of recursively restarting the entire sweep. The existing dirty-event reconciliation remains responsible for catching concurrent changes.
- Variable-height virtualization renders an overscanned window with table spacer rows. Active editors and formula selections are kept mounted. Resized/multiline rows are measured with ResizeObserver. Source indexes, real-row totals and exports do not use spacer rows.
- Formula reads reuse pending per-row requests, use bounded 500-row payloads and at most three concurrent requests. Evaluator construction includes only formula/dependency rows and columns, rather than materializing every ordinary cell.

## Realtime

- Existing authenticated Socket.IO and Supabase connections are reused. No additional connections or publications were introduced.
- Confirmed source changes patch matching records; derived/new rows can be reconciled by fetching one physical trip and its dependent report rows.
- Concurrent changes to one trip coalesce, with a follow-up refresh if a second change arrives during its request. Active drafts defer incoming reconciliation.
- The per-view 60-second polling timer is removed. Existing shared recovery, reconnect, resume and online handling remain.
- Exact line-item DELETE acknowledgements use the existing backend collaboration stream. Their event IDs match the database bridge; client deletion deduplication also uses physical source identity.
- Session-scoped tombstones remove deleted parents/children from cached reports and filter late collection reads, preventing cached-row resurrection. Logout clears these tombstones and formula read caches.

## Loading design flash

The previous layout fallback rendered browser-local colors before the shared design loaded. That stale fallback could color Dispatch during initial loading, then disappear when the authoritative shared snapshot arrived. Layout hydration now uses a neutral order/color/pin fallback until shared design is available. Actual saved shared colors remain supported. Existing loading skeletons stay within the spreadsheet.

## Selection and formatting

- Real and virtual cells retain content-independent range selection. Selection outlines now override editor styles that previously suppressed them.
- Select Row supports nonadjacent physical rows. Row-number gutters become small checkboxes during row-selection mode. The checked header control clears the selection and exits that mode.
- Tracker now uses the shared context menu for row/column selection, including presentation-only blank cells.
- Formatting uses existing per-column shared defaults and stable physical per-cell overrides. Whole-column formatting uses defaults; row/range changes are grouped into existing column-design writes. Operational values are not changed.
- Virtual rows retain sheet-scoped slot identities and are never inserted as operational records.
- Empty text editors have no inserted placeholder value. Unsupported virtual/source writes remain protected.

## Headers, pinning and formula input

- Shared header measurement reduces narrow-header font sizes to a readable minimum, permits wrapping, and gives narrow titles a small angled treatment. Titles retain full-text tooltips. Only titles are transformed, not the grid/data columns.
- Pinned columns keep logical saved order. DOM/animation-frame measurements activate left/right sticky offsets only outside their natural viewport position. Multiple pins reserve space, including trailing action cells; pins that cannot fit remain in normal flow without erasing saved settings.
- Scrolling updates runtime CSS, not shared pin settings or React cell state on every horizontal pixel.
- Formula input text is reduced from 12px to 11px. Formula saving/evaluation semantics are unchanged.

## Deletion authorization and scope

- Whole-trip, optional-report and legacy transaction deletion use fresh bearer identity, application-session and profile-role checks without password reentry. Existing rate limiting remains. Whole-trip deletion remains Admin-only, feature-gated and limited to 20 unique trips.
- Password-based helpers remain available for unrelated explicit authentication acceptance paths, but spreadsheet deletion no longer uses them.
- Existing database retention, ownership, pending-upload, relational integrity, audit and recoverable Storage-cleanup mechanisms are unchanged.
- New bulk **line-item** selection actions reuse the existing exact `/trips/:trip/stops/:stop/line-items/:id` DELETE endpoint. IDs are validated/deduplicated, the operation is bounded to 20 physical line items, and one confirmation covers the batch. Each response must acknowledge the exact deleted ID. Failed/unconfirmed targets remain selected and partial outcomes are reported.
- The existing endpoint now checks the DELETE acknowledgement rather than reporting success from an earlier ownership read. Confirmed deletions include structured actor/physical-record logging and collaboration notifications.
- Parent deletion remains an explicitly labeled **Delete Entire Trip / Delete Selected Trips** action. Line-item deletion does not fall back to that workflow.

## Remaining limitations

- Stop-only rows and other projections without a verified line-item target do not receive generic row deletion. This deliberately avoids the legacy last-stop path, which can remove a parent trip. Existing explicit Admin whole-trip deletion remains available.
- Bulk line-item deletion consists of independent existing endpoint requests, not one cross-record transaction. A network loss after commit can leave an unconfirmed outcome requiring reconciliation; it is not silently counted as success.
- Large row/range-format selections remain subject to existing shared-design payload/override limits. Failed saves retain pending formatting and existing retry/error handling. Whole-column defaults avoid per-record writes.
- Entire filtered collections are loaded into client memory, while DOM rows are virtualized. Extremely large collections still have network/memory costs. Paginated sweeps are not a single database snapshot; concurrent mutations are reconciled through confirmed events and recovery.
- Row heights retain the existing account/table-scoped local lifecycle; this task does not add database row-height storage.
- No runtime performance numbers or successful application checks are claimed.
- No Supabase changes are required by these code changes. Any future increase in database-enforced design-size limits or new audited stop-only deletion semantics requires separate schema review/approval.

## Files modified

### Frontend

- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/services/trips-workspace.ts`
- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/TransmittalTrackerView.tsx`
- `frontend/src/components/admin/OperationsReportsView.tsx`
- `frontend/src/pages/Admin/views/FlexibleTablesView.tsx`
- `frontend/src/components/admin/useSpreadsheetSurface.ts` (new)
- `frontend/src/components/admin/useSpreadsheetHeaderFormatting.tsx`
- `frontend/src/components/admin/useVirtualSpreadsheetRows.ts` (new)
- `frontend/src/components/admin/SpreadsheetPresentation.tsx`
- `frontend/src/components/admin/SpreadsheetFormulaBar.tsx`
- `frontend/src/components/admin/useOperationalFormulas.tsx`
- `frontend/src/components/admin/SpreadsheetRowDeletionDialog.tsx` (new)
- `frontend/src/components/admin/WholeTripDeletionDialog.tsx`
- `frontend/src/components/admin/TripIssues.tsx`
- `frontend/src/services/report.service.ts`
- `frontend/src/services/operational-formula.service.ts`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/realtime.service.ts`
- `frontend/src/services/collaboration.service.ts`
- `frontend/src/services/trip.service.ts`
- `frontend/src/services/whole-trip-deletion.ts`
- `frontend/src/services/operations-report.service.ts`
- `frontend/src/index.css`

### Backend

- `backend/src/services/deletion-password.service.ts`
- `backend/src/services/whole-trip-deletion.service.ts`
- `backend/src/services/operations-report.service.ts`
- `backend/src/services/transaction-deletion.service.ts`
- `backend/src/services/collaboration-events.ts`
- `backend/src/services/trip.service.ts`
- `backend/src/services/report.service.ts`
- `backend/src/routes/trip.routes.ts`

### Documentation

- `docs/phase-4-spreadsheet-ux-and-performance.md`
