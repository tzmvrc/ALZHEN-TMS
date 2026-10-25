# Delivery companion implementation

Scope: the existing assignment, event, cargo, receipt, report, tracking and collaboration services. Preserve the Trip Details changes already in the worktree.

## Confirmed gaps

- Legacy driver reads collapse multiple assignments into a trip and return all trip stops/cargo.
- Legacy progress writes change shared stop timestamps; uploading POD can complete a stop independently of delivered quantities.
- `trip_events` has no physical assignment, capture accuracy, idempotency or verification metadata.
- Loading/unloading report tables intentionally have one row per trip/stop. Keep them as trip-wide projections, with assignment events as the detailed record.
- Live tracking already has explicit consent, session guards, throttling and an hourly route cache. It stores only the latest fix.
- No durable offline queue or partial-unloading ledger exists.
- Existing private `trip-images`, OCR, `audit_logs`, report tables and collaboration transport can be reused.

## Implementation sequence

1. Add nullable event/image assignment metadata, a quantity ledger and bounded GPS history. Implement transaction RPCs with current-assignment authorization, server timestamps, idempotency, geofencing/evidence checks and audited admin corrections. Validate locally before applying.
2. Add bounded assignment workspace/event reads and protected uploads using existing private Storage. Maintain report projections only from actual saved events; never infer another truck's completion.
3. Replace driver main workspace with one next action, assignment/stop selectors, accessible status/report/unload/POD sheets and an account-scoped IndexedDB outbox.
4. Put the unified chronological event timeline beside Mapbox, with on-demand evidence and map focus. Keep existing report/photo/edit tools.
5. Use existing collaboration transport for assignment/event invalidation; separate GPS marker refresh from route recalculation.
6. Verify with disposable SQL fixtures and browser scenarios; record precisely which live/device/provider scenarios remain unverified.

Design: existing ALZHEN navy/blue/yellow, high contrast, 48px driver targets, readable mobile labels, modest motion and reduced-motion support. UI UX Pro Max minimal enterprise guidance applies; its marketing landing-page/serif suggestions do not fit this operational workspace.

## Implemented and activated (25 October 2026)

The new driver route uses DeliveryCompanion. Admin Trip Details retains its existing edit/report tools, with assignment selection, an integrated animated header, operational summaries, a paginated delivery timeline and an equal-width interactive Mapbox workspace. Timeline evidence, GPS history and cargo details load on demand. Phone layouts stack the panels; reduced-motion settings suppress decorative motion.

Four additive migrations were applied to the connected project:

- `2026_10_25_delivery_companion.sql`: assignment/event metadata, private quantity ledger, GPS history, transactional submission and audited review.
- `2026_10_25_delivery_companion_integrity.sql`: immutable linked evidence, report links/items, DR ownership and legacy timestamp protections.
- `2026_10_25_delivery_review_order.sql`: ordered timestamp corrections and audited Admin geofence settings.
- `2026_10_25_delivery_tracking_realtime.sql`: latest-location publication for the private backend Realtime bridge. No browser SELECT grant or RLS relaxation.

No operational trips, driver events, GPS sessions or consent records were created by verification. Final read-only diagnostics found 30 trips, zero new assignment-event rows and zero unloading-ledger rows. The earlier inspection had 31 trips; this implementation did not delete a trip. The existing demo data remains separate from the new saved workflow.

Driver submissions use server timestamps, assignment ownership, fresh GPS/accuracy checks, optional location radius (500 m default, Admin-configurable 100?5,000 m), photo-supported arrival without waiting for review, custom informational statuses, DR quantities, POD OCR/manual review and evidence-backed Backload/Offload submissions. Evidence uses the existing private trip-images bucket. Legacy driver mutation paths cannot bypass the new event/evidence workflow; Admin/Staff report editing remains available.

IndexedDB keeps owner-scoped immutable submission IDs and photo blobs. The UI says Pending Sync until backend acknowledgement. Uploads and events have independent retry keys. Automatic retry runs only while the app is active; permanent validation failures require attention. Limits are 50 drafts / 50 MB locally and six 5 MB attachments per event. A failed or abandoned upload keeps its reserved database identity for retry rather than silently deleting evidence.

GPS requires explicit driver permission and an active browser. Accuracy filtering, movement thresholds, 30-second write throttling and a five-minute stationary heartbeat reduce writes. Latest-position notifications refresh only the relevant marker; routes retain their existing hourly durable cache/claim rules. The private database bridge supports cross-instance delivery and GPS notifications. Admin delivery notifications fetch the confirmed event through a role-protected API rather than exposing event bodies on sockets.

