# Phase 4 ? Advanced spreadsheet and unified trip reporting

## Scope and evidence

Implemented in the existing worktree. No tests, new test files, browser automation, lint, TypeScript checks, or builds were run, as requested. Application behavior described below is implemented in source and remains unverified at runtime. The Supabase migration installation and read-only catalog/count verification were performed live.

## 1. Column aliases and configuration

Shared report column metadata now accepts a display-only `alias`, compatible `input` configuration, and a stacked-presentation preference. Double-click a header or use its three-dot menu to rename it; Enter saves and Escape cancels. Restore default title removes only the alias. Physical field names, column keys, filtering, value exports, and backend edit mappings are unchanged. Existing revision-based shared-design saves and notifications are reused.

Flexible columns use their existing versioned `settings.appearance.alias`, with existing manage permissions. Existing width, order, pinning, visibility, header styling, and cell formatting are retained.

A compact configuration dialog exposes safe scalar text/dropdown conversion for an explicit allowlist of editable text fields. Numeric/date fields retain their supported editors. Database relationships cannot be converted into free text. Existing status fields use the existing managed-dropdown service rather than arbitrary column metadata. Fixed status semantics and backend transition validation remain authoritative.

Custom flexible columns use their existing definition/options APIs. Populated non-text columns retain their types; text/dropdown conversion preserves stored values, and formula columns cannot be converted to dropdowns. Option labels, colors, and active state are configurable. Saved option values are not silently rewritten or deleted. Config saves that require several existing API calls can partially complete; the dialog explicitly reports that condition rather than claiming atomicity.

Dropdown colors are shared through `tms_dropdown_options.color`; flexible options already have color storage. Selected values render as subtle colored pills through the existing searchable floating dropdown editor. Historical inactive values remain readable.

## 2. Formula bar, evaluation, identity, and fill

The shared formatting toolbar accepts a compact formula bar. Authoritative report fields expose a read-only value viewer. Editable formulas are limited to custom flexible text/number cells; relationship, status, financial, and other operational source fields cannot be overwritten with formula results.

The bounded parser supports arithmetic, comparisons, parentheses, SUM, AVERAGE, MIN, MAX, COUNT, and lazy IF. It does not execute JavaScript. Expressions, tokens, nesting, ranges, reference counts, and evaluation work have limits. Errors include invalid references, division by zero, cycles, unsupported names, and invalid syntax.

`flex_cells.formula` stores the expression and an address-to-physical-row/column reference map. Formula cells store NULL in `value`; calculated results are evaluated for display, not written into authoritative operational values. References are authorized against the same flexible table on the backend. Recalculation uses physical IDs and a render-snapshot cache, independent of filtered/visible row indexes.

New references use the canonical loaded row/column order. Cell picking in the formula bar inserts references and binds physical IDs. Existing unchanged references retain their bindings after layout changes. Absolute/mixed references are supported. Formula fill previews the range and shifts relative references on pointer release, preserving absolute references. It is limited to 100 destinations and uses existing versioned cell saves. Fill is a series of confirmed cell saves, not a batch transaction; a later failure leaves earlier confirmed cells saved and reports partial completion. Cancel/drag cancellation writes nothing.

Complete flexible-table dependency reads are paged rather than silently relying on the default PostgREST row cap. Explicit bounded loading limits remain; very large tables return a limit error. Formula behavior after complex row insertion/repositioning, concurrent layout changes, or partial fill requires later interactive acceptance. Deleted references display errors rather than rebinding to unrelated records.

## 3. Combined presentations and alignment

The common report grid stacks driver above plate number and dispatch above DR where both source columns exist and neither was explicitly hidden. Existing underlying columns remain in the registry for search, APIs, exports, and separate-column presentation. A shared menu setting restores separate columns. Aliases and visibility preferences are preserved.

Driver and truck retain separate relationship edit targets. Existing driver assignments are preserved during truck changes. When an unassigned trip changes truck, the backend requires a unique driver from active physical assignments or asks for explicit driver selection; it never infers identity from plate text.

Trips uses its existing stop-specific `transaction_dr_number` mapping. Other report DR fields retain their existing mappings. The dispatch label is presentation only, never a concatenated saved value or an implicit dispatch edit. Separate DR/transaction source fields and stop rows remain available rather than discarding additional DRs.

Shared spreadsheet CSS defaults ordinary data and headings to left alignment. Gutters remain centered; explicit inline shared-design alignment overrides remain authoritative.

## 4. Unified Trips issues

Trips now has a configurable `Issue / Report Type` action column and All, In Progress, Demurrage, Offload, and Completed chips. Filters use actual lifecycle status or actual issue source relationships before server pagination/counting. Lifecycle status and report type remain separate concepts. Filtering is disabled during active cell editing/fill so it does not discard a current draft.

The new narrow management-only trip-issues endpoints read existing offloads, backloads, demurrages, and incidents. They validate physical parent/stop identity. Offload/backload creation and edits delegate to the existing services, preserving original creator, submission idempotency, upload authorization, and cleanup rules. Demurrage creation records the trusted actor and uses a request UUID for retry deduplication; reason updates do not alter financial values. New incidents remain in the existing incident workflow; their existing reasons can be edited here.

