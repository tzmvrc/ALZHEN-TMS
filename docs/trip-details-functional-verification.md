# Trip Details functional inspection — 26 October 2026

## Outcome and remaining blocker

The confirmed code/database integration defects below were fixed. Live verification completed against a dedicated two-truck verification trip before Supabase Auth/network availability deteriorated. A final fresh-session, zero-console-error pass could **not** be completed: `/auth/v1/user` timed out from both the backend SDK and the browser SDK. Authentication continues to fail closed and preserve existing sessions/drafts; it was not bypassed.

The verification trip is archived, its two accounts/drivers/trucks are deactivated, and its evidence/audit history is retained. The original 30 demo trips remain present. No existing operational records were deleted.

## Error investigation

- The historical browser log contains a Supabase WebSocket DNS failure (`ERR_NAME_NOT_RESOLVED`) and seven HTTP 503 responses on trip children, operational reports and Trip Booking. The old response bodies are unavailable, so the exact cause of every historical response cannot be proved from that log alone.
- During this inspection, fresh responses identified `AUTH_VERIFICATION_UNAVAILABLE`. The SDK reported `AuthRetryableFetchError`, status 0; a browser identity read failed after approximately 19.5 seconds. A separate unauthenticated gateway health request succeeded, which does not establish that the authenticated identity endpoint is healthy. Backend/frontend project URL and anonymous-key configurations match. These observations support an Auth/network availability blocker; they do not establish host RAM exhaustion as its cause.
- Actual Backload creation exposed a separate, reproducible 503: `service_role` lacked SELECT on `backload_items`. The equivalent Offload read was permitted. The narrow read grant below fixed this failure; subsequent report reads showed saved status and affected cargo.
- Development watcher reloads temporarily produced `ERR_CONNECTION_REFUSED`. Those are distinguished from Supabase DNS/503 failures. Only the identified local backend process tree was restarted to activate its changed environment flag; unrelated services were not stopped.
- Reusing an identical POD image correctly hit the existing duplicate-content constraint. Its technical database error is now translated to a readable `POD_ALREADY_SUBMITTED` conflict. The integrity guard remains enforced. A distinct, explicitly labeled verification image was used to complete the second truck's OCR/POD workflow.

## Implemented fixes

- Added saved `incidents` and `demurrages` to the existing authorized trip-scoped operations response and its existing Realtime refresh path. Legacy records remain trip-wide because those tables have no assignment FK. They are not attributed to a guessed driver/truck.
- Read actual Backload cargo items, in parallel with Offload items, and group by report identity without N+1 requests or repeated scans.
- Allowed management users to read genuinely trip-wide event evidence through the existing event-details route after confirming the assignment/trip context. Drivers still require exact ownership; a record belonging to another assignment remains inaccessible.
- Added failed-image retry controls using the existing signed-link services. Galleries track selected image IDs rather than positions and close safely if that attachment disappears. Evidence changes refresh metadata/details through the existing collaboration connection, with coalescing and no polling.
- Removed the obsolete unused vehicle-card constant and corrected the saved event-metadata type.
- Changed Trip Details' Trip Booking enrichment to load when opening records/photos, rather than blocking every initial load and Realtime refresh. Backend timing logs had shown a roughly 12-second failed view read on that optional path.
- Session bootstrap reuses the same-request profile already verified by authentication middleware. It does not cache permissions between requests. Transient browser bootstrap retries now back off from 5 seconds to a maximum of 60 seconds; availability diagnostics are rate-limited and contain no tokens.
- Event history uses bounded 500-row cursor reads with an ID tie-breaker, removing reliance on an implicit API row cap.
- Collapsed timeline phases do not mount their history. Long horizontal phases reuse the shared automatic near-end loader, rendering 60 milestones initially and adding batches of 40. Existing vertical table loading keeps its default behavior.

## Database and configuration changes

- Applied migration `backload_item_read_access`, recorded locally as `backend/migrations/2026_10_26_backload_item_read_access.sql`:

  `grant select on table public.backload_items to service_role;`

- Verified authenticated-client SELECT on that table remains absent. No RLS, index, table structure, or business-rule trigger was weakened.
- Enabled the existing local `backend/.env` setting `TRACKING_ENABLED=true`; `PLANNED_ROUTES_ENABLED` remains true. No capture thresholds, geofences or hourly Directions policy were changed. Deployment environments must retain the intended activation setting separately; no deployment was performed.
- Incident/demurrage tables already have change-signal triggers. Their refresh uses the existing signal bridge; no publication migration or additional database subscription was necessary.

## Live verification

Fixture: `VERIFY-025a23e6`, trip `b4f45241-8970-4d62-a872-4cc9ce28f1d5`. This is a test trip, not a customer order or actual driver journey.

