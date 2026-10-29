# POD status synchronization and Admin Trip Details redesign

## Root cause

The database correctly stored the individual receipt as `APPROVED`. The Admin operational timeline instead mapped its upload milestone from the stop-wide `pod_approved` completion flag. That flag was correctly false when other required DRs at the stop were still outstanding. A partial stop approval was therefore displayed as “Uploaded - approval pending” even for its approved document.

Read-only Supabase MCP inspection confirmed one approved receipt at a stop whose aggregate `pod_approved` was false. Its event, assignment, and stop associations matched. Both existing POD migrations were already applied and were **not rerun**. No new migration or operational data correction was necessary.

Two additional synchronization gaps were fixed:

- The management trip-event API returned attachment identity without the document review fields. The ordinary trucker event API explicitly stripped review status unless management requested full evidence.
- The operational timeline omitted additional POD submissions, and its event-refresh effect did not react to `pod_review_events`. Cached event details were keyed by milestone version even though receipt decisions do not increment that version.

## Resulting behavior

Each POD event now receives review metadata from its linked receipt pages. Approved, Rejected, and Pending are derived per submission; the stop-wide flag remains reserved for delivery-completion restrictions. Additional submissions and replacements remain visible as independent timeline entries. Pending and rejected submissions use distinct milestone colors; approval turns only the corresponding milestone green.

The confirmed admin review response updates receipt records shared with the operational timeline and cargo table immediately. Receipt review versions prevent an older event response from replacing a newer decision. Realtime review/image notifications reconcile authoritative data, and the trucker workspace also refreshes on its recipient-specific notification signal. Opening event details refreshes receipt review data even when the milestone version is unchanged. Page refresh reads stored decisions again.

The trucker event API includes safe review status/version metadata without exposing Storage paths, OCR contents, or signed private-file links in ordinary timeline reads. Existing assignment authorization and document access remain in place.

## UI changes

- POD selectors are compact horizontal sheets directly inside the OCR verification header. Only the selected sheet expands, with a light navy background and navy border. Long labels remain readable; many sheets scroll horizontally. Keyboard arrow/Home/End navigation, focus indicators, and reduced-motion handling are retained.
- Each sheet identifies its DR/store and its own review status. Selecting a sheet updates photos, submitted products, editable fields, and decision controls without reloading Trip Details.
- Removed the redundant header save button and large submission-selector section. A **Save receipt details** action appears below editable fields only when changes exist. Corrections preserve quantity/serial metadata and optimistic version checks. Confirm Receipt and Reject POD remain available under their existing restrictions.
- Removed Last decision, On save, verification timestamps, raw OCR expansion, Scan again, and Interpret with Gemini from this interface. Stored OCR, backend extraction/interpretation services, approval history, and audit APIs remain intact.
- Removed the standalone raw-POD/status/Open POD review block from the milestone inspector. Main POD Review, images, and cargo links remain available.
- Cargo rows are partitioned stably: matching POD Approved rows first, all others afterward. Every approved row cell receives a subtle green background, with dark-green status text. Pending and rejected links open the matching submission. Assigned/unloaded/remaining/CBM values and physical cargo statuses are not rewritten.

## Files changed in this task

Backend:

- `backend/src/services/trip.service.ts`
- `backend/src/services/delivery-workspace.service.ts`

Frontend:

- `frontend/src/components/admin/ReceiptReviewCard.tsx`
- `frontend/src/components/admin/PodDecisionControls.tsx`
- `frontend/src/components/admin/TripTrackingWorkspace.tsx`
- `frontend/src/components/admin/TripOperationalInspector.tsx`
- `frontend/src/components/admin/pod-review.css`
- `frontend/src/components/delivery/DeliveryCargoSummary.tsx`
- `frontend/src/components/delivery/DeliveryTimeline.tsx`
- `frontend/src/components/delivery/delivery-workspace.css`
- `frontend/src/pages/Driver/DeliveryCompanion.tsx`
- `frontend/src/services/pod-review-state.ts`
- `frontend/src/services/pod-submissions.ts`
- `frontend/src/services/operational-timeline.ts`
- `frontend/src/services/receipt.service.ts`
- `frontend/src/services/delivery.service.ts`
- `frontend/src/services/trip.service.ts`

Verification/report:

- `backend/tests/pod-event-status.test.ts`
- `frontend/tests/pod-status-synchronization.test.ts`
- `frontend/tests/pod-status-redesign.browser.cjs`
- `frontend/tests/pod-inline-review.browser.js`
- `frontend/tests/operational-progress.test.ts` (corrected stale fixtures to include the already-existing required POD upload milestone and current progress denominator)
- This report.

Other pre-existing worktree edits and untracked files were preserved. No commit, push, deployment, or live operational POD decision was performed.

## Verification

- Frontend and backend production builds pass. Vite retains its existing dynamic-import/large-chunk warnings.
- **49 targeted unit/integration tests pass**, including the new status-isolation, stale-response, cargo-ordering, and safe-trucker-metadata regressions, plus existing extraction, six-image, notification, replacement, assignment-permission, audit/idempotency, and offline-related checks.
- **11 new full-workspace Playwright checks pass**: in-header expandable sheets, legacy controls removed, correction saving, immediate document approval despite a false stop aggregate and stale event response, stable cargo ordering/full-row green/dark-green status, unchanged quantities, inspector cleanup, separate rejection/replacement states, refresh persistence, desktop/mobile layouts, and an external approval updating an already-open trucker timeline without changing its milestone version.
- **14 existing redesign/replacement Playwright checks pass**, including offline replacement retention across reload and idempotent synchronization.
- **13 extraction Playwright checks pass**, including partial/progressive/manual recovery, retake, six distinct photos, refusal of a seventh, model quantities, and offline synchronization.
- **12 Admin workspace checks pass through Playwright MCP**, including private assignment isolation, correction/approval/rejection, realtime recovery, responsive previews, wheel/pinch zoom, pan/reset, and keyboard dismissal.
- Read-only Supabase MCP checks verified the status diagnosis and existing migration versions. No real POD was approved or rejected during verification.

Artifacts are under `.playwright-mcp/pod-status-redesign/`, including admin-review/cargo screenshots and the targeted test output. Browser data and writes were isolated fixtures.

The five referenced screenshots were not available as attachments in this conversation; implementation follows the written requirements and existing ALZHEN styling. Live provider availability and physical mobile-camera hardware were not exercised. No known critical failure remains in the tested flows.