Each issue remains individually accessible. A summary/count does not merge or replace reports. The dialog provides reason editing, stop selection where required, existing images/receipts, up to five locally previewed upload files, per-file retry IDs, and CSV export. Offload creation still requires an eligible DR-backed stop. The existing private image APIs are reused. Record-only Offload/Backload deletion uses the existing current-user password endpoint and safeguards; it never invokes whole-trip deletion. Pending Storage cleanup is reported accurately.

The separate Admin Offload Reports navigation was removed only after the Trips interface was added. Old section names resolve to Trips. Legacy report notification references resolve through an exact source/record lookup to the parent Trip Details/stop, rather than treating a report ID as a trip ID. The OperationsReportsView component, source tables, historical records, and existing underlying PDF/export APIs were retained. The new dialog offers CSV; it does not add a new PDF generator or a full historical analytics screen.

## 5. Realtime and authorization

Existing shared-design notifications and flexible-table change signals carry aliases, configuration, option colors, and formula metadata. Existing application report commits invalidate relevant issue/report caches and defer reconciliation through the grid's existing active-edit safeguards. No new Socket.IO connection, protocol, broker, publication, or localStorage-based shared-layout fallback was added.

New trip-issue routes require authenticated ADMIN/STAFF management access. Existing flexible-table view/edit/manage checks remain. Trucker reporting continues through its existing assigned-trip service and UI. Client-supplied creator identity is not used. Current whole-trip password, retention, ownership, and role protections were not changed.

## 6. Supabase migration ? APPLIED

- Project: `hdmknewarynwpbrhfgai` (MCP configured project reference and backend/frontend URL references matched).
- File: `backend/migrations/2026_11_15_spreadsheet_formula_dropdown_metadata.sql`
- Name: `spreadsheet_formula_dropdown_metadata`
- Version: `20261020050459`
- SHA-256: `55BD3D7DFD648FD86B474E3FDB753C43C99770F55009FD4A03959CB1CB239C88`
- Added nullable `public.flex_cells.formula jsonb` and `public.tms_dropdown_options.color text`.
- Added and validated bounded formula/NULL-value and six-digit hex-color constraints.
- Transaction plus advisory transaction lock; no operational DML, destructive backfill, or Storage operation.
- Existing JSON shared-design storage already supports the extensions; no second design store was created.
- Existing RLS/service-role boundaries, grants, triggers, and Realtime publication memberships were preserved. No additional publication or Storage policy change was needed.
- Rollback is documented in the migration and must preserve any newly authored metadata before removing columns. It is not an operational-data rollback.

Read-only before/after counts matched:

| Table/measure | Before | After |
| --- | ---: | ---: |
| Trips | 4 | 4 |
| Trip stops | 5 | 5 |
| Flexible cells | 35 | 35 |
| Offloads | 0 | 0 |
| Backloads | 0 | 0 |
| Managed dropdown options | 15 | 15 |
| Non-null formula cells | 0 | 0 |
| Non-null managed option colors | 0 | 0 |

Migration history and both validated constraints were read back after installation. Counts establish consistency, not a byte-for-byte audit of concurrent user activity. No existing production record was used as a test fixture.

## 7. Files changed

### Backend

- `backend/src/routes/report.routes.ts`
- `backend/src/services/assignment.service.ts`
- `backend/src/services/dropdown-option.service.ts`
- `backend/src/services/flexible-table.service.ts`
- `backend/src/services/report.service.ts`
- `backend/src/services/table-design.logic.ts`
- `backend/src/services/trip-issues.service.ts` (new)
- Migration listed above (new)

### Frontend

- `frontend/src/components/admin/DashboardPrimitives.tsx`
- `frontend/src/components/admin/FlexibleColumnConfiguration.tsx` (new)
- `frontend/src/components/admin/OperationsReportsView.tsx`
- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/ReportDropdownEditor.tsx`
- `frontend/src/components/admin/ReportSpreadsheetShared.tsx`
- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/components/admin/SpreadsheetColumnConfiguration.tsx` (new)
- `frontend/src/components/admin/SpreadsheetFormulaBar.tsx` (new)
- `frontend/src/components/admin/SpreadsheetPresentation.tsx`
- `frontend/src/components/admin/TransmittalTrackerView.tsx`
- `frontend/src/components/admin/TripIssues.tsx` (new)
- `frontend/src/components/admin/useSpreadsheetHeaderFormatting.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/Admin/DashboardPage.tsx`
- `frontend/src/pages/Admin/views/FlexibleTablesView.tsx`
- `frontend/src/services/dropdown-option.service.ts`
- `frontend/src/services/flex-column-appearance.ts`
- `frontend/src/services/flexible-table.service.ts`
- `frontend/src/services/realtime.service.ts`
- `frontend/src/services/report.service.ts`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/spreadsheet-formula.ts` (new)
- This documentation (new)

## 8. Remaining acceptance limits

No compilation or runtime verification was performed. Cross-session synchronization, mobile layout, formula fill/cancellation, relationship assignment changes, issue uploads/retry, and legacy-link behavior require the later testing phase. Large issue datasets currently use a bounded read and trip-ID filtering through the existing report query; large ID sets may require a dedicated database filtering function in a later scale pass. Formula authoring is deliberately unavailable on authoritative operational fields. No production report submissions, uploads, deletions, or formula edits were executed.

No deployment, commit, push, GPS/Mapbox provider call, feature-flag change, or production Storage deletion occurred.
