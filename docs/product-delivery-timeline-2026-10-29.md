# Next destination and product delivery history — 2026-10-29

## Root causes

The Trucker next-action sequence did not include the existing IN_TRANSIT event, and its workspace query omitted those saved events. Admin projected On the Way from the previous departure timestamp instead of requiring an explicit trucker action. The writer supported IN_TRANSIT but its unique milestone index did not cover that event type.

The cargo table displayed and sorted by document approval alone, overriding the actual physical delivery state.

## Implemented behavior

- A shared next-destination selector chooses the earliest unfinished assigned stop by sequence. On the Way is required before arrival for an unreached destination. Only a confirmed server acknowledgement advances the action. Previously reached legacy stops do not require a retroactive travel event, and no new destination is created after the final stop.
- The workspace includes persisted IN_TRANSIT events. Admin shows the actual travel timestamp and no longer invents travel activity from departure. Existing replacement requirements retain priority and completed physical milestones remain unchanged.
- Delivered requires a saved STOP_DEPARTURE for the assignment/stop, fully unloaded allocation quantities, and an approved POD explicitly linked to that allocation. Completed deliveries with Pending/Rejected documents display Delivered — POD Pending / Delivered — POD Rejected. Early approval leaves the correct physical label and displays the review separately.
- Delivered rows sort stably before other rows and use a full-width light-green background and darker green status. Existing collaboration commit/signal handling refreshes completion, review, rejection and replacement changes without polling or an additional subscription.
- Clicking a row or its product button opens an accessible native dialog. It shows allocation quantity/CBM, truck/driver, DR, destination, physical status and independent review status. Persisted allocation, warehouse, destination, submission and Admin review timestamps form the chronological history. Rejected and replacement photos remain available through the existing image viewer. Product identities use allocation/line-item IDs; repeated names cannot select another DR/truck/stop's files.
- The modal reuses the workspace, receipt list and trip events. No per-product or modal-specific database query was added. UI/UX Pro Max guidance was applied to focus visibility, native modal keyboard behavior, mobile scrolling, clear hierarchy and touch targets.

## Database

After inspecting the installed writer, indexes, allocation timestamp column and permissions, applied `explicit_destination_transit` through Supabase MCP to confirmed project `hdmknewarynwpbrhfgai`. Version: **20261029041122**. Source: `backend/migrations/2026_11_15_explicit_destination_transit.sql`.

The small function-only patch reuses the writer's existing trip/assignment transaction locks. An IN_TRANSIT retry returns the original event for that assignment/destination, even with another request key. A new travel event requires a destination and cannot be recorded after that destination was reached. Existing assignment authorization, prior-stop sequencing, original request-key validation, grants, POD workflow and transaction behavior remain intact.

Supabase confirmed the installed guard, service-role execution, and denied direct authenticated/anonymous execution. No tables/columns were added, old migrations rerun, or operational records backfilled/deleted.

## Files changed in this task

Production:

- `backend/src/services/delivery-workspace.service.ts`
- `backend/migrations/2026_11_15_explicit_destination_transit.sql` (new)
- `frontend/src/services/delivery.service.ts`
- `frontend/src/services/operational-timeline.ts`
- `frontend/src/services/pod-submissions.ts` (preserve full receipt types when matching)
- `frontend/src/services/cargo-delivery.ts` (new)
- `frontend/src/pages/Driver/DeliveryCompanion.tsx`
- `frontend/src/components/delivery/DeliveryCargoSummary.tsx`
- `frontend/src/components/admin/TripTrackingWorkspace.tsx`
- `frontend/src/components/admin/ProductDeliveryTimeline.tsx` (new)
- `frontend/src/components/admin/product-delivery-timeline.css` (new)
- `frontend/src/components/admin/pod-review.css`

Verification:

- `backend/tests/fixtures/pod-integration-fixture.ts`
- `backend/tests/destination-transit.test.ts` (new)
- `frontend/tests/operational-timeline.test.ts`
- `frontend/tests/cargo-delivery.test.ts` (new)
- `frontend/tests/destination-transit.browser.cjs` (new)
- `frontend/tests/product-delivery.browser.cjs` (new)
- `frontend/tests/pod-submission-review.browser.cjs` (physical-status expectation)
- `frontend/tests/artifacts/product-delivery-mobile.png` (new)

Pre-existing worktree changes were preserved.

## Verification results

- Backend and frontend production builds passed. Frontend retains existing bundle-size/dynamic-import warnings.
- **24 focused unit/integration tests passed.** These include isolated PostgreSQL with the actual writer/triggers: explicit travel persistence, retry deduplication, assignment authorization, no skipped preceding stop, arrival after travel, and POD late-rejection/replacement regressions. Frontend checks cover final destinations, immediate acknowledgement, physical/review separation, allocation/DR isolation and chronological history.
- **40 Playwright checks passed:** next-destination workflow (5), product history/realtime display (7), POD chronology (4), review/resubmission (7), submission/review/offline regressions (17). The new browser suites exercise production components and the actual local outbox against isolated transport fixtures. The arrival check preserves the existing GPS permission/location step. Desktop and 390px mobile layouts, modal keyboard dismissal, photo zoom/reset/Open Original, history retention, green row styling and unchanged quantities/CBM were checked.
- Read-only actual backend/Supabase workspace check on the archived isolated test assignment returned the expected assignment, seven milestones and the persisted allocation creation timestamp.
- Migration installation and unchanged service-only permissions were verified directly through Supabase MCP.
- `git diff --check` passed.

Limitations: no new live operational On the Way, delivery, POD or review event was written. Live checks were schema/read-only; transactional cases used isolated PostgreSQL and browser interaction used isolated API fixtures. A new end-to-end live two-device collaboration run was not performed. No commit, push or deployment was performed.