- Created two dedicated test accounts, drivers, trucks, assignments and cargo allocations, sharing a delivery stop while keeping allocated quantities independent.
- Used actual authenticated backend endpoints to save GPS-verified warehouse arrival, loading start/finish, warehouse departure, Traffic, delivery arrival, unloading start, partial quantities, unloading completion, stop departure and assignment completion.
- Confirmed an event retry returned the same event; partial-unload retry was counted once; an excess quantity was rejected; another driver's assignment read was denied.
- Confirmed partial unloading left 2 units, then unloading the remaining 2 brought truck A's confirmed total to 10. Truck B's allocation stayed separate. Completing truck A did not complete the shared stop/trip for truck B.
- Outside-geofence arrival required evidence. A real PNG was uploaded to the private `trip-images` bucket, photo-supported arrival saved as pending review, and loading continued without an Admin approval gate.
- Admin evidence confirmation and a UI timestamp correction both persisted. The original values and two review/correction audit entries remain accessible.
- Backload and Offload were actually saved with images, DR and allocated quantities. Their right-panel details showed saved type/status, reason, remarks, image and cargo. A saved Demurrage displayed `PENDING`, its reason and trip-wide scope without inventing truck ownership.
- Signed Storage image requests returned 200 and loaded 640px images. Clicking a thumbnail opened the native preview with its actual image.
- Browser Tesseract OCR ran against a labeled verification image at 90% confidence. Missing DR validation was exercised; extracted values were reviewed/corrected before a real POD submission. Supabase contains the OCR text/confidence and the POD remains `PENDING`, not automatically approved.
- A separate mobile Trucker browser context saved a Traffic update offline. It showed one pending local action; reconnecting synchronized it. A database query confirmed exactly one matching event.
- Existing Realtime updated the open Admin timeline and evidence without a page refresh. Truck switching kept assignment-specific cargo and reports separate; the map remained mounted during event selection/return.
- An explicit test-account GPS session started, accepted a coordinate and stopped. The saved location has 15m accuracy and `enabled=false` after stopping. These were test coordinates, not physical-driver telemetry.
- Checked mobile layout at 390 × 844, milestone/event navigation, native image preview and reduced-motion handling. Actual phone camera capture and locked/background mobile GPS were not tested or claimed.

## Targeted automated and performance checks

- 16 targeted backend checks passed across delivery transactions, authentication profile reuse, event cursor pagination, truck scoping, tracking authorization, route cache/concurrency, receipt constraints and read-only route assembly.
- Frontend and backend TypeScript no-emit checks passed. No production build or unrelated test suite was run.
- Isolated cursor fixture: 1,201 events with equal timestamps returned uniquely across three bounded reads.
- Isolated browser rendering fixture: 1,500 milestones; collapsed phase mounted 0 milestone nodes, expansion mounted 60, near-end scrolling appended to 100. This was explicitly a rendering fixture with no database writes, not a claim that 1,500 production events were inserted. Temporary inspection entries were removed.
- Existing route tests confirmed no additional Directions calls for marker-only changes and hourly cache refresh behavior. Mock provider tests are distinguished from live Mapbox verification.
- `git diff --check` passed. No commit, push or deployment was performed.

## Verification data safety

- Retained 23 saved events, 6 image metadata rows / 6 private Storage objects, one Backload, one Offload and one Demurrage on the archived verification trip. Zero fixture Storage objects lack a matching image metadata record.
- The duplicate-POD attempt left a retained, assignment-owned photo; it did not create a duplicate receipt or an orphaned Storage object.
- `backend/scripts/archive-trip-workspace-verification.sql` was applied. It archives only the verified fixture identity and deactivates only its test accounts/drivers/trucks. Assignment and cargo links remain intact, respecting the existing guard against detaching delivered cargo.
- `docs/trip-details-verification-fixture.json` contains credential-free fixture identities. Temporary passwords/session material were removed from disk and the verification browser context was closed.

## Files changed in this functional pass

Backend: `controllers/auth.controller.ts`, `middleware/auth.middleware.ts`, `services/auth.service.ts`, `services/delivery-workspace.service.ts`, `services/operations-report.service.ts`, `services/trip.service.ts`.

Frontend: `context/AuthContext.tsx`; `components/admin/TripOperationalInspector.tsx`, `TripOperationalTimeline.tsx`, `TripTrackingWorkspace.tsx`, `useSpreadsheetInfiniteScroll.ts`; `components/delivery/DeliveryEvidenceGallery.tsx`; `pages/Admin/views/TripDetailView.tsx`; `services/activity-presentation.ts`, `operational-timeline.ts`, `operations-report.service.ts`, `trip.service.ts`.

Added the read-grant migration, live verification/archive scripts, `auth-profile-reuse.test.ts`, `trip-events-pagination.test.ts`, and this report/credential-free manifest. Updated `tracking-api.test.ts` to isolate its activation flags from the local environment. Earlier unrelated worktree/style changes were preserved.

## What remains externally blocked

A fresh authenticated final regression pass, including live expired-link renewal after the outage, requires Supabase Auth/network availability to recover. Physical-phone GPS/camera/background behavior requires a real device. The passing isolated large-history checks do not establish production concurrency capacity. No claim of a clean final console or complete real-device verification is made.
