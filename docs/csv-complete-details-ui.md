# CSV Complete details UI

Implemented on 2026-10-24. Changes are limited to presentation, navigation and the requested UI review guard. Import services, request contracts, source identities, allocation algorithms and draft serialization were not changed. No live imports were used for verification.

| File | Change |
| --- | --- |
| `frontend/src/components/admin/BulkTripImport.tsx` | Guided Details → Stops → Trucks & cargo actions and Back navigation; shared guard for the main stepper and Review action; clickable missing-item checklist that selects the group, stop or Unassigned bucket and focuses its controls. UI visit state is separate from saved drafts. |
| `frontend/src/components/admin/GroupRail.tsx` | A/B/C segmented tabs with status icons, text and counts. Single-trip identity replaces the left panel. Multiple trips use the same header dropdown on every tab. Keyboard navigation and group shortcuts remain available. |
| `frontend/src/components/admin/csv-completion.ts` | Read-only UI projection of existing detail errors, destination verification and cargo validation/signature/confirmation. Counts incomplete DR groups without modifying allocations. |
| `frontend/src/components/admin/TrucksCargoTab.tsx` | Removes repeated trip totals and truck chips; keeps Add truck, schedule, auto-assign, Undo and settings callbacks in the new layout. |
| `frontend/src/components/admin/CargoAllocationBoard.tsx` | Selected truck/Unassigned view, compact DR rows and retained line editors, move menus and drag targets. Moving cargo selects the destination bucket. |
| `frontend/src/components/admin/shared/CargoBoard.tsx` | Vertical truck summary list beside the selected truck's cargo, with counts, driver/type, capacity and settings. |
| `frontend/src/components/admin/shared/CapacityBar.tsx` | Compact capacity presentation, retaining the existing capacity calculation and warning states. |
| `frontend/src/components/admin/shared/trip-modal.css` | Responsive segmented control and cargo workspace, full-width CSV stops, fitting product tables and wider CSV shell. Header/footer remain outside the body scrollport. |
| `frontend/tests/csv-completion.test.ts` | Six tests cover statuses, multi-group/forward guards, exact-decimal partial allocations, existing cargo rules, dirty edits and optional-date confirmation. |
| `frontend/tests/csv-complete-details.browser.js` | New isolated Playwright flow covers 18 layouts, six trucks, exact stop focus, main/sub-step guards, keyboard and Back navigation, DR moves/expansion, drag/drop, over-capacity warnings, auto-assign and Undo. |
| `frontend/tests/trip-modal-layout.browser.js` | Updates regression checks for the header selector, selected cargo view and guided completion; checks 120 populated layouts. |
| `frontend/tests/trip-review-warnings.browser.js` | Completes the new UI prerequisites in its fixture before reviewing; retains annotation recovery, source-row preservation, optional fields, API setup fallback and recovery approval checks. |

## Validation

- 33 focused frontend unit tests pass, including six new readiness tests and the existing allocation, address review, batch locking, source isolation, optional-address fallback and annotation tests.
- New Playwright flow passes at viewport widths 1000, 1280 and 1600, with no horizontal scroll containers or body overflow in the tested Step 3 views. Six truck names and assigned/capacity totals are in a vertical summary list.
- Existing modal design/accessibility browser checks pass, including mobile and landscape, focus trapping/restoration and reduced motion.
- Updated populated-layout regression passes 120 layouts, including 53 stops and mobile/zoom footprints. Updated 56-row review/recovery browser flow passes. All browser API traffic is mocked.
- Vite production build passes. TypeScript still reports errors in untouched `ReportDataView.tsx:1297` (unused variable) and `UserActivityHistory.tsx:17` (`unknown` as React content).
- The broader frontend unit run is not clean: unrelated change-feed, flex appearance and transaction-deletion assertions fail; JSX rendering tests report `React is not defined` with the backend-directory runner; a report-page-cache test times out. Results are in `.playwright-mcp/frontend-unit-results.txt`. These areas were left outside this UI task.

## Interpretation

Trip type and dates remain optional. When dates are absent, the existing **Plan without reserving dates** confirmation is used for cargo readiness. Address finding and confirmation are also optional: unverified addresses remain visible as warnings but do not block Next or Review. Required detail checks, pending source edits and incomplete cargo plans still use the navigation guard. The backend retains its existing optional-data and partial-save behavior. Groups without owned source cargo do not require an additional truck.

The vertical cargo board is shared with manual Add trip, so that flow receives the same presentation; its assignment callbacks and validation are unchanged.

## Optional stop addresses

The user clarified that Find address and Confirm address must be optional. Address issues are now marked optional and excluded from the navigation blockers. Stops shows **Address optional** after visiting and explains that an address can be added later. Its Verified badge still requires a genuinely confirmed, complete trip address. Unit and Playwright recovery regressions verify that Next and main-step Review work with missing or unconfirmed addresses, while optional confirmation still works. The 11 focused readiness/address tests and the isolated browser flow pass.