## Verification evidence

- Frontend and backend production builds passed. Existing large Mapbox/Excel chunks and the report-service dynamic-import warning remain.
- Core regression run: 44 passing tests, including PGlite transactional delivery fixtures, Socket.IO authorization/deduplication, operational reports, route caching, convoy scoping and browser-location logic.
- Follow-up notification/Socket.IO run: 5 passing tests, including GPS echo deduplication and no driver leakage.
- Tracking/POD/receipt regression run: 14 passing tests, including consent/session ownership, capture validation, independent hourly routes, durable claims, private receipt permissions and OCR-review boundaries.
- The 44-test run and five-test follow-up overlap in the socket test; these are run totals, not 63 distinct tests.
- Playwright driver fixture run: 12 simulated workflow events and two intercepted image uploads; loading sequence, Traffic status, photo-required arrival, complete/partial DR unloading, remaining cargo, manual POD review and queued retry passed. No production writes.
- Playwright Admin fixture run: evidence review requires a reason, timestamp correction displays audit history, saved coordinates focus the real map, and 768/390px layouts have no page overflow. No production writes.
- Live authenticated Admin reads: cached Mapbox road geometry rendered; truck selection changed assignment, stops and timeline; first page of six events expanded to eight without the other truck's events; map expansion, GPS-history empty state and Admin arrival settings worked.
- Read-only service verification loaded assignment stops, cargo, event details and GPS availability successfully.
- `git diff --check` passed (only existing Windows line-ending warnings).

The PGlite fixture exercises verified arrival, outside-geofence evidence, continuing before photo approval, loading/departure ordering, custom-status independence, assignment/DR ownership, negative/over-unloading rejection, idempotent retries, partial remaining quantities, multi-truck completion isolation, POD independence, Backload/Offload evidence/items, Admin-only correction/review, audit retention and milestone ordering. It is not a live production concurrency/load test.

## Remaining field verification and operational limits

- A physical phone is still needed to validate camera permissions, real GPS drift/geofence accuracy, low-connectivity behavior, browser storage eviction and suspension/reopening. Ordinary web GPS does not promise tracking while the phone is locked.
- OCR integration is reused, with manual correction/fallback. Actual receipt recognition quality has not been certified using client documents in this task. PDF intake retains the existing deployment capability flag.
- Browser mutation checks use intercepted fixtures; SQL logic runs in isolated PGlite; Socket.IO uses real local transport with fixture identities. A real driver-to-Admin production submission with Storage and cross-replica Realtime has not been performed or claimed verified.
- No GPS-history retention deletion policy or automatic abandoned-evidence deletion was introduced. Set an approved retention policy before prolonged fleet rollout. History reads are paginated; reserved uploads remain traceable/retryable.
- Legacy reports without an assignment identifier remain explicitly trip-wide archives; the system does not guess ownership. New events, cargo and report evidence are assignment-specific. Historical demo event timestamps do not become new driver milestone submissions automatically.
- Existing converted operational reports retain their established workflow. Newly linked event evidence is available in its immutable delivery timeline; conversion does not reassign or overwrite that original evidence.
- No commit, push or deployment was performed. The four migrations are active; deploy the matching backend/frontend together for hosted use.

## Main files

Backend: `src/services/delivery-workspace.service.ts`, `src/routes/delivery.routes.ts`, `src/app.ts`, `src/services/collaboration-server.ts`, `src/services/tracking.logic.ts`, `src/services/home-trip-details.service.ts`, `src/services/operations-report.service.ts`, `src/routes/report.routes.ts`, `src/controllers/trucker.controller.ts`, `src/controllers/operations-report.controller.ts`; four migrations and delivery/socket regression fixtures.

Frontend: `pages/Driver/DeliveryCompanion.tsx`, `components/delivery/*`, `services/delivery.service.ts`, `services/delivery-outbox.ts`, `services/location-capture.ts`, `services/collaboration.service.ts`, `services/live-activity.service.ts`, `components/admin/useLiveTripActivity.ts`, `TripTrackingWorkspace.tsx`, `RoadRoutingPanel.tsx`, `RoadRouteMap.tsx`, `LocationSharing.tsx`, `home/TruckerUpdates.tsx`, `trip-tracking.css`, `pages/Admin/views/TripDetailView.tsx`, `pages/Admin/DashboardPage.tsx`, `pages/Driver/DriverAccountPage.tsx`, and routing/API integration. Existing earlier Trip Details work was preserved.
