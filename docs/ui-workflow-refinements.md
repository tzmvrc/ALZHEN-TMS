# UI and performance refinements ? 25 October 2026

This pass changes the existing application UI and bounded read paths. No automated tests, production builds, SQL, database migrations, data writes, commits, pushes or deployments were performed.

## UI

- Delivery Companion uses 22px primary headings, 16px section headings, 14px body text, compact cards and a 46px next-action button. Secondary actions are 64px tall instead of 84px. Touch targets stay at least 44px; text inputs remain 16px to avoid browser auto-zoom on phones. GPS/evidence/OCR/report/outbox behavior is unchanged.
- Home replaces Next Delivery Windows with permission-aware Workspace Shortcuts using the existing navigation callback. Only existing accessible workspaces are offered. No navigation API reads were added.
- Latest from the field is a horizontally scrollable connected milestone timeline. Fleet mode shows recent saved events, selected-truck mode shows chronological assignment-scoped events. Incidents use an exception color and saved remarks. Event links preserve assignment and stop context. Demo badges remain. GPS samples remain on the map rather than filling the operational timeline with duplicate location cards.
- Trip Details integrates CBM, quantities, status, truck/stop counts and completion into the navy header. The original truck art is larger and moves along a longer path. The progress-road marker moves only when saved completion changes. Reduced motion remains supported.
- Five summary cards and the Assigned Fleet cards are removed. A compact assignment selector and the existing management action control all truck-specific views.
- Trip-wide Operational Report History sits directly below the header/selector, with visible compact loading/unloading times, remarks, Backload/Offload records and protected report thumbnails. Shared legacy records are explicitly trip-wide; new event evidence stays in its assignment timeline.
- POD/OCR review and the records library are visible directly. Duplicate Trucker Activity and repeated loading/stop timestamp blocks are removed; selected-stop cargo and existing report actions remain.

## Performance and loading

- Existing shared near-end loading is reused for Master List/report projections, Database, Users, operational reports, Transmittal and flexible tables. Manual append buttons are removed; existing automatic paging, server criteria, stable IDs, edit guards and virtualization remain. Error retry actions remain available. Card-based pagination and the reference-lookup workflow retain their own controls.
- Field activity no longer polls every 30 seconds. It reads a short cached response, coalesces relevant Realtime changes, and refreshes on reconnection/foreground resume. Activity events are deduplicated by source ID before semantic grouping.
- Home trip derivation, map inputs and analytics are memoized. The analytics chunk loads as its section approaches the viewport. The fixed 1.5-second detail-read delay is removed. Returning to a fully loaded Home within one minute reuses its snapshot; Realtime invalidations still refresh it. Activity/photo-only invalidations refresh the bounded detail batch without rereading all four headline counts or the report snapshot.
- Fleet Mapbox instances unmount while their retained workspace is hidden; cached rows and selection stay in the parent. Marker updates and the existing hourly route policy are unchanged.
- Trip Details passes stable map IDs and narrows convoy refreshes for commits from other trips. Assignment event signals refresh their own timeline instead of forcing the full trip-detail read pipeline.
- Admin event pages optionally include inline evidence. Up to 36 event attachments are signed in one Storage batch; full audit/quantity details remain on demand. Storage paths are stripped from the response.
- The existing trip-operations endpoint optionally includes up to 60 recent report thumbnails in one bounded query and one signing batch. Additional files remain accessible through the existing report viewer, with an explicit limit notice. Only Admin/Staff receive this projection. Existing report ownership is preserved.

## Files touched in this pass

Frontend components: `admin/home/WorkspaceShortcuts.tsx` (new), `HomeCommandCenter.tsx`, `TruckerUpdates.tsx`, `home-dashboard.css`, `TripTrackingWorkspace.tsx`, `TripDeliveryOperations.tsx`, `OperationsTimeline.tsx`, `ReceiptReviewCard.tsx`, `RoadRoutingPanel.tsx`, `trip-tracking.css`, `delivery/DeliveryTimeline.tsx`, `delivery/delivery-workspace.css`, `DatabaseSpreadsheet.tsx`, `ReportDataView.tsx`, `OperationsReportsView.tsx`, `TransmittalTrackerView.tsx`, `SpreadsheetPresentation.tsx`.

Frontend views/services: `OverviewView.tsx`, `TripDetailView.tsx`, `FlexibleTablesView.tsx`, `services/activity-presentation.ts`, `services/delivery.service.ts`, `services/operations-report.service.ts`.

Backend: `services/delivery-workspace.service.ts`, `services/operations-report.service.ts`, `controllers/operations-report.controller.ts`, `routes/delivery.routes.ts`.

Earlier worktree changes, migrations, GPS capture logic, offline submission logic and other pages are preserved.

## Visual inspection and remaining verification

Playwright was used to inspect the running application, not to run automated test suites. Desktop Home displayed the new shortcuts and horizontal timeline; Master List opened through its shortcut with no Load More Rows button. The two-truck demo Trip Details rendered real cached Mapbox geometry, visible report history, and the new selector. Selecting the second truck displayed its driver and assignment timeline. The selected route and timeline panels remained equal width. Selecting the map marker for DEMO30-030B changed the field heading to its driver and showed its saved milestones in chronological order. Densely clustered overview markers can overlap at a nationwide zoom; clustering was outside this pass. Home and Trip Details were inspected at 390px; no horizontal page overflow was observed. Screenshots are local ignored Playwright artifacts.

The two-stop report history shrank from approximately 616px in the first direct-display iteration to 369px with compact milestone rows. This is a layout measurement, not a database or load-performance benchmark.

Full functional/regression testing, large-dataset scrolling benchmarks, upload/image-link expiry checks and physical-phone GPS/camera/offline/OCR testing remain for the next phase. Current demo records have no actual POD/report image files; inline evidence rendering is implemented but was not validated against a real uploaded client document in this pass. The Trucker session available at the start had no active assignment; compact populated-driver interactions still need visual acceptance with an assigned driver account. Existing legacy reports without assignment metadata are not retroactively attributed to individual trucks.
