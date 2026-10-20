# Shared spreadsheet formatting and trip-entry refinements

## Implementation scope

Local source changes only. No database queries, SQL, migrations, production record writes, server restarts, deployment, commit, or push were performed. Runtime verification and compilation are deferred as requested.

## Shared formatting

The inspected code maintained a separate per-browser cell-format cache while shared writes used a revisioned queue. A local preview could survive a failed write during the current session and then disappear when a fresh shared snapshot loaded. Width and design writers use the same database revision, but both previously stopped on concurrent revision conflicts. Initial design hydration also discarded responses when local edits advanced the client epoch.

The workspace now renders cell formatting from shared snapshots plus the existing pending-patch queue. It no longer writes the separate browser-local formatting cache. Both writers retry revision conflicts at most three times against fresh server revisions. Hydration accepts monotonic server revisions while retaining local pending patches. Cell patches merge individual style properties on the backend and frontend; they no longer replace unrelated formatting properties. Null tombstones retain their deletion semantics.

Row/range formatting is grouped by column through the existing authorized design API. Actual records retain physical report identities; presentation-only blanks use sheet-scoped slot identities and cannot create operational records. Unidentifiable display-only records and neutral loading columns are not persisted as cell overrides. Column defaults, widths, visibility, pins, aliases, and order continue using existing design storage. Existing change signals, collaboration notifications, focus recovery, and authenticated cache cleanup remain in use; shared design also handles direct change/recovery signals. Failed writes remain pending with a concise toast and Retry design action; they are not announced as saved.

Storage remains `shared_table_column_widths.design`, with existing authorization, JSON size and per-column cell-count limits. No migration was added. This code review does not establish the state of the running backend or live schema, or verify cross-session persistence in a browser.

## Tabs, formula controls, and loading

Bottom tabs are smaller, separated, gray when inactive, and white when active, with their top edge joined to the grid. Formula-area calculated-page export was removed; ordinary report export and automatic recalculation remain. The formula input fills remaining toolbar width.

Two unresolved merge-conflict blocks were discovered in the Trips routing and report footer. Their source contents were resolved in favor of the unified retained workspace and existing toolbar pagination. The legacy direct Trips renderer and obsolete footer are removed from those paths. The Git index was not staged or reset and may still mark these paths unmerged.

Loading uses the spreadsheet container with current source-schema headers, neutral headers before the schema arrives, and skeletons inside blank data cells. Synthetic Issue / Report Type and Trip Details columns are added only when real data rows are present. The separate visual-card loading fallback was removed. Existing authentication loading remains outside the workspace and was not redesigned.

## Searchable relational cells

The existing shared relationship editor remains a searchable floating selector. Warehouse, store, customer, and product selectors offer explicit Add actions when no exact identifying value matches. Creation opens a compact form through the existing authenticated master-data API; no typed text is submitted as a foreign key. Stores require a customer; products request name, SKU and model; warehouses request code and name. A missing customer can be created explicitly from the store form. Created or exact existing records are selected by physical ID, with lookup caches invalidated.

Customer creation is added to the same ADMIN/STAFF master-data resource mechanism using existing customer fields. Creation performs normalized exact-match checks, scoped to customer for stores. Creation requests are serialized by resource within one backend worker; existing database uniqueness constraints remain authoritative. This is not a cross-worker normalized-name uniqueness guarantee. Driver/truck and other unsupported creation flows retain their existing selectors and permissions.

## CSV destination repair

The importer previously matched store names but not store codes, recognized only a small set of Ship To aliases, and converted an unresolved destination into notes with a null store ID. It could advance straight to review and save that null relationship.

The parser now recognizes destination, store-code and Ship To aliases. Import lookups normalize Unicode/case/whitespace, compare store codes and names, and scope matches to a resolved customer. A supplied but unresolved customer prevents automatic assignment of a potentially unrelated store. Unresolved destination text remains visible in the stop field, and final submission is blocked until an existing destination is explicitly selected or a valid destination is created. Imported location details prefill the creation form. The chosen physical store/customer IDs are carried into the existing trip bundle payload.

## Truck capacity and schedule planning

New read-only endpoint: `GET /api/trips/truck-availability?start=YYYY-MM-DD&end=YYYY-MM-DD`, authorized for ADMIN/STAFF. It reads active trucks and trip assignments in bounded pages, using loading/delivery dates, terminal trip statuses, and explicit assignment release times. Overlapping active schedules yield CONFLICT. Missing or inconsistent schedule information yields REVIEW, never an assumed free truck. Complete non-overlapping schedules yield AVAILABLE. Lookups fail closed when the bounded scan cannot be completed.

Add Truck opens the searchable picker, excludes trucks already selected for this draft, ranks available full-capacity matches before partial-capacity matches, and displays type, maximum/free capacity and availability. Conflicting trucks are disabled. REVIEW choices require explicit user confirmation. Cargo, selected capacity and additional capacity needed update on add/remove. These numbers are capacity planning, not automatic cargo allocation.

Availability is reread immediately before submission and checked again by the backend assignment-create path. Duplicate active assignment checks also run there. Existing multiple-truck payloads and explicit driver selection are preserved. No assignment/cargo/stop schema was changed.

## Remaining boundaries

- Backend source changes require the running local backend to load the new code; no process restart was performed in this pass.
- Runtime rendering, refresh persistence, cross-user updates, and the new relationship/schedule requests remain unverified.
- True race-free schedule exclusion across workers requires a reviewed database coordination/constraint design. Current checks do not claim transactional reservation.
- Normalized name-only duplicates across multiple workers cannot be fully excluded by application checks alone; existing unique database identifiers still apply. No new unique index was assumed or installed.
- Capacity planning does not introduce or persist a new per-truck cargo-allocation model or change independent stop responsibilities.
- No Supabase change is required for the implemented paths assuming the existing shared-design column and master/assignment schema are installed as previously documented. Any stronger cross-worker constraints require separate review and approval.

## Files changed in this pass

- `backend/src/routes/trip.routes.ts`
- `backend/src/services/assignment.service.ts`
- `backend/src/services/master-data.service.ts`
- `backend/src/services/table-design.logic.ts`
- `backend/src/services/truck-availability.service.ts` (new)
- `frontend/src/components/admin/AddTripForm.tsx`
- `frontend/src/components/admin/ReportDataView.tsx`
- `frontend/src/components/admin/ReportsWorkspace.tsx`
- `frontend/src/components/admin/SearchableRelationshipEditor.tsx`
- `frontend/src/components/admin/RelationshipCreateDialog.tsx` (new)
- `frontend/src/components/admin/tripCsv.ts`
- `frontend/src/components/admin/useOperationalFormulas.tsx`
- `frontend/src/components/admin/useSharedTableDesign.tsx`
- `frontend/src/pages/Admin/views/ResourceView.tsx`
- `frontend/src/services/lookup.service.ts`
- `frontend/src/services/master-data.service.ts`
- `frontend/src/services/shared-table-design.ts`
- `frontend/src/services/shared-table-widths.ts`
- This document.
