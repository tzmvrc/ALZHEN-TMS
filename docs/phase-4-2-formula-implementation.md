# Phase 4.2 - Operational formulas and toolbar

## Status and evidence boundary

Formula code and toolbar integrations are implemented locally. The additive formula migration was installed in live Supabase and verified using read-only catalog/count queries. No tests, new tests, browser automation, lint, type checks, builds, or application runtime acceptance were performed, as requested. Source integration is not production acceptance.

Convoy findings and the unimplemented design are in `docs/phase-4-2-convoy-planning.md`. No convoy schema or assignment changes were made.

## Storage architecture

Operational calculations use `public.spreadsheet_cell_formulas`, separate from all source records. Its identity is `(table_key,row_identity,column_key)`, with UUID ID, expression, physical reference bindings, version, original/updating actor and timestamps. Removal is a versioned tombstone (`is_deleted`), not physical row deletion; this prevents an old client from recreating a removed formula using a reset version. Removing an overlay restores the underlying source display. No formula expression/result is sent through normal report update APIs.

Row identities use physical trip, stop, line-item, assignment and applicable incident/billing/report IDs; Store Calling uses `store_call_id`, Tracker uses `trip_stop_id`, and Operations uses source type plus physical report ID. Display indexes, aliases, dispatch text and DR text are not persistent identities. Ambiguous/duplicate physical report rows are rejected rather than arbitrarily chosen. Assignment replacement or source deletion may make an old composite row unavailable, producing a reference error instead of silently rebinding it.

Flexible Tables retain `flex_cells.formula` and their original versioned cell/audit services. No flexible formula data was copied to the new table. Only supported custom text/number cells use that storage; source-backed report calculations use overlays.

## Shared safe engine

The existing Phase 4 parser/evaluator was moved to one browser/server ESM package, `packages/spreadsheet-formula`, with TypeScript declarations. The frontend service re-exports it; the backend imports the same implementation for syntax/reference validation. Vite explicitly allows this narrow shared package directory, without exposing the backend source tree.

Supported: +, -, *, /, parentheses, unary signs, numeric comparisons, equality/inequality, TRUE/FALSE, lazy IF, SUM, AVERAGE, MIN, MAX and COUNT. References include relative, absolute and mixed anchors and bounded ranges. There is no eval, dynamic JavaScript execution or external data fetch in the evaluator.

Bindings map expression addresses to physical row/column IDs at authoring. Expressions remain visible independently of those bindings. Recalculation follows formula dependencies using a memoized physical-cell graph, checks cycles/depth, and displays #REF!, #DIV/0!, #VALUE!, #CYCLE! and bounded-parser errors. Hidden-column dependencies are included in evaluation; column order/aliases do not redefine saved bindings. Deleted/unavailable references are not replaced by sibling rows.

## Backend endpoints

All operational endpoints are under `/api/reports`, authenticated ADMIN/STAFF only:

- `POST /formulas/read`: table key plus bounded physical rows; returns overlays/tombstones and authorized source values for their transitive dependencies.
- `POST /formulas/save`: create/update/remove a formula with an expected version. `expression:null` removes the overlay, preserving its version history marker.
- `POST /formulas/batch`: the same validation, bounded to 50 unique destinations, then one atomic database RPC.

The backend validates the table allowlist, actual source column registry, expression syntax, exact reference address set, same-table physical references, row existence, source relationships, permissions, payload bounds and expected versions. It hydrates references through existing authorized report/Tracker/Operations services. Tracker edits also check its existing flexible-table edit access. Formula errors never become a source-field edit fallback.

The service-only `save_spreadsheet_formulas_v1(uuid,text,jsonb)` rechecks the acting profile's role, serializes writes per table, verifies all versions, applies the complete batch, and rejects cycles in the resulting graph within one transaction. A blocked/conflicting operational batch rolls back entirely. Tombstones keep versions monotonic across remove/recreate operations. API result loss is reported as unconfirmed; a retry cannot bypass the expected-version check.

