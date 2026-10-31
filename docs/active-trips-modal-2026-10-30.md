# Home Active Trips modal — October 30, 2026

## Implementation

Clicking the existing Active trips metric opens a lazy-loaded modal; its former monitoring/Master List navigation handler is removed. The metric design and other summary actions remain unchanged. Trip cards close the modal and pass the actual parent trip ID to the existing Home `onOpenTrip` callback, with `/trips/:id` as the fallback route.

The modal uses a fixed, responsive 90vw/max-1260px, 88dvh workspace on desktop and nearly full-screen layout on mobile. Its title, total, search and close action remain outside the independently scrolling list. Search covers trip/dispatch references, plates, primary Drivers, Helpers and destinations. Backend pagination uses 25 trips per page by default, independently of the bounded Home analytics snapshot.

Trip cards show persisted warehouse, ordered stops, loading date, status, assigned trucks and active crew. Each truck has its own milestone progress track, warehouse/destination labels and truck icon. The icon changes position only when the saved completion percentage changes, with a CSS transition and reduced-motion support. Convoy summary bars have no shared truck icon; individual assignment indicators remain independent.

Progress reuses `readConfirmedOperationalState` and its installed confirmed milestone projection. A stop is physically complete when its persisted departure/completion milestone exists. POD approval never contributes to completion. A trip-level stop is counted complete only when every responsible active assignment has physically completed it. Missing projections or unassigned stop coverage produce a neutral percentage; a temporary progress-service failure preserves trip/assignment details with an unavailable-progress notice. No business statuses, quantities or milestones are written.

## Root causes addressed

- The metric used `navigate("monitoring")`; it had no modal behavior.
- Home's loaded analytics snapshot was bounded, so it could not serve as a complete active-trip list.
- The shared workspace shell depended on Trip Details CSS for fixed positioning and flex layout. It is now self-contained, so the Home modal actually overlays the viewport and its body scrolls correctly.
- A structural refresh could reuse stale trip-list caches or overwrite a newer modal count with an older dashboard snapshot. Structural refreshes now invalidate trip-list caches; newer reported totals are protected from older in-flight dashboard reads.

## Data scope and realtime

The list uses the same canonical non-archived `v_active_trip_listing` visibility and `IN_PROGRESS` filter as the existing headline count. Search changes only the matching page total; `active_total` remains the unfiltered canonical total and synchronizes the headline metric.

Assignments, stops, responsibilities and crew are fetched in batches for the selected page. Crew loading starts as soon as assignments load, in parallel with the confirmed-state read. There are no per-trip queries, GPS reads or image downloads. The endpoint has a bounded read deadline, with a shorter optional progress deadline.

The modal adds no realtime subscription or polling. Home's existing subscription advances a refresh revision for relevant trip, stop, milestone, assignment, crew and reference-data events. The existing collaboration-to-admin bridge now includes crew commits. Modal refreshes coalesce while requests are in flight and retain search, page, rows and scroll position. Changed search/page requests cannot publish stale results.

## Database migration

- Project: `hdmknewarynwpbrhfgai`.
- File: `backend/migrations/2026_11_26_home_active_trip_search.sql`.
- Applied through Supabase MCP as `home_active_trip_search`, version `20261030102904`.
- Adds only `v_home_trip_listing`, a read-only search projection over the existing canonical listing, with persisted warehouse, assignment, Driver, active crew and stop labels.
- Required for fleet-wide related-field search with backend pagination, without an unbounded client-side/company-wide ID scan or a second trip-status calculation.
- SELECT is granted to `service_role` only; `anon` and `authenticated` access is revoked and was verified.
- No existing migrations were rerun and no operational records were modified.

## Changed files

- `backend/migrations/2026_11_26_home_active_trip_search.sql` (new)
- `backend/src/services/home-active-trips.service.ts` (new)
- `backend/src/routes/trip.routes.ts`
- `backend/tests/home-active-trips.test.ts` (new)
- `frontend/src/pages/Admin/views/OverviewView.tsx`
- `frontend/src/components/admin/home/HomeCommandCenter.tsx`
- `frontend/src/components/admin/home/ActiveTripsModal.tsx` (new)
- `frontend/src/components/admin/home/active-trips-modal.css` (new)
- `frontend/src/components/admin/TripWorkspaceDialog.tsx`
- `frontend/src/components/admin/trip-management-workspace.css`
- `frontend/src/services/home-active-trips.service.ts` (new)
- `frontend/src/services/realtime.service.ts`
- `frontend/tests/home-active-trips.browser.cjs` (new)

## Verification

- Frontend and backend production builds passed. Existing frontend bundle-size/dynamic-import warnings remain.
- Three focused backend tests passed: exact assignment/stop milestone progress, neutral missing-data handling, canonical archive/inactive filtering, related-field search, duplicate-parent prevention, service-only view permissions, pagination before batched enrichment and total preservation during search. The migration was exercised in isolated PGlite data, using the checked-in canonical active-list definition.
- Playwright and Playwright MCP exercised the actual Home metric, overview refresh path and modal using isolated API/Auth transport: 61 active trips across three pages while Home loaded only three analytics records; trip/plate/Driver/destination search; independent convoy progress; saved progress moving a truck; count additions/removals; preserved search/scroll; a single subscription; correct parent trip-ID navigation callback; single-truck layout; viewport containment and independent scrolling at desktop/mobile widths.
- The existing Trip Details management browser suite passed after the shared-shell fix, covering spreadsheet editing/formatting and photo/history/download workflows.
- Live read-only Supabase checks confirmed the new migration, permissions, canonical count equality and the installed physical milestone projection. A direct read of the actual backend service successfully returned the live active total and two assigned trucks, with valid progress bounds. No live delivery milestones or operational data were changed.
- `git diff --check` passed. Unrelated worktree changes were preserved. No commits, pushes or deployment.

## Verification limits

Browser interaction and realtime changes used isolated fixtures; no production trip was completed, archived or reassigned for testing. Trip navigation was verified through the existing parent callback and internal ID, rather than changing a live operational trip. Live investigation was read-only.
