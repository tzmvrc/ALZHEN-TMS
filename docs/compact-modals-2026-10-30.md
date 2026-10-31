# Compact Active Trips and Photos & Records — October 30, 2026

## Implemented behavior

Active Trips now uses a maximum 720px desktop modal with a compact title/count/close row and full-width search. Each trip is one separated list row containing only its reference, truncated route, one thin overall progress track with a truck icon, and percentage. Truck/Driver/Helper details, dispatch, dates, stop counts, badges and nested sections were removed. The existing trip-level persisted milestone calculation, active filtering, pagination, navigation and realtime refresh remain in use. Unknown progress stays neutral. CSS transitions apply only to saved percentage changes and respect reduced-motion preferences.

The compact active-trip response no longer performs a separate crew-detail fetch or joins Driver/truck display data that the list does not show. The existing searchable database projection still supports fleet/crew search. No trip-status or delivery calculations were changed.

Photos & Records uses a maximum 850px desktop modal with content-based height, bounded by the viewport. Each image has a 56px clickable thumbnail, bold DR or filename fallback, destination/status, compact filename/type information and aligned Lucide Download action. Desktop labels underline on hover; mobile uses the accessible icon action. Short lists no longer leave a tall empty workspace; large lists scroll and paginate. Original-resolution previews, existing filename sanitization/sequencing, export progress, cancellation and errors are preserved.

## Authoritative POD eligibility

The previous gallery and export loaded all submitted receipt statuses. A shared backend selector now controls gallery listing, individual gallery downloads and ZIP image selection:

- Keep submitted operational photos.
- Group POD pages by persisted delivery event/submission identity.
- Follow explicit `delivery_metadata.replaces_receipt_id` relationships within the same trip, assignment and stop. A replaced submission is excluded even when its replacement is still pending or rejected.
- Include only current terminal submissions whose pages are all Approved; preserve all of their image pages.
- Remove duplicate record/object references and reject inconsistent cross-scope groups or replacement cycles.
- Preserve independent current approved submissions sharing a DR. DR labels alone are never used to merge distinct receipts or infer replacement relationships.
- Exclude pending/uncommitted upload drafts, including staged uploads that have not been attached to a saved delivery event.

No historical record or image is deleted or edited. Existing receipt-review and history APIs/screens remain unchanged and continue to expose rejected, pending and older attempts with authorization.

The gallery reads the same eligible manifest used by exports, returns 50 files per page, and signs only the selected page in one Storage batch. Download names still use persisted DR/destination relationships and retain actual image formats. Export All covers the eligible trip-wide image set across pages, independently of the gallery search.

Prepared ZIPs are revalidated when a download capability is issued and when it is consumed. If review/replacement changes make the prepared file set obsolete, download is blocked with a clear request to export again. Partial download failures never result in a supposedly complete ZIP. Existing bounded archive processing and authorization remain in place.

## Files changed

Frontend:

- `frontend/src/components/admin/home/ActiveTripsModal.tsx`
- `frontend/src/components/admin/home/active-trips-modal.css`
- `frontend/src/services/home-active-trips.service.ts`
- `frontend/src/components/admin/TripDocumentsWorkspace.tsx`
- `frontend/src/components/admin/trip-management-workspace.css`
- `frontend/src/pages/Admin/views/TripDetailView.tsx`
- `frontend/src/services/trip-media-export.service.ts`
- `frontend/tests/home-active-trips.browser.cjs`
- `frontend/tests/trip-management-workspaces.browser.cjs`

Backend:

- `backend/src/services/trip-gallery-eligibility.ts` (new)
- `backend/src/services/trip-media-export.service.ts`
- `backend/src/services/trip-media-names.ts`
- `backend/src/services/home-active-trips.service.ts`
- `backend/src/routes/trip.routes.ts`
- `backend/tests/trip-gallery-eligibility.test.ts` (new)
- `backend/tests/trip-media-export.test.ts`
- `backend/tests/home-active-trips.test.ts`

## Verification

- Frontend and backend production builds passed. Existing frontend chunk-size/dynamic-import warnings remain.
- Seven focused backend tests passed, covering current approved replacement eligibility, multi-page/independent same-DR submissions, mixed statuses, scope isolation, cycles, duplicates, unfinished drafts, canonical active filtering/progress, filenames and private download authorization.
- The real archive implementation produced a valid 223-image ZIP using isolated database/Auth/Storage fixtures and original-byte comparisons. Tests exclude rejected/pending/superseded objects, retain both approved replacement pages, reject stale archives at ticket issuance/consumption, and preserve bounded failure/cancellation behavior.
- Playwright and Playwright MCP verified the real frontend components with isolated transport: a 61-trip compact list, actual progress values moving the overall icon, correct internal-ID navigation, count/search/scroll preservation, a single realtime feed, and desktop/mobile containment.
- Gallery browser coverage includes approved-only rows, original image viewing, correct individual download names, ZIP progress and failure recovery, 57 images across pages, small-list content-based sizing and large-list scrolling. Dedicated POD history still opens a previously rejected original in read-only preview.
- The existing Master List editing/formatting tests remained part of the Trip Details browser regression and passed.
- A safe live read of the gallery service returned three eligible files with approved-only POD metadata and secure previews. No live operational records were changed or downloaded to validate review transitions.
- `git diff --check` passed. No migration, new dependency, commit, push or deployment was required. Unrelated worktree changes were preserved.

## Verification limits

Approval/replacement transitions and ZIP-content checks used isolated fixtures rather than changing real operational PODs. The existing process-local archive-job limits and restart behavior are unchanged. Live investigation was read-only.