Flexible fill adds `POST /api/flexible-tables/:tableId/formulas/batch`, reusing existing per-cell edit authorization, audit and version checks. It returns confirmed cells plus the first failure and explicitly states `atomic:false`. Earlier confirmed custom-cell saves can remain committed. This preserves the existing storage contract instead of pretending a frontend loop is a transaction. Single-cell flexible formula saves also use shared server-side syntax validation.

## Frontend integration

One reusable `useOperationalFormulas` hook and existing `SpreadsheetFormulaBar` are used by:

- Trips and Combined Report
- Dispatch Monitoring and Dispatch Report
- Trip Booking and Store Calling
- Other ReportDataView report projections, when they expose unambiguous supported physical identities
- Transmittal Tracker
- OperationsReportsView spreadsheet cells (even though separate Offload dashboard navigation remains removed)

Flexible Tables keep their existing formula editor and use the same engine/bar.

Selecting a data cell selects an overlay target without creating an operational record. The formula bar shows its expression or source value. Typing creates only a memory draft. Enter saves, Escape cancels, and valid blur saves once, protected by an in-flight lock. Clicks during formula composition insert physical cell references and preserve caret position. Formula-backed cells intercept normal source-editor activation, so editing a formula cannot accidentally change the underlying field.

Calculated cells are visibly marked fx, with a source tooltip. The active overlay has Source inspection and Remove formula controls. Emptying/removing a formula restores the source value. Ordinary scalar source editing remains in the existing cell editor; non-formula text entered as an overlay is rejected with an explanation. Headers/action columns are not formula data cells.

Active formula drafts are retained during saved update notifications. Reference picks and drag listeners are cleaned up on cancellation/account change. Saved conflicts retain the draft, show an error, and provide explicit metadata refresh/review before retry. No text draft is stored in persistent browser storage. Existing selection/formatting, source live typing, source save-on-Enter/blur, aliases, row sizing, column design and separate Driver/Plate/Dispatch/DR columns are retained.

## Pagination and fill

New references use the current displayed column axis and actual page-offset row labels; persistence stores physical IDs. Existing bindings can resolve dependencies outside the current page. New references to unloaded/unbound rows are rejected rather than guessed from another page. Navigate to/reference a loaded row when authoring new dependencies; this is a bounded authoring model, not a server-wide Excel address resolver.

Drag the formula handle to preview a range, then release to commit. Relative references shift using bound physical rows, absolute references remain fixed, and quoted text is not rewritten. Operational fill is at most 50 cells per atomic batch. Flexible fill uses the bounded partial-result endpoint described above. Fill requires relative destinations/references to be in the available row axis; unavailable references fail safely. Mixed-anchor range behavior and fill after complex sorting require later acceptance; no runtime claims are made.

## Realtime and recalculation

The new formula table is in the existing Supabase Realtime publication with management-only SELECT RLS. The existing authenticated admin channel now also listens to this table; no duplicate connection or new broker is introduced. Saved overlay changes produce targeted formula metadata refresh, not a full-table reload. Reconnect triggers formula reconciliation; existing visibility/resume behavior is retained. Existing source signals drive dependency refreshes. Events are coalesced, and active drafts/source edits defer formula snapshot reconciliation. Confirmed source values, not remote unsaved keystrokes, drive calculations.

## Exports

Existing operational export functions continue reading authoritative source datasets; overlays are never merged into those row objects. An explicit `Export calculated page` action exports visible calculated values only and labels the scope accordingly. Text beginning with spreadsheet-executable prefixes is quoted/prefixed to prevent CSV formula injection. Custom flexible calculations remain separate expression metadata with client-side display results; no authoritative source export is silently replaced.

## Toolbar

Formatting controls and formula bar are now grouped on the left in this order: font-size icon, Bold, Italic, Underline, text color, fill color, fx, input, help. No auto left-margin spacer pushes formulas right. The shared row wraps responsively and search/viewers remain in their separate report toolbar.

