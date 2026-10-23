# Phase 5 — Review & save and New trip polish

## Files changed in this phase

- `frontend/src/components/admin/BulkTripImport.tsx`: review statistics, save-readiness checklist, grouped read-only details/trucks/capacity/source-line review, consolidated confirmations, results integration, and shared save blockers.
- `frontend/src/components/admin/ImportResultsPanel.tsx` (new): typed results panel with batch-ID copy, retry, and the existing failed-row download callback.
- `frontend/src/components/admin/AddTripForm.tsx`: persistent desktop summary column, mobile expandable footer summary, wider dialog, responsive step-one field grid and wrapping dispatch tabs. The dispatch hero and all its controls remain.
- `frontend/src/components/admin/shared/TripLiveSummary.tsx` (new): typed, read-only summary using existing exact decimal totals and shared capacity/stat/status components. `displayCargoTotal` reports incomplete values safely without rounding them.
- `frontend/src/components/admin/SearchableRelationshipEditor.tsx`: blue/slate styling and above/below popover positioning.
- This changelog. Other working-tree changes belong to earlier work and were preserved.

## Confirmed causes and fixes

The CSV Save button omitted cargo confirmation/signature/validation and current missing-history restoration approvals even though `save()` rejected those conditions. A common derived blocker list now drives the readiness checklist, disabled state, tooltip, results Retry button, and an initial save-handler guard. Existing handler checks and the commit/chunk/recovery pipeline remain intact. Unresolved dates, destinations and source warehouse codes are listed by group; missing approvals identify filenames and original CSV rows. Transient busy/saving states also disable both save entry points.

The review page previously spread metadata, assignments and acknowledgements across separate sections and presented results only as text. It now includes eight statistics, per-group details and destination summaries, driver/company descriptions, exact helper-based truck capacity bars, store/source-line counts, expandable source lines, and the existing store/product navigator and original-file preview. One Before you save panel contains the existing group, unmapped, potential-duplicate and CBM acknowledgements with reasons. All existing predicates and recovery-draft acknowledgement fields are retained.

The relationship popover previously clamped its top to `innerHeight - 220`, allowing it to cover its own input. It now measures available space and content height, opens above when appropriate, and limits height to the available side. A layout effect positions it before paint; resize/scroll listeners and a ResizeObserver update placement as results change. The observer is cleaned up and reattached around the existing create dialog. Search caching, debounce, option selection, keyboard handling, blur/commit callbacks, permissions, disabled/unavailable states and create flow were not changed.

## Behavior, types and API

New components have local typed presentation props and no service calls. No existing public component props, API payloads, backend handlers, draft shapes, source identities, queries, Realtime subscriptions, cache invalidation or dependencies were changed. The shared decimal helpers and `cargo-planning.ts` were not edited.

The intentional behavior adjustment is earlier feedback: the CSV Save/Retry controls now stay disabled for the existing cargo/history handler rejection conditions, and the handler also explicitly consults the existing UI acknowledgement/destination gates. This prevents a button that appeared ready from immediately failing. The actual allocation, capacity and restoration rules remain unchanged. Readiness is recomputed after edits, history refreshes and partial saves; saved cargo is still exempt from reconfirmation. Retry uses the same batch and existing save pipeline.

Results display trips created, products imported, duplicates skipped, failed rows, invalid excluded rows, cargo plans saved and the batch ID. A started batch is visible even when failure occurred before the first row acknowledgement. Counts retain existing outcome semantics, including products recovered from this same batch. Copy uses the browser clipboard; if unavailable, it displays an explanation and keeps the ID selectable. Failed-row download reuses the existing export function.

New trip shows dispatch, trip number, type, status, loading/ETA, stops, exact quantity/CBM totals, trucks and aggregate capacity. The desktop sidebar scrolls independently from the main form; mobile uses an expandable bottom summary. It makes no requests and owns no form data. Existing step navigation, local state, import handoff, editable controls, location picker, save callbacks and fixed-truck cargo behavior remain in their original owner.

## Assumptions and preserved policies

- Review statistics are planning counts: trips means source trip groups; trucks means selections across groups. Product lines and CBM use valid rows owned by this import, preserving source-history and duplicate exclusions. Stops retain the existing pre-save estimate; these are not promises of newly inserted database records.
- Unverified locations remain informational and may be saved without coordinates. Active lookups block saving as before; no new location-verification requirement was added.
- Trucks/drivers may still be assigned later. CSV requires valid, confirmed, current allocations when trucks and owned lines exist unless the cargo is already saved. Manual New trip still validates cargo only when placements exist. The Phase 4 policy inconsistency remains for your decision.
- The selected warehouse and trip-type labels reuse existing loaded lookup data. No extra metadata requests were introduced.

## Backend/database work

None required by Phase 5. No SQL or migrations were executed or prepared. The earlier Phase 1 trip-details RPC proposal and earlier recovery prerequisites remain subject to your approval and deployment; this phase does not imply they have been applied.

## Verification and Not verified

Only the permitted frontend static TypeScript check was run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`. It reports the pre-existing `UserActivityHistory.tsx(17,613)` TS2322 (`unknown` is not assignable to `ReactNode`); no Phase 5 type errors were reported. The unrelated error was left unchanged. No backend check was needed because no backend files changed in this phase.

Not verified: desktop/mobile layout, sticky/scroll behavior, popover placement with live results or an on-screen keyboard, screen-reader/focus behavior, clipboard permissions, native tooltip display, real save/retry/draft recovery, live lookup/schedule services, counts against operational records and failed-row downloads. These require your manual review.

No tests or test files, browser checks/automation, Playwright, screenshots, builds, lint, servers, SQL or migrations were run. Unrelated merge/index state was not changed. No later-phase work or allocation/save-policy changes were implemented.
