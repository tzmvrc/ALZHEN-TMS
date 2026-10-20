# Phase 3B - Table layout and dashboard refinements

## Changes

1. **Attached Offload spreadsheet:** formatting, grid and pagination now use a single shared bordered shell. Removed inter-component spacing and duplicate inner borders. Formatting handlers and revision-based design persistence remain unchanged.
2. **Selection actions:** report toolbar actions require selected physical dataset rows, in addition to existing role and entity checks. Stale selection keys and presentation filler rows cannot create an action toolbar. Tracker and Operations retain their existing permissions and unsupported-multi-edit disabling. Export and Prepare Sheet are unchanged.
3. **Feedback:** removed persistent backend outcome lists, load/error banners, shared-layout warnings, cell-save labels and diagnostic conflict text. The existing toast provider receives concise messages without raw API/RPC/SQL details or record IDs. The specific delete-report message came from the backend `read report before delete` validation, was returned per report, then rendered with a source/dispatch label in the Operations outcome list. That list is removed; actual failed/partial/pending-cleanup outcomes retain accurate error or warning feedback. No database deletion logic changed. Layout retry icons and reload controls remain available. Cleanup recovery moved to an icon-triggered dialog, preserving existing retry services and ownership/retention enforcement.
4. **Compact row numbers:** one shared 52px gutter constant replaces the previous 72px selection gutter. Number-only Flexible Table gutters derive a 32px width from it. Reduced left padding and number/checkbox spacing; actual and filler rows use matching widths. Pin offsets and Flexible Table colgroups follow those widths.
5. **Offload categories:** removed the All/Backload/Offload segmented selector and its local state/handler. The existing All dataset remains the default; explicitly supplied server filter context is respected. Report event types, data and submission workflows remain intact.
6. **Attached footer:** introduced `SpreadsheetFooter`, reused by Combined, Tracker and Operations/Offload. It renders real totals as `9 rows \u00b7 Page 1 of 1` (a real middle dot in the UI), keeps existing pagination handlers and provides a single-page footer when pagination is off. Filler rows never affect totals.
7. **Dashboard density:** reduced shared outer dashboard padding, shared page-heading/section-header margins, report workspace spacing and flexible-table tab spacing. All Admin panels benefit from the shared canvas change, including Users and non-report sections. Page titles and navigation remain. Viewport measurement now accounts for ancestor bottom padding/borders and observes layout ancestors so attached footers retain available space as panel geometry changes.

## Files changed in this phase

- frontend/src/components/admin/SpreadsheetPresentation.tsx
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/components/admin/OffloadCleanupNotice.tsx
- frontend/src/components/admin/useSharedTableDesign.tsx
- frontend/src/components/admin/useSharedTableWidths.tsx
- frontend/src/components/admin/useManagementTableColumns.tsx
- frontend/src/components/admin/FlexibleTableSectionTabs.tsx
- frontend/src/components/admin/ReportsWorkspace.tsx
- frontend/src/components/admin/DashboardPrimitives.tsx
- frontend/src/components/admin/dashboardStyles.ts
- frontend/src/pages/Admin/DashboardPage.tsx
- frontend/src/pages/Admin/views/ResourceView.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- docs/phase-3b-table-layout-dashboard-refinements.md

## Reuse and safety

Reused the existing formatting toolbar, cell format storage, physical row identities, selection stores, pagination, toast provider, cleanup services and Realtime infrastructure. Shared additions are presentation constants and a footer; the management column hook accepts an optional leading-column width while keeping its old default for other tables.

No backend or Supabase changes are required. No SQL, database writes, Storage changes, deployments, commits or pushes were performed. Pre-existing working-tree changes were preserved.

## Verification deferred

Per the requested workflow, no tests or test creation, browser automation, Playwright, lint, TypeScript checks or production builds were run. Layout appearance, responsive overflow, pinned-column alignment, dialog interaction and Realtime regressions remain unverified until the later verification phase. No live success or regression-test result is claimed.
