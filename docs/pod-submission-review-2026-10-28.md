# POD submission review and replacement workflow

Implemented against the existing Trucker Delivery Companion and Admin Trip Details. The required Supabase migrations were applied with explicit user authorization. No deployment, commit, push, or live operational POD mutation was performed. Existing unrelated worktree edits were retained. No reference screenshots were available in this conversation.

## Data model and migration

Supabase MCP read-only inspection confirmed `trip_images.delivery_event_id`, `assignment_id`, review/version fields, private Storage originals, `pod_review_events`, `trip_events.delivery_payload/delivery_metadata`, and recipient-scoped `admin_notifications`. The existing `review_pod_receipt_v1` already commits a decision, audit record, and notification together. Current receipts have event/assignment links; no historical backfill is needed for the inspected database.

The following migrations were applied successfully using connected Supabase MCP after inspecting the live schema, installed functions, constraints, indexes, triggers, and migration history:

| Version | Name | Purpose |
| --- | --- | --- |
| `20261028093021` | `simplified_delivery_sequence` | Installs the missing dependency matching the existing frontend: arrival, POD upload, unloading, then Admin-approved completion. Actual unloaded quantities are recorded only when the trucker confirms Finished Unloading. |
| `20261028093025` | `pod_submission_review` | Applies the corrected `backend/migrations/2026_11_04_proposed_pod_submission_review.sql`: atomic submission decisions, replacement links/requests, scoped notifications, and guards. |

The SQL filename retains its original proposed name for continuity; its status is now **applied and verified**. Supabase returned success for both migrations. Separate safe schema checks verified service-role-only execution, private-document foreign keys, all workflow markers, and migration-history entries. Safe PostgREST calls with null actors resolved both new RPCs and returned the expected `403 / 42501` authorization denial before any write.

Before/after fingerprints matched exactly for trips, delivery events, documents, decision history, POD records, cargo allocations, and billing. Evidence is recorded in `docs/pod-submission-live-verification-2026-10-28.json`.

The reviewed implementation:


- Adds two service-role-only RPCs: `review_pod_submission_v1` and `submit_pod_replacement_v1`.
- Uses the existing delivery-event ID to identify one submission. The first page ordered by display order, upload time, and image ID is its canonical review document. A DR is never an identity.
- Calls the existing review RPC for the canonical document, retains its audit record and notification, and applies its decision to the other pages atomically. Separate submissions, including repeated DR numbers, remain separate decisions.
- Stores one `pod_replacement_request` object on the rejected delivery event, containing the canonical receipt ID, reason, request time, audit event ID, and `resolved_by` replacement event ID. The rejected images and OCR data remain intact.
- Stores `replaces_receipt_id` in the replacement's existing payload and metadata. Resolves the source request only after the existing delivery writer succeeds in the same transaction.
- Adds a guard to the existing delivery writer preventing ordinary uploads from bypassing the relevant rejection, and preventing departure/completion while replacement requests remain outstanding.
- Adds no tables, columns, Storage objects/policies, billing changes, allocation changes, or backfill. The existing review RPC now validates grouped-document DRs against the exact truck/stop cargo and selects only the matching DR ledger. This allows multiple DRs at one stop without combining document decisions. Outstanding replacement requests also block automatic assignment completion. The guard verifies its expected source anchor and aborts rather than modifying an unfamiliar writer. Migration replay is tested.

The database dependency is ready, and the existing local `POD_REVIEW_ENABLED=true` gate was verified. Grouped decisions fail closed if an RPC is unavailable; manual receipt-field corrections still use their existing endpoint. The source worktree has not been deployed, as requested.

Legacy images without a delivery-event association remain independent admin review documents using the old RPC. They are not guessed into a truck submission or replacement chain. The new trucker preview signs only exact-assignment, authenticated-uploader, READY receipt records. Legacy reconciliation would require verified associations; this change does not create them.

## User behavior

Trucker My Trip keeps two balanced quick actions: Add Status and Submit Report. POD upload stays in the required delivery sequence. Cargo & delivery documents lists each stop's saved submissions, including rejected ones, with read-only thumbnails and the existing enlarged viewer's previous/next controls. Reads reuse private signed document access and create no documents.

Admin POD Review has keyboard-accessible, horizontally scrolling submission tabs labeled `DR — Store`, up to six photo thumbnails, enlarged previous/next preview, existing editable receipt fields, uploader/time/status, and Products Received by Store. Products are matched to assigned cargo at the exact stop and DR. Only explicit submitted model selections and quantities are used; missing quantities show Not specified, and empty selections show No products specified on this POD. Historical line items may inherit their DR from their exact stop. Unmatched submitted selections show a review message instead of being represented as an empty selection. Stored serial metadata remains in receipt snapshots but its admin review UI is removed.

Save receipt fields remains separate from Confirm Receipt. Confirm Receipt and Reject POD use the canonical document's existing OCR/review versions and request UUID. Rejection opens a native modal and requires a nonblank reason. Retries reuse the decision UUID and unchanged payload. Approved/rejected grouped submissions cannot be silently re-decided; replacements are new submissions. Existing legacy re-review authorization remains unchanged. Audit-history APIs/records remain available despite removal of the separate decision panel/history controls.

Cargo statuses derive from the latest matching submission for the selected assignment, stop, DR, and selected product. POD Pending is blue with hover underline and opens the corresponding review tab; Approved/Rejected are distinguished. Cargo with no matching submitted product retains On Truck/Partially Delivered/Delivered. No physical quantities/statuses are overwritten.

