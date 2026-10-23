# Trip flow redesign — Phase 4

## Scope and confirmed causes

Read `frontend/src/services/cargo-planning.ts` before editing. That file, its decimal/BigInt arithmetic, types, and exports were not changed in this phase.

The old step 3 displayed all groups' trip details, then all dispatch controls, then all warehouses, shared store cards, and finally all planners. This made a group difficult to review end to end. The placements table used array-index React keys, and changing its truck select could create duplicate `(line_key, truck_id)` pairs. Quantity derivation errors appeared only in the global error box. Source references, capacity and proposal state were spread across long sections, with no usable Unassigned destination.

## Import step 3

Each trip group now has a header with its source line count/status chips, a sticky desktop progress checklist, and these sections in order:

1. Trip details, including the existing Apply to all groups action.
2. Dispatch & trip group: segmented New dispatch / Existing dispatch / Append to existing trip controls, an inline searchable result combobox, and the labelled Create missing records checkbox with its explanation.
3. Warehouses: explicit origin selector and one row per source code, with Matched / Conflict / Needs selection chips. No warehouse is guessed or automatically created.
4. Collapsible source-history/recovery attention panel, preserving `ImportSourceRecovery` and all explicit approvals/matches.
5. Group-scoped Stores & products, reusing the Phase 2 rail/table and Phase 3 location picker.
6. Trucks, drivers & cargo.

The checklist navigates to sections and reports current state; it does not introduce another save gate or require optional truck/location completion. Group names are trimmed only for matching the group display; original source strings and row identities are not rewritten.

Store navigation memory is now independent per group. The last active group's selection is carried to the read-only preview, while each scope retains its own view state; product scopes can contain different rows across groups versus the combined preview. Ctrl/Cmd+K chooses the focused workspace or enclosing trip group instead of every mounted rail competing for the shortcut. Store identity edits still update the same customer/Ship To/province/city across groups, matching the previous global store-card behavior. Product edits/removals remain source-row-specific; Add product line belongs to the group where it was clicked.

Dispatch searches retain the existing `fetchTrips` API and 100-result limit. They run on Find trips/Enter, rather than on every keystroke. Known results are shared across groups and merged by trip ID; already fetched trip-detail records also supply labels. No duplicate search request or automatic new search is triggered just by switching modes or editing cargo.

## Planner and board

`TripCargoPlanner` now uses the shared `TruckCard` grid and `CargoBoard`. Cards show plate, available truck-type metadata, capacity, an availability chip, driver/company controls, the existing Set as truck default driver action, and Remove truck. Fixed-truck mode uses the same cards with read-only driver/company labels, retains parent-owned schedule checks, and does not add a duplicate availability fetch.

Each truck uses `cargoCapacity()` for assigned, remaining, full and exceeded states. The trip-level bar compares exact source cargo with selected fleet capacity and includes Add another truck. It is amber at full and red when exceeded. Unknown capacity and Check values stay displayable without exceptions. `CapacityBar` uses `Number()` only to calculate visual percentages; state and totals come from the exact existing helpers. No floating point allocation computation or validation was introduced.

The board has Unassigned plus one column per physical truck, with quantity/CBM totals. DR cards expand to individual product allocations; missing DR uses the source line key rather than grouping unrelated lines together. Original PH truck references remain in a compact strip with source line count, exact expected/allocated CBM (`cargoTotal`) and the physical trucks involved. This visual grouping does not change `suggestCargo`'s PH-reference/DR grouping or any source identifier.

Both whole DR cards and expanded product allocations can move through native HTML5 drag/drop or labelled keyboard-accessible Move to menus. Drag data is scoped to its planner instance, preventing a drop from transferring cargo between trip groups. Successful moves announce their destination and focus its column. No drag/drop dependency was added; menus are also the touch/unsupported-browser path.

## Allocation constraints preserved

- Product cards use serialized `(line_key, truck_id)` identities, not array indexes. Moving a partial allocation onto a truck already holding that source line is blocked with **Merge duplicate product allocations**. It never silently creates a second pair.
- Invalid legacy duplicate pairs remain visible as attention cards. An explicit Merge action sums their quantity and CBM with `cargoTotal`; the original validator still checks source totals and proportions afterward. No source products or database records are merged.
- Unassigned is a derived view. Exact remaining quantity uses `cargoCapacity` with quantity strings as its units; exact remaining CBM uses that helper with the source CBM. No second decimal parser, rounding, or floating point subtraction was added. Negative/invalid remainders are flagged and cannot be moved as valid cargo.
- Moving to Unassigned removes only that draft allocation. The source product and its original quantity/CBM remain intact. Removed-source/truck allocations also remain visible for explicit correction/removal instead of disappearing from the UI.
- Quantity edits still derive CBM using `cargoCbmForQuantity`, retaining the existing incomplete-input handling. An exact-division failure is shown on the affected product card and in the planner error box; the rejected edit is not applied.
- Split still calls `splitCargoPlacement`. The target must be a different truck without a placement for that source line. The helper still rejects fewer than two whole units, fractional quantities and non-exact splits with its original error text.
- Move these allocations preserves the current exact amounts in that column. **Move entire DR group** retains the old action's semantics: remove all existing allocations for its source lines and place their full original quantity/CBM on the chosen truck, including any unassigned remainder. The UI explains this difference before the action.
- All successful plan edits use the planner's existing `update()`, resetting `confirmed:false`. Signature inputs remain lines and trucks, not placements. Only explicit confirmation actions use the existing direct confirmation callback.
- Proposal states are Not proposed / Proposed (needs review) / Stale / Confirmed. Recalculate and Keep current allocations and review remain available with their original eligibility rules. Confirm is now the primary action, with the same signature/problem/schedule/loading/conflict/disabled gates as the previous confirmation checkbox. The checkbox remains available to retain explicit confirmation/unconfirmation behavior.
- Problem, schedule and action errors stay visible. No-truck empty state explains that trucks/drivers can be assigned later; when trucks exist and Unassigned is nonempty, the board warns **Allocate all cargo before confirming**.