Font size is icon-only by default, using ALargeSmall. The popover shows the current selected size and existing options, supports arrows/Enter/Escape and outside-click dismissal, closes after selection, and reuses existing formatting persistence. Opening it alone never changes size. Mouse interactions preserve the selected cell/editor focus where practical.

## Supabase installation

- Target: `hdmknewarynwpbrhfgai`; MCP and backend/frontend project references matched.
- File: `backend/migrations/2026_11_16_spreadsheet_operational_formulas.sql`
- Migration: `20261020074222 - spreadsheet_operational_formulas`
- SHA-256: `0E9A862B4AB873E43EB939C598653B3B527B3A0020052F8018F3FCA3B058108F`
- Result: APPLIED; table, unique identity, constraints, RPC signature/ACL/search path, SELECT policy, enabled RLS and one publication membership read back.
- Authenticated users have SELECT only, gated to ADMIN/STAFF by RLS. Anon has no table access. Only service_role/postgres can execute the RPC; writes pass through the authenticated backend.
- Existing operational grants/policies/triggers were not modified. No data backfill, Storage change or convoy migration was performed.
- Transaction/advisory lock protect installation. Reversal requires preserving newly authored overlay metadata before removing the new objects; it is not an operational data restore.

Read-only counts before/after installation: trips 0/0, stops 0/0, assignments 0/0, PODs 0/0, flex_cells 28/28; new overlay rows 0. Offloads and Backloads were also zero at preflight. These are the current phase measurements, not the older Phase 4 checkpoint counts. No operational records were deleted by this work. No live formula-save RPC or report submission was used as a test.

## Files changed in this phase

### Backend / shared package

- backend/migrations/2026_11_16_spreadsheet_operational_formulas.sql (new)
- backend/src/services/spreadsheet-formula.service.ts (new)
- backend/src/services/flexible-table.service.ts
- backend/src/controllers/flexible-table.controller.ts
- backend/src/routes/flexible-table.routes.ts
- backend/src/routes/report.routes.ts
- packages/spreadsheet-formula/index.js (new)
- packages/spreadsheet-formula/index.d.ts (new)
- packages/spreadsheet-formula/package.json (new)

### Frontend / documentation

- frontend/src/components/admin/useOperationalFormulas.tsx (new)
- frontend/src/services/operational-formula.service.ts (new)
- frontend/src/services/spreadsheet-formula.ts
- frontend/src/components/admin/ReportDataView.tsx
- frontend/src/components/admin/TransmittalTrackerView.tsx
- frontend/src/components/admin/OperationsReportsView.tsx
- frontend/src/components/admin/ReportSpreadsheetShared.tsx
- frontend/src/components/admin/SpreadsheetFormulaBar.tsx
- frontend/src/pages/Admin/views/FlexibleTablesView.tsx
- frontend/src/services/flexible-table.service.ts
- frontend/src/services/realtime.service.ts
- frontend/src/index.css
- frontend/vite.config.ts
- docs/phase-4-2-formula-implementation.md (new)
- docs/phase-4-2-convoy-planning.md (new)

## Remaining limits / later verification

Application compilation, visual interaction, two-user sessions, mobile layout, source-editor focus transitions, network-failure recovery and dependency/fill behavior have not been run. No test count is claimed. Reusing the parser across browser/server requires including the shared packages directory in later runtime packaging. New-reference authoring is bounded to loaded cells; saved references can resolve off-page. Overlay hydration is bounded to 500 physical rows, 100 trip scopes and 5,000 stored overlays per table; the parser bounds expressions to 2,000 characters and ranges/reference sets to 1,000. Batches are at most 50. Larger scopes produce explicit errors instead of partial hidden data. Legacy flexible saves remain individually versioned, not transactionally atomic; display evaluation still detects persisted dependency errors/cycles.

No deployment, commit, push, feature activation, GPS capture, provider request, Storage deletion or modification of operational customer data was performed.