Rejection notifications use the existing recipient-scoped notification table and interface. The existing transactional review notification is enriched with DR, reason, trip, stop, assignment, and document identity. Notification retries do not create new rows. Selecting a rejection notification focuses the relevant required action. If it belongs to another assignment of the authenticated trucker, the workspace loads that assignment through the existing authorized API and offers Return to current trip. The backend denies another trucker's assignment.

Upload POD — Admin Request appears in My Trip and inside the delivery timeline for the affected stop, including its reason. It opens the existing upload sheet, retains DeepSeek Flash scanning/manual correction/product selection/quantity support, and carries the rejected document ID through IndexedDB and synchronization. A replacement rejection creates a request on that new submission; the earlier request stays resolved. Completed but still assigned trips remain discoverable when they have outstanding requests.

## Files changed for this task

Backend:

- `backend/src/routes/delivery.routes.ts`
- `backend/src/services/delivery-workspace.service.ts`
- `backend/src/services/pod-review.service.ts`
- `backend/src/services/trip-receipt.service.ts`
- `backend/migrations/2026_11_04_proposed_pod_submission_review.sql`
- `backend/scripts/check-pod-rpc-availability.cjs` (safe null-actor readiness probe)

Frontend:

- `frontend/src/pages/Driver/DeliveryCompanion.tsx`
- `frontend/src/components/admin/ReceiptReviewCard.tsx`
- `frontend/src/components/admin/PodDecisionControls.tsx`
- `frontend/src/components/admin/TruckerNotifications.tsx`
- `frontend/src/components/delivery/DeliveryCargoSummary.tsx`
- `frontend/src/components/delivery/DeliveryTimeline.tsx`
- `frontend/src/components/delivery/SubmittedPodDocuments.tsx`
- `frontend/src/components/delivery/delivery-workspace.css`
- `frontend/src/services/delivery.service.ts`
- `frontend/src/services/receipt.service.ts`
- `frontend/src/services/pod-submissions.ts`

Verification:

- `backend/tests/pod-permissions.test.ts` (updates the fixture to accept the existing device-session auth RPC; production authorization is unchanged)
- `backend/tests/pod-preview-permissions.test.ts`
- `backend/tests/pod-submission-workflow.test.ts`
- `backend/tests/pod-submission-products.test.ts`
- `backend/tests/pod-workflow-integration.test.ts`
- `backend/tests/pod-service-integration.test.ts`
- `backend/tests/fixtures/pod-integration-fixture.ts`
- `backend/tests/fixtures/pod-live-review-functions.sql` (metadata-only snapshot of the installed review/writer definitions)
- `frontend/tests/pod-submission-review.browser.cjs`
- `frontend/tests/pod-auto-read.browser.cjs` (filechooser handling, current timeout duration, sequential offline timeline actions, six-photo boundary verification)
- `frontend/tests/pod-inline-review.browser.js` (updated submission-tab and confirmation expectations; executed through Playwright MCP)
- `docs/pod-submission-live-verification-2026-10-28.json`
- This report.

Some listed production files already had user edits; those were preserved. Other pre-existing modified/untracked files shown by git status are not part of this task.

## Verification results

- Frontend and backend production builds pass. Vite reports its existing dynamic-import/chunk-size warnings.
- **36 targeted tests pass**, covering POD review, exact truck/stop/DR and product matching, empty reasons, request replay, recipient scoping, secure rejected-photo preview, preservation of originals, two replacement/rejection cycles, partial/manual extraction, DeepSeek request configuration, real local Tesseract, and upload limits.
- The new SQL integration fixture starts with the installed live writer/review definitions and real operational triggers, then applies both migrations. It exercises multiple DRs at one stop, stop-DR inheritance, independent trucks/stops/trips, arrival requirements, rejection, replacement, approval, unloading, and final delivery completion. Product-received quantities do not become actual unloaded quantities. Cargo allocation and billing snapshots remain unchanged.
- The backend service integration test runs the actual submission, receipt listing, review, notification, preview, and workspace services against isolated PGlite through a transport adapter. It verifies persistent notifications/read status, replacement identity and resolution, canonical approval responses, duplicate-decision prevention, unchanged cargo, and retained rejected originals.
- **14 redesign Playwright checks pass**: six-photo preview, tabs and DR/store labels, submitted quantities, cargo links, mandatory rejection reason, approval, terminal states, responsive layouts, read-only rejected photos, notification navigation across authorized assignments, refresh persistence, and offline two-photo replacement retention/synchronization with the original idempotency key.
- **13 extraction browser checks pass**. The previously unfinished suite now completes: proper filechooser events handle retake; the timeout fixture follows the actual per-page timeout; offline submissions synchronize before the next timeline action. Partial/progressive extraction, interrupted streams, manual corrections, selection/search/quantities, offline reload, six distinct scanned images, and refusal of a seventh image are verified. Screenshots go to the task artifact directory without replacing the user's existing screenshot files.
- **12 full Admin Trip Details checks pass through Playwright MCP**: assignment isolation, metadata, realtime progress, centered responsive viewer, wheel/pinch zoom, pan/reset/Escape, field corrections, approval/rejection, missing-image recovery, and mobile panel layout. Only synthetic transport/data were used.
- Supabase MCP confirms both migrations and expected grants/functions/guards. Safe PostgREST probes also confirm the live API schema recognizes the RPCs. Live operational data fingerprints were unchanged.

No real operational POD was submitted, rejected, or approved. No critical errors remain in the tested flows. Deployment was intentionally not performed. A paid/live DeepSeek request, real phone camera hardware, and simultaneous sessions against the operational database were not exercised; provider contracts/failure recovery, camera selection/retake, and idempotent transaction replay were verified with isolated tests instead.
