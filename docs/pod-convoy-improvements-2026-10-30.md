# POD submission, Delivered projection and convoy Event Details

## Root causes

1. Confident OCR classifications still discarded selected photos, and the submission handler blocked unreadable/invalid results and required an OCR/manual readiness state. OCR could also arrive between field focus and the first change event.
2. Cargo/POD matching filtered receipt records by the single receipt-header DR before looking at explicit allocation IDs. A multi-DR submission could therefore disappear from its correctly selected cargo lines, producing Delivered — POD Not Submitted. Admin product review repeated the header-DR assumption.
3. Event Details rendered one inspector for the monitored truck. Showing another truck required changing the selector.
4. The database image-content unique index rejected intentionally identical pages inside one submission, as well as duplicates across separate submissions.

## POD behavior

OCR continues to fill suggestions. Receipt fields take manual ownership on focus/change; later scan responses do not overwrite them. OCR readiness, conflicting suggestions, unreadable classifications and unrelated classifications no longer prevent otherwise valid manual submission. Normal DR/assignment, required-field, file, quantity and milestone validation remains.

Every intentionally added page is retained, including identical files within the six-page limit. Unreadable/unrelated images receive a nonblocking note. Only explicit removal/retake/discard actions remove local evidence; original saved documents and review history remain protected. Final edited fields, selected allocation IDs, submitted quantities, original prepared images and raw OCR travel together through the existing outbox and replacement workflow.

Product choices are scoped to the current assigned delivery stop. Repeated models remain distinct by allocation and DR. Backend validation checks the requested stop and quantity, and the database checks allocation/line/product/assignment/stop/DR inside the receipt transaction. POD selection never updates unloading quantities or billing.

## Delivered calculation

Explicit selection identities are matched before receipt-header DR labels. Each selection retains its own DR; legacy receipts still use conservative, unambiguous model/DR matching. Admin product review, cargo review status and Product Delivery Timeline share this corrected relationship.

Delivered still requires completed physical delivery, exhausted remaining quantity, and a linked Approved POD. Pending/rejected/no-POD labels remain distinct. Approval alone leaves the actual physical status visible. Existing collaboration refresh, delivered-first stable sorting and green row highlighting remain intact.

## Convoy Event Details

One Event Details container renders the existing inspector independently for each assignment, with truck/Driver headings and thin dividers. Truck selectors are hidden while Event Details is open and return with Back to route.

Matching uses assignment/event type and persisted stop identity. A unique store/DR destination association may match separate persisted stop IDs; sequence numbers and names are never join keys. Missing or ambiguous matches show Awaiting Update without copying another truck's time, actor, location, files or remarks. Single-truck views stay full width, additional trucks scroll within the container, and mobile sections stack. Review/correction requests retain the individual assignment and event ID. Inspector remount keys include event identity/version to avoid stale evidence during updates.

## Database migrations applied

Project confirmed: `hdmknewarynwpbrhfgai`.

- `pod_allocation_scope`, version `20261029175529`, source `backend/migrations/2026_11_23_pod_allocation_scope.sql`: validates existing selection metadata atomically, without introducing another relationship table or changing operational quantities.
- `pod_image_retention`, version `20261029182446`, source `backend/migrations/2026_11_24_pod_image_retention.sql`: replaces the unique image-content index with a lookup index and serialized content guard. Intentional identical pages within one event are accepted; duplicate content in separate submissions remains rejected. Existing request idempotency is retained.

No historical records or images were modified, and earlier migrations were not rerun.

## Files changed

- Backend services: `delivery-workspace.service.ts`, `pod-product-selection.service.ts`.
- Frontend: `DeliveryCompanion.tsx`, `pod-submissions.ts`, `pod-admin-products.ts`, `cargo-delivery.ts`, `delivery.service.ts`, `convoy-event-details.ts`, `TripTrackingWorkspace.tsx`, `TripOperationalInspector.tsx`, `ConvoyEventDetails.tsx`, `trip-operational-workspace.css`.
- The two migrations above.
- Backend tests: `pod-allocation-scope.test.ts`, `pod-image-retention.test.ts`, `pod-service-integration.test.ts`, `pod-event-status.test.ts`. Older test fixtures were updated for crew authorization and the real products lookup dependency.
- Frontend tests: `pod-convoy-corrections.test.ts`, `pod-manual-retention.browser.cjs`, `product-delivery-allocation.browser.cjs`, `convoy-event-details.browser.cjs`; screenshot `frontend/tests/artifacts/convoy-event-details-desktop.png`.

## Verification

- Backend and frontend production builds passed. Existing frontend chunk-size/import warnings remain.
- Ten frontend checks passed for allocation/DR matching, manual metadata, physical vs review status, replacement history, Admin product matching and convoy stop isolation.
- Database guards passed exact stop/truck/DR/quantity rejection, unchanged allocation quantities, intentional same-submission duplicate retention, and cross-submission duplicate prevention.
- Real backend services against isolated PostgreSQL passed corrected-text persistence, multi-image submission, rejection, notifications, replacement/idempotent replay, approval, authorization and retained history. The submitted header differs from the raw OCR text and persists exactly.
- Ordinary trucker timeline response tests passed decision visibility and private Storage/OCR exclusion.
- Production Trucker UI browser test passed unreadable-only manual availability, late OCR protection, unreadable/unrelated image retention, repeated models under two DRs, and offline queue/reload retention of all four intentional photos (including an identical page) and final fields.
- Cargo browser checks passed collaboration-driven Delivered status, sorting/highlighting and unchanged values; rejection/replacement transitions; correctly scoped product history/photos; zoom/reset/Open Original; and mobile behavior. The receipt header DR deliberately differs from the selected allocation DR.
- Integrated Trip Details browser checks passed for one and two trucks, separate actors, selectors hidden only in Event Details, and Back to route restoring the selector.
- Playwright MCP verified side-by-side dividers, separate timestamps and Helper attribution, Awaiting Update, readable 320px columns with internal horizontal scrolling, mobile stacking without page overflow, and a correction request targeting only the second truck's assignment/event.

Verification used isolated browser transports and local PostgreSQL fixtures. No live operational POD was submitted, approved, rejected or changed. Live Supabase verification was limited to schema/migration/guard checks. No commit, push or deployment was performed.
