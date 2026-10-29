    # POD review and replacement changes

    Implemented with the UI/UX Pro Max skill, retaining the existing navy theme and components.

    Confirmed causes:

    - The outbox stopped at the first `NEEDS_ATTENTION` draft. An older server-rejected draft prevented subsequent replacement submissions from reaching the API.
    - The trucker page also disabled every replacement action whenever any draft existed for that assignment. A rejected unrelated draft could therefore prevent opening the replacement form.
    - Retrying an immutable saved submission ran through the current form's product and milestone validation. Those values can change after an ambiguous response. Saved retries now use the saved payload directly.
    - Admin's editor changed a model-name string while the submitted-product display read allocation metadata. The editor could not correct that metadata or its quantities. Products from other DRs selected through the truck-wide trucker list were silently filtered out, leaving a generic matching message. Admin now edits the allocation metadata and explicitly flags mismatched identities. Cargo context also follows the selected receipt's assignment when no assignment prop is supplied.
    - Admin review listened for document/review changes but omitted the backend's `trip_events` collaboration commit when a replacement was submitted. It now listens for that commit too.

    The exact transport cause of the screenshot's original timeout was not reproduced. The newly authenticated browser had no retained outbox draft. Read-only Supabase checks confirmed the replacement RPC is installed, with one rejection request and no persisted replacements at investigation time. No live POD was submitted, approved, or rejected for verification. The database itself did not demonstrate a missing replacement function. The client timeout was not increased.

    Replacement retries now query an authenticated, owner-and-assignment-scoped submission lookup after an ambiguous response and before replaying a failed saved request. A matching committed payload is acknowledged without another POST. Unconfirmed payloads retain their original idempotency key and photos. In-progress submissions still prevent another submission of the same replacement request. A failed assignment does not block another assignment's queue. A flush arriving during another flush runs after it, so newly queued records are processed promptly.

    The decision dialogs use semantic icons, receipt/store context, loading spinners, native dialog focus handling, and soft blurred backdrops. A synchronous guard prevents duplicate decisions. Reject requires a nonblank reason, remains editable after failure, and stays open until success or explicit cancellation.

    Admin product selection is searchable with checkboxes, Select All, Done, and editable quantities. Allocation/line-item/assignment/stop/DR/product identities are retained. Quantities come from submitted receipt metadata; newly added products require an explicit received quantity (starting at zero), never the assigned quantity. Cross-scope selections are flagged and require explicit exclusion. Reviewed documents are read-only. Cargo allocations, unloading records, and billing values are not edited.

    Tabs have a consistent 224px by 100px size, semantic green/blue/red backgrounds, receipt artwork, truncated store labels, keyboard navigation, and a stronger active border. Only explicit replacement links combine attempts into a history; independent same-DR submissions remain separate. The latest linked attempt is the active review. Older images, products, receipt details, submitters, reasons, and available reviewer/date information remain inspectable without changing the active review.

    No database schema changes or migrations were needed or executed. Existing approval/replacement RPCs, audit records, notification creation, and Storage permissions are reused.

    Files changed in this task:

    - `backend/src/routes/delivery.routes.ts`
    - `backend/src/services/delivery-workspace.service.ts`
    - `backend/src/services/trip-receipt.service.ts`
    - `frontend/src/components/admin/PodDecisionControls.tsx`
    - `frontend/src/components/admin/ReceiptReviewCard.tsx`
    - `frontend/src/components/admin/pod-review.css`
    - `frontend/src/components/delivery/DeliveryTimeline.tsx`
    - `frontend/src/components/ui/image-preview.css`
    - `frontend/src/pages/Driver/DeliveryCompanion.tsx`
    - `frontend/src/services/delivery-outbox.ts`
    - `frontend/src/services/delivery.service.ts`
    - `frontend/src/services/receipt.service.ts`
    - `frontend/src/services/pod-submissions.ts`
    - `frontend/src/services/pod-admin-products.ts` (new)
    - `backend/tests/pod-service-integration.test.ts`
    - `frontend/tests/pod-submission-review.browser.cjs`
    - `frontend/tests/pod-admin-products.test.ts` (new)
    - `frontend/tests/pod-review-resubmission.browser.cjs` (new)
    - `frontend/tests/artifacts/pod-approval-modal.png` (new)
    - `frontend/tests/artifacts/pod-review-redesign-mobile.png` (new)
    - This report.

    Verification:

    - Frontend production build passed; existing chunk-size/dynamic-import warnings remain.
    - Backend production build passed.
    - Nine focused tests passed: allocation matching, cross-scope rejection, legacy ambiguity, replacement chains, status isolation, stable cargo ordering, and two isolated PostgreSQL service/workflow integrations.
    - `pod-submission-review.browser.cjs`: 15 checks passed, including six-image previews, rejection notifications, multi-assignment isolation, mandatory rejection reason, an unrelated blocked draft, offline two-image replacement persistence across reload, and synchronization with the original request key.
    - `pod-review-resubmission.browser.cjs`: seven checks passed, including allocation-based quantity corrections, failed decision recovery, duplicate clicks, latest Pending/history refresh, approval, soft image backdrop, responsive layouts at 320/390/768px, and a committed response timeout acknowledged without a duplicate POST.
    - Playwright MCP inspected the authenticated local trucker session and its empty outbox. Workflow browser suites intercepted all API traffic and used isolated browser contexts. PostgreSQL integrations used an in-memory PGlite fixture. Operational POD records were not used for writes.
    - `git diff --check` passed.

    Limitations: the exact original network stall remains unconfirmed; no operational retry was performed. Live DeepSeek extraction and production email/push delivery were not exercised. Extraction code was unchanged. No commit, push, or deployment was performed, and unrelated worktree changes were preserved.
