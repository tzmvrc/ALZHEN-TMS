# Stores and products: full-width editor

Before: a 280px store rail permanently reduced the editor width, while search, navigation hints and repeated headings added vertical clutter.

After: a sticky 48-56px stop-chip strip and an on-demand All stops panel replace that rail. The selected editor fills the body width, up to 960px. Store and address sit in a 40/60 grid from 1100px; products span both columns. Below that breakpoint the fields stack. The trip summary and footer are unchanged.

## Composition

```text
AddTripForm Step 2 / BulkTripImport Step 3 (Stops)
  StoreMasterDetail (shared workspace, existing navigation memory)
    StopsBar
      StopChip x n / Add stop
      All stops / Table preview / Import CSV or XLSX
    StoreEditor
      Stop badge + name + totals / Edit store details / existing remove action
      DeliveryStoreField | DeliveryAddressCard
      Existing expanded store fields
      ProductsSection
    AllStopsPanel (body overlay; bottom sheet below 900px)
      Search / attention filter / 12 cards per page / Add stop / J-K hint
```

Implementation files are in `frontend/src/components/admin/shared/` except `DeliveryAddressCard.tsx`, which is in the admin directory. `StoreProductsTable`, `AddressCard` and `StoreAddressReview` remain compatibility exports. Existing hooks, navigation-memory fields, business data, validation, API calls and save builders are retained. Added open/closed and preview state is presentation only. The helper functions appended to `storeWorkspace.ts` update the same existing UI-memory objects.

The CSV Stops tab shows the existing trip-group dropdown instead of the group side rail to preserve the full editor width. Its Add stop chip invokes the existing source-line add callback with a blank destination; removing that new row invokes the existing remove callback. Source identities and existing rows are retained, and normal validation still applies before saving.

## Acceptance checklist

- [x] The selected store editor equals the modal body's available content width in both flows; the old store rail is absent from the DOM.
- [x] The stop bar remains fully inside the body scrollport when scrolling. Long chip names truncate, retain full-name tooltips and have accessible status text. Fade edges and arrow buttons expose overflow.
- [x] New stops select their chip and scroll into view. Removal selects the previous stop. Keyboard navigation preserves chip focus.
- [x] All stops is an accessible dialog with focus wrapping, search, attention filtering, pagination, Escape and outside-click dismissal. Below 900px it becomes a bottom sheet without moving the editor.
- [x] Ctrl/Cmd+K opens the panel and focuses Find store; J/K remains available; chip tabs support arrows, Home and End with roving tabindex.
- [x] Store details open from the editor header. The selected delivery store is read-only until Change; an empty store exposes the existing search field and a short helper.
- [x] Address review has one title, no repeated store subtitle, inline store-update toggle with explanation tooltip, compact secondary links and small attribution. Confirmation callbacks and coordinate/state rules are unchanged.
- [x] Products have one title/count, search, page-size control and add button. Controls align on one desktop row and use an explicit two-row grid on small screens. Existing row details, delete actions, pagination and draft starter rows are retained. A genuinely empty row collection shows No products yet.
- [x] Table preview reuses the same workspace and selection memory in both flows.
- [x] One vertical modal-body scroll container. The overlay has its own list scroll; wide product tables and stop chips scroll horizontally.
- [x] No label collisions, modal overflow, clipped sticky chips or spilled form controls at 1366x768 and the 125% zoom viewport equivalent.
- [x] The existing bottom trip summary and save payloads are unchanged by this refinement. No backend files were changed for this layout task.

## Verification

- `frontend/tests/trip-modal-layout.browser.js`: 120 populated layout checks (15 views, 8 sizes), including 1366x768, 1440x900, 1920x1080, tablet, phone and three desktop viewport footprints at 125% zoom. These are reduced CSS viewport sizes, not native browser-chrome zoom.
- Browser assertions measure full editor width, absence of the old rail, 40/60 versus stacked layout, aligned search/page-size controls, sticky-bar containment, one vertical body, footer visibility and no clipped cards or table controls.
- Interactions cover a real 53-stop manual draft, adding/removing stops in both flows, active-chip scrolling, roving keyboard navigation, panel search/filter/pagination/focus trap, outside dismissal, mobile sheet, J/K and Ctrl/Cmd+K, both table previews and the existing address/review guards.
- `frontend/tests/trip-modal-design.browser.js`: 14 shell sizes plus focus restoration, Escape, dropdown keyboard handling, date errors, file validation/drop, setup blocking, draft retention and reduced motion.
- All browser APIs are mocked; no production records are written.
- New and refactored layout components pass targeted ESLint. The unchanged ref-based hook in `storeWorkspace.ts:17` retains its existing `react-hooks/refs` lint finding.
- Production bundling passes (`npx vite build`, 2854 modules). Full TypeScript checking still reports the existing errors in `ReportDataView.tsx:1297` and `UserActivityHistory.tsx:17`; changed layout files have no TypeScript errors.

Screenshots: `.playwright-mcp/stores-full-width.png`, `csv-stores-full-width.png`, `all-stops-panel.png`, and `all-stops-sheet.png`.