Truck removal still removes its draft placements, now visibly returning their cargo to Unassigned. The existing driver uniqueness checks, default-driver selection behavior, `setDefaultTripDriver`, schedule conflict filters, database schedule recheck, and unreserved-assignment acknowledgement remain intact.

## Scheduling and deliberate interaction changes

When both loading and estimated-delivery dates are available from trip details, the planner shows them read-only with the existing edit link where editing is allowed. Otherwise it keeps the date inputs and unreserved checkbox. For editable new-trip groups, entering dates in the planner also updates the existing `trip_details` fields so Phase 1 synchronization cannot later erase those dates. Once both are supplied, the display switches to the managed summary. Append-to-existing and locked targets do not have their trip metadata rewritten; their existing allocation schedule path remains available where applicable.

This uses the existing Phase 1 `trip_details` API contract. Its previously documented backend/database deployment prerequisites still apply; this phase adds no new migration and does not upgrade sealed legacy targets silently.

Manual distribution from Unassigned is now possible before using Suggest. Such a distribution still requires a current signature: after fully allocating valid cargo, use Keep current allocations and review, then Confirm. Rejected duplicate moves, non-exact quantity edits and failed splits do not alter the last accepted allocation.

## Preserved inconsistency — user decision needed

**The two parent save paths intentionally remain different:**

- `BulkTripImport.save()` validates and requires a confirmed current plan whenever `plan.trucks.length && lines.length` (unless that group's cargo is already saved). Selecting trucks and leaving cargo Unassigned blocks CSV saving.
- `AddTripForm.validateTrip()` invokes cargo validation only when `cargoPlan.placements.length > 0`. With zero placements, New trip can still save a planned trip with trucks and unassigned cargo. Once any placement exists, all source cargo must satisfy the exact validator.

The board warns about incomplete allocations in either flow, and Confirm always requires complete valid allocation, but this phase **does not change either parent's save condition**. Decide in a later phase whether manual New trip should adopt the CSV rule or CSV should permit deferred allocation. No decision was inferred or applied.

## Files, props and API changes

- `frontend/src/components/admin/BulkTripImport.tsx`: per-group layout/checklists, scoped source panels, existing-result reuse, navigation memory and schedule handoff.
- `frontend/src/components/admin/TripCargoPlanner.tsx`: shared truck/fleet/proposal UI and board integration; core logic retained.
- New `frontend/src/components/admin/CargoAllocationBoard.tsx`: stable allocation cards, exact helper-based remainders, guarded movement, inline errors and native drag/drop/menu interactions.
- New `frontend/src/components/admin/ImportDispatchTarget.tsx`: typed segmented target selector and inline combobox; importer still owns the fetch and target mutations.
- `frontend/src/components/admin/AddTripForm.tsx`: passes already loaded truck types and its existing Add another truck callback into fixed mode; updates the empty-state text.
- Shared `CapacityBar.tsx`, `TruckCard.tsx`, `CargoBoard.tsx`, `ReviewChecklist.tsx`, `StoreMasterDetail.tsx`, `storeWorkspace.ts`: exact capacity presentation, typed slots/drop handlers, checklist navigation and multiple-workspace support.
- This changelog.

All existing `TripCargoPlanner` props remain supported, including Phase 1 schedule props. Two optional presentation props were added: `truckTypes?: Record<string,string>` and `onAddTruck?: () => void`. Shared component additions are optional and backward compatible. Truck types also reuse the existing availability response/cache; unavailable historical metadata is labelled honestly rather than triggering another fetch or inventing a type.

No backend handlers, API payload shapes, database queries, SQL, migrations, dependencies, source-import signatures, recovery drafts or realtime/cache-invalidation behavior were changed. Existing availability reads keep their date/token/disabled dependencies; moving/editing allocations does not add a refetch dependency. Existing retry-safe commit/chunk/history/missing-source handling remains in place.

## Verification and Not verified

Only the permitted frontend static check was run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`. It reports only the pre-existing `UserActivityHistory.tsx(17,613)` TS2322 error. No Phase 4 type errors remain.

Not verified: native drag/drop across browsers, touch/menu interaction, keyboard focus announcements, responsive/sticky layout, map/store workspace scroll interaction, live schedule/default-driver requests, import/recovery saves, and runtime allocation scenarios. No tests or test files, browser automation/manual browser checks, screenshots, builds, lint, servers, SQL or migrations were run. Backend typechecking was not repeated because this phase changed no backend files. Later phases and the save-rule policy decision were not implemented.
