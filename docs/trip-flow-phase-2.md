# Trip flow redesign — Phase 2

## Changes and root causes

The editable CSV view rendered ten whole store cards at a time, each with fifty products. The preview separately paged twenty stores and put the selected product table below that list. New trip rendered all stops and product forms vertically. Their independent, component-local navigation state also disappeared when switching views. Destination-based keys changed when editing store identity fields, while index-based manual preview IDs changed after deletions.

All three views now use the same master-detail workspace. Desktop has a sticky store rail and independently scrollable detail panel; mobile has a horizontal store switcher. The rail includes destination, geography, product count, quantity, CBM, and a status dot with an icon/text chip. It uses fixed-size, overscanned virtualization above 100 stores on both axes without another dependency.

Navigation includes Ctrl/Cmd+K search across destination/customer/geography/DR/product fields, Prev/Next buttons, J/K shortcuts, an attention filter, and whole-workspace summary totals. J/K operates when focus is inside the workspace and outside editable controls. Shortcuts respect handled events, composition, and foreground modal dialogs.

The shared product table includes a sticky header, product/source-field search, 10/25/50/100 rows per page, inline More expansion, and the existing add/remove actions. It only mounts the selected store's current product page. Adding a product reveals its actual page by comparing stable row keys, including stores spanning multiple source files.

## Files changed in this phase

- `frontend/src/components/admin/shared/StoreMasterDetail.tsx` — shared navigation, summary, filter, keyboard handling and detail slot.
- `frontend/src/components/admin/shared/StoreProductsTable.tsx` — generic typed compact product table and expandable detail slot.
- `frontend/src/components/admin/shared/storeWorkspace.ts` — typed navigation items and flow-owned UI memory.
- `frontend/src/components/admin/shared/StoreRail.tsx` — responsive store cards and dependency-free virtualization; retains its existing basic props.
- `frontend/src/components/admin/shared/index.ts` — exports the new shared components.
- `frontend/src/components/admin/ImportStoreCards.tsx` — replaces store pagination and product cards with the shared layout; retains location content, edit callbacks, input default values, value-based remount keys, and blur commits.
- `frontend/src/components/admin/ImportStoreProductsPreview.tsx` — selected products appear beside the rail; all source and trip-preview fields remain available in inline expansion.
- `frontend/src/components/admin/AddTripForm.tsx` — step 2 uses the shared workspace/table, with stable stop/item navigation IDs shared between edit and preview.
- `frontend/src/components/admin/BulkTripImport.tsx` — owns shared navigation memory across import steps and associates preview rows/errors with client row identities.
- This changelog.

## Types, persistence and API

`StoreNavigationItem`, `StoreWorkspaceMemory`, `ProductViewState`, and generic `StoreProductColumn<T>` describe UI state and slots. `ImportStoreCards` accepts optional `navigation`; its row type accepts optional read-only errors. `ImportStoreProductsPreview` accepts optional `navigation` and `locations`, and optional row metadata for stable navigation IDs, verification and errors. Existing callers remain compatible.

UI memory is owned by the mounted manual form/importer. It retains selection, rail/detail/product scroll positions, searches, page sizes, pages and CSV/preview expansions through edits, preview refreshes and view/step remounts. Manual expansion continues using the existing `item.open`. Remaining member identities preserve selection when a store's first product is removed. Memory is not written into signed rows, business records, recovery drafts, localStorage or a global cache; closing/reopening the entire flow does not restore navigation preferences.

Backend `prepareImport` currently preserves every file and row in input order, including invalid rows. The importer uses that inspected ordering plus filename/line/group alignment checks for UI identity association. Signed `source_identity`, fingerprints, document hashes, API payloads and commit contracts are unchanged. If a future endpoint reorders rows, the client association will need an explicit endpoint-level source locator; mismatched rows currently fall back to their signed source identity.

## Deliberate presentation/interaction changes and assumptions

- Store pagination is replaced with searchable selection. Only the selected store's controls are mounted. Existing location picker code and request/verification logic are unchanged in its detail slot.
- The read-only import preview now includes invalid rows, so users can find them through the attention filter. Save eligibility still uses the existing valid-row filter; no validation has been disabled or changed.
- Attention indicators are advisory: source validation errors, missing product code, missing/non-positive quantity or invalid/missing CBM require review. Missing city/province or an unverified location uses Needs location. Existing verification flags are reused; no new location requests are introduced by navigation/status computation. Grouping/import validation remains authoritative.
- Numeric summaries are display-only, use four decimal places, and recognize comma-formatted source decimals. Original strings, identifier zeros and exact cargo arithmetic are unchanged.
- New manual product/remove/add controls now respect `saving`; previously some remained enabled during save. Navigating or expanding read-only details remains possible.
- Add product line clears that store's product search and reveals the new row's page. Add delivery store clears store search and selects the new stop.
- Manual preview retains individual stop identities, including repeated selections of the same destination. CSV grouping continues using the existing customer/destination/geography helper.

No Supabase query, Realtime subscription, cache invalidation, draft persistence, missing-source/history/duplicate handling, cargo signature/confirmation or retry-safe commit code was changed. There is no backend/API/schema work required for Phase 2. Earlier proposed SQL remains unexecuted.

## Verification and Not verified

Only the permitted frontend static TypeScript check was run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`. It reports the existing unrelated `UserActivityHistory.tsx(17,613)` TS2322 error; no Phase 2 type errors remain.

Not verified: browser layout, mobile interaction, keyboard/focus behavior, scroll restoration, large-list runtime performance, editing/import/save/recovery flows, and live API/database behavior. No tests, test-file changes, browser checks, Playwright, screenshots, servers, builds, lint, dependencies, SQL or migrations were run or added. Later redesign phases were not implemented.
