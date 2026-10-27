# Trucker workflow, POD review and image management

Implemented and verified locally on 2026-10-27. Existing unrelated worktree changes were preserved. No commits, pushes or deployments were performed.

## Behavior

- Only warehouse/delivery arrival acquires blocking GPS. Arrival photos and remarks are optional. The authoritative submission RPC enforces valid GPS captured within 120 seconds of the original action time, preserving legitimate delayed offline arrival submissions. Other statuses retain assignment authorization and predecessor checks without acquiring GPS. Background sharing remains separate.
- Status buttons show upload/save/confirmation progress, disable repeated clicks, and complete only after a successful backend response. Offline submissions stay explicitly queued. IndexedDB retains prepared Files and upload identities across reload; retries retain the event request ID and already-uploaded references. Earlier rejected drafts block later ordered submissions. GPS repair is restricted to explicitly rejected arrivals.
- Confirmed departure visually activates On the Way for the corresponding assigned stop without inserting another event. Custom updates retain saved timestamps and assignment/stop relationships. The existing scoped Realtime bridge updates the horizontal timeline, including centering and completion scrolling.
- POD Review sits below the operational timeline/map workspace, with an assignment-scoped document selector/preview and editable OCR/details/review controls. Existing permission checks, versioned corrections and approval/rejection confirmations remain. Switching trucks warns before discarding unsaved review edits. Missing Storage links retain review metadata and offer retry.
- A shared body-portal/native-dialog viewer centers POD, operational evidence, report images and trip photos. It supports zoom, reset, constrained pan, previous/next where applicable, Escape, keyboard focus and mobile sizing.
- Trucker photos are prepared before queueing: oriented images, no upscaling, normally 1920px maximum, JPEG quality .84 or .90+ for documents. Small originals are retained; low-confidence OCR offers a higher-quality re-preparation. More efficient or fallback originals under the existing 5 MB limit can be retained to preserve quality. No image bytes are written into PostgreSQL rows.
- Permanent deletion retains the established atomic deletion RPC/journal and exact-object/reference validator. The existing journal now has service-only leased claims, backoff, durable failure details and logging. Concurrent workers cannot claim the same job. Shared/replaced files block cleanup. Missing files are safe on retry. Soft-delete/archive actions do not enqueue cleanup through this change.

## Supabase migrations applied

1. `backend/migrations/2026_10_27_delivery_arrival_gps_policy.sql` (applied as `delivery_arrival_gps_policy`): updates the current authoritative submission function while retaining its current report relationships, permissions, idempotency and cargo/completion rules.
2. `backend/migrations/2026_10_27_transaction_cleanup_retry.sql` (applied as `transaction_cleanup_retry`): extends `transaction_deletion_jobs` and adds `claim_transaction_image_cleanup_v1`; no second queue/table. Execute is service-role only.

Read-only live checks confirmed both migration entries, arrival policy in the live function, service-only cleanup claim grants and zero pending cleanup jobs. Live cleanup was not invoked for testing.

The cleanup worker starts after the backend listener binds and stops on shutdown. It is enabled by default in production. Development requires explicit `TRANSACTION_IMAGE_CLEANUP_ENABLED=true`; `false` disables it. Confirmed interactive deletions still attempt cleanup immediately through the same leased path.

## Files changed for this task

Frontend:

- `frontend/src/pages/Driver/DeliveryCompanion.tsx`
- `frontend/src/services/delivery.service.ts`
- `frontend/src/services/delivery-outbox.ts`
- `frontend/src/services/delivery-photo.ts` (new)
- `frontend/src/services/operational-timeline.ts`
- `frontend/src/services/receipt.service.ts`
- `frontend/src/components/delivery/delivery-workspace.css`
- `frontend/src/components/delivery/DeliveryEvidenceGallery.tsx`
- `frontend/src/components/ui/ImagePreview.tsx` (new)
- `frontend/src/components/ui/image-preview.css` (new)
- `frontend/src/components/admin/TripTrackingWorkspace.tsx`
- `frontend/src/components/admin/ReceiptReviewCard.tsx`
- `frontend/src/components/admin/ReportImageGallery.tsx`
- `frontend/src/components/admin/trip-operational-workspace.css`
- `frontend/src/pages/Admin/views/TripDetailView.tsx`

Backend:

- `backend/src/services/delivery-workspace.service.ts` (arrival GPS error mapping)
- `backend/src/services/trip-receipt.service.ts`
- `backend/src/services/transaction-deletion.service.ts`
- `backend/src/server.ts`
- The two migrations above.

Focused test additions/updates:

- `backend/tests/delivery-arrival-policy.test.ts` (new)
- `backend/tests/transaction-cleanup-lease.test.ts` (new)
- `backend/tests/transaction-cleanup-sql.test.ts` (new)
- `backend/tests/fixtures/transaction-cleanup-validation.sql` (new; current validator definition exercised in isolation)
- `backend/tests/transaction-deletion.test.ts`
- `backend/tests/whole-trip-deletion.test.ts`
- `frontend/tests/operational-timeline.test.ts`
- `frontend/tests/delivery-confirmed-workflow.browser.js` (new)
- `frontend/tests/pod-inline-review.browser.js` (new)
- This document. Local browser runners/screenshots are under ignored `.playwright-mcp/`.

These are task-specific changes; the repository also contains pre-existing edits from earlier development.

## Verification results

- Frontend and backend production builds passed. Vite reports existing large-chunk/static-versus-dynamic import warnings.
- 12 focused backend tests passed, including real submission SQL in isolated PGlite, private Realtime socket scope, existing POD review service, leased queue claims, actual cleanup validator SQL, cleanup retries and whole-trip deletion service authorization.
- 5 timeline tests passed: chronological custom statuses, assignment isolation, genuine report categories, loading-phase updates, derived On the Way and previous-stop departure activation.
- Playwright confirmed a newly planned two-stop workflow, arrival denial/retry, no blocking GPS for loading/unloading/departure/custom updates, server-held confirmation, same-ID retry after failure, partial quantities, final completion and no automatically approved/submitted POD.
- Offline POD Files survived reload, then synced as one event and one upload. A 3000x2100 photo became 1920x1344, 1,019,548 bytes. EXIF orientation was verified.
- Actual existing Tesseract OCR read a compressed 1920x1344 synthetic delivery receipt (92,205 bytes), preserving DR 12345, receiver, quantity and delivery date at 95% confidence.
- Inline POD browser verification passed assignment filtering, metadata, correction, approval/rejection confirmation, missing-file retry, Realtime image recovery and two-column/mobile layout.
- Shared viewer passed centered viewport bounds at desktop and 320/390/768px, zoom, actual pointer pan, reset and Escape.
- Timeline browser verification passed 60-status virtualization, fixed sizing, colors, inspector details, manual scroll preservation, Realtime insertion, active centering without page scrolling and completed-end positioning.
- Trucker layout checks passed 320/360/375/390/430/768/955px, short dialogs, three workflows, location warning recovery and History/Reports.
- Auth regression browser checks passed secure restoration, email-only remembering, Profile/Settings logout, remote revocation, protected route denial, locked-account screen and fresh login after unlock.
- `git diff --check` passed.

## Verification boundaries

Browser workflow writes and Storage removals were isolated fixtures/mocks. No real milestones, production trip deletions or production image removals were performed. Live GPS hardware/camera quality and arbitrary real-world receipt OCR quality cannot be established by these fixtures. Existing optional PDF intake remains subject to its existing feature flag; no new PDF capability was enabled. Gemini remains the existing optional interpretation workflow and was not exercised against the external service. Automatic cleanup requires the backend process to run; this task did not deploy the code.
