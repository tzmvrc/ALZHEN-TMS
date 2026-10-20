# Phase 3G - Header styling and shared design fixes

## Scope

Source inspection and implementation only, plus the requested local backend restart. No tests, browser automation, lint, TypeScript checks, builds, Supabase queries/SQL/migrations, operational data edits, deployment, commit or push were performed. Existing unrelated working-tree changes were preserved. Authenticated save, persistence-after-refresh and cross-user visual acceptance are not claimed.

## 1. Offload header height

Removed Offload's extra right padding and forced flex expansion from its header title track. Its wrapper now follows Combined Report's compact flex layout and existing shared header metrics: four pixels of vertical padding around the same minimum content track, not a fixed clipped row height. Sticky positioning, width registry, sort controls, column menus and resizing are retained. Long titles can still wrap, and explicit user-selected larger fonts may intentionally produce a taller header.

Header line height is now relative to the selected font size rather than fixed at 16px, so larger title fonts naturally expand the header. All spreadsheet headers use the same scoped typography rules.

## 2. Dropdown arrows

Scoped spreadsheet CSS hides the chevrons in ReportDropdownEditor and SearchableRelationshipEditor, and removes the native arrow/background image from marked Flexible Table cell selects. It also releases the input padding previously reserved for an arrow. Rendering and event handlers remain intact: search, options portals, relationship selection, managed options, status validation, keyboard navigation and Enter/blur/Escape behavior are reused.

The selectors apply only under `.spreadsheet-grid`. Navigation selects, modal/form controls outside the spreadsheet and the new header-font selector retain their normal dropdown affordances. Portal options remain anchored by the existing position code.

## 3. Shared-design save error

The inspected backend process on port 5000 started at **2026-10-19 15:46:36**, before the header validator was updated at **2026-10-20 01:28:08**. It was executing the source server without an active parent watcher. Phase 3F changed the on-disk validator but did not restart that process; therefore the running backend could not load the new header metadata handling. This is a confirmed runtime/source mismatch consistent with the rejected header saves.

The complete local path was inspected: header selection creates a patch under `header`; the shared design hook previews it; the existing writer submits `patch`, `initial_width_px` and `expected_revision`; the backend validates and merges the patch into existing JSON design metadata with a revision-conditioned write; the response middleware broadcasts the existing layout event. Table/column identifier validation, authorization and revision checks are unchanged.

The backend was restarted after implementation using the same workspace Node binary and the existing `tsx watch src/server.ts` development workflow. Startup logging and a new listener on port 5000 were observed. No authenticated design-save request or production write was issued, so other possible account/database-specific failures have not been reproduced or excluded.

Failed design drafts remain unsaved with a Retry design action. No success is announced before persistence is confirmed. Pending drafts from the old process can be retried using that existing action.

## 4. Header font size

Header-only selection now exposes text color, fill color and a compact font-size selector. Suggested sizes are 10, 11, 12, 13, 14, 16, 18 and 20px; an already configured supported size is retained in the list. The default remains the existing column/table size, normally 12px. Header title editing and header-only Bold/Italic/Underline remain unavailable.

`HeaderDesign` adds optional `fontSize` to the existing color properties. Backend header validation accepts only these three properties, validates colors as before, and allows null or integer font sizes within the existing 9-32px design bounds. It rejects other header text attributes. Existing frontend/backend nested merge behavior preserves independent header properties and all unrelated widths/order/pins/body formats.

The shared appearance helper reads header font size separately from body formatting. Flexible Tables reads/writes the same override inside existing versioned `settings.appearance.header`. Immediate optimistic previews and existing failure/retry/rollback handling are reused. Text drafts are not saved by header formatting.

## 5. Vertical separators

Shared spreadsheet CSS strengthens only right-border color to slate-300 (`#cbd5e1`). Border widths and horizontal rules are unchanged. Existing selected-cell outlines, column fills and pinned-column separators remain in place; no extra border layer was added.

## 6. Refresh icons

The report views did not contain a separate always-visible refresh button in the inspected source. The refresh-like icons were the conditional shared-design/shared-width retry controls. These now render compact **Retry design** / **Retry layout** text buttons, only for genuine errors, instead of circular-arrow icons. Existing data-load retry controls, automatic refresh, polling, cache invalidation and Realtime subscriptions remain. Unrelated page refresh controls were not changed.

## Persistence and synchronization

No new store or endpoint was introduced. Existing `shared_table_column_widths.design` JSON metadata supports the header object without a new column: the local migration definition constrains it to a bounded JSON object, not a fixed list of nested properties. Flexible Tables likewise has existing versioned settings JSON. Live schema was not queried in this phase.

Shared design updates continue through the authorized table-layout API, revision-aware writer, existing Socket.IO layout notifications and reconciliation subscriptions. Flexible header updates use the existing manager-authorized column API and deferred Realtime refresh. No localStorage fallback was introduced.

## Files changed in this phase

- `backend/src/services/table-design.logic.ts`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/flex-column-appearance.ts`
- `frontend/src/components/admin/useSpreadsheetHeaderFormatting.tsx`
- `frontend/src/components/admin/ReportSpreadsheetShared.tsx`
- `frontend/src/components/admin/ReportSpreadsheetUtils.ts` (comment clarification)
- `frontend/src/components/admin/OperationsReportsView.tsx`
- `frontend/src/components/admin/useSharedTableDesign.tsx`
- `frontend/src/components/admin/useSharedTableWidths.tsx`
- `frontend/src/index.css`
- `docs/phase-3g-header-styling-shared-design.md`

## Runtime and remaining acceptance

Backend restart completed under a hidden development watcher; startup and port binding were confirmed without an API or database test. Configuration files and feature flags were not edited. The inspected local configuration retains disabled tracking/planned routing/PDF and the existing locally enabled whole-trip deletion flag.

Required later acceptance: save header colors/font sizes with an authorized account, refresh and inspect a second session, verify resize/revision conflicts, narrow and pinned columns, Offload default height, dropdown activation without arrows, and genuine error retry behavior. No Supabase schema, grant, RLS, Storage or publication change is required by the implementation. If the existing shared-design migration is absent in a different environment, that environment remains a separate prerequisite; no migration was applied here.
