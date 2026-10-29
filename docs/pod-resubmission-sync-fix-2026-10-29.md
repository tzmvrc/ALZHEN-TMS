# POD replacement sync: live diagnosis and correction

The previous investigation missed the database cause. The actual replacement RPC returned SQLSTATE `40001` for a normal invalid/stale replacement request. That code denotes a serialization failure. The PostgREST transaction layer repeatedly retried the failing transaction, creating contention on the trip row and occupying the REST connection pool. No replacement committed. Even a normal database REST read timed out and the dummy account's login returned `503 AUTH_SERVICE_UNAVAILABLE` while the pool was occupied. Mocked transports and direct in-memory PostgreSQL tests did not reproduce this transaction-layer retry behavior.

The backend and MCP configuration both target project `hdmknewarynwpbrhfgai`. Live inspection confirmed the rejected original, its exact assignment/driver ownership, the installed function, trigger definitions, locks, and service-only execution grants before applying any change.

Supabase confirmed migration `pod_replacement_terminal_guard`, version `20261028185603`, applied successfully. Source: `backend/migrations/2026_11_13_pod_replacement_terminal_guard.sql`. It changes only the replacement function's domain-conflict SQLSTATE to `P0409` and sets a 3-second lock wait limit and 20-second statement limit. It preserves the function body, writer, original documents, audit history, permissions and relationships. No previous migration was rerun. Existing blocked retries drained without cancelling database sessions or deleting records. Active replacement RPCs and lock waits dropped to zero; a database REST read returned 200 in 519 ms. An intentionally invalid, write-impossible replacement probe through the authenticated actual backend returned 409 in 855 ms.

Code changes:

- `backend/src/services/delivery-workspace.service.ts`: map `P0409` to a safe 409 action-required response; map lock/deadline/deadlock errors to a retryable response.
- `backend/src/routes/delivery.routes.ts`: apply a request-local upstream deadline to submission, evidence and reconciliation routes, including authorization/database work. AI streaming retains its separate extraction lifecycle.
- `frontend/src/services/api.service.ts`: preserve timeout/cancellation failures while consuming a response body instead of swallowing them as invalid JSON.
- `frontend/src/services/delivery.service.ts`: bound the previously unbounded evidence upload. The existing event-submission timeout was not increased.
- `frontend/src/services/delivery-outbox.ts`: replace recursive flush chaining with one coalesced worker; attempt each queued key once per worker; release failure/cancellation progress and locks; retain typed errors and uploaded IDs. Atomically replace a definitively rejected draft with an explicitly corrected draft. Quotas exclude the replaced draft. Ordinary retries retain the original key and reconcile committed payloads.
- `frontend/src/pages/Driver/DeliveryCompanion.tsx`: restore failed saved POD photos, remarks, fields, allocation selections, quantities and serial metadata after refresh; retain the old saved draft until correction is safely queued. Reject a replacement DR mismatch before queuing. Keep required/main actions and pending-sync state aligned, and retry an existing saved request instead of creating another one.
- `frontend/src/components/delivery/DeliveryTimeline.tsx`: use the same saved-request action labels and callback as My Trip.
- `backend/tests/fixtures/pod-integration-fixture.ts` and `backend/tests/pod-workflow-integration.test.ts`: include the new migration and assert that an invalid replacement returns a terminal domain conflict rather than a serialization failure.
- This report and `docs/pod-resubmission-sync-live-2026-10-29.json` record the live evidence.

Live verification used the supplied dummy trucker account and a new explicitly labelled isolated trip, `POD-RECOVERY-TEST-90c6a056`, with one test allocation. A dedicated isolated Admin account reviewed it through the real Admin interface. Backend authentication, RPCs, Storage uploads, collaboration refresh, and database commits were not mocked or intercepted.

Verified sequence:

1. Created the test trip/stop/allocation separately from the pre-existing trip and submitted arrival/POD milestones through the real API.
2. Rejected the first test POD through the Admin rejection modal. The correct trucker received the Admin-request action and reason.
3. Queued a replacement offline through the actual upload form, then deliberately gave that isolated saved draft an invalid DR to reproduce a legacy invalid payload. The actual API returned 409, the outbox reached Needs attention, and loading released. The uploaded photo remained saved.
4. Refreshed the trucker page, opened Review saved POD, and confirmed its photo, remarks, receiver, allocation selection, and quantity were restored. Corrected its DR and submitted. The already-uploaded photo was reused.
5. The real replacement RPC committed one new event and linked it to the rejected original. The trucker outbox became empty, upload form closed, loading cleared, and the test Admin-request action resolved.
6. The already-open Admin view automatically showed the new receipt as Pending and retained the original rejection reason, review time and reviewer in two-attempt Submission History.
7. Replayed the successful request with its original idempotency key and unchanged payload through the real backend. It returned the same event ID; the database still contained exactly one replacement. Lookup plus replay took 1,337 ms.
8. Refreshed both interfaces. Admin remained Pending with two attempts; the trucker retained zero pending drafts and zero unresolved test requests. Allocation quantity remained 1 and no actual unloading records were created.

The isolated trip was archived after verification; its documents/events/audit records remain available. The isolated Admin account was deactivated and its temporary credentials removed. No records were deleted. The pre-existing rejected POD/request was inspected but not modified or replaced with synthetic photos.

Additional verification: frontend and backend builds passed; nine focused tests passed; two isolated browser suites passed 22 checks; `git diff --check` passed. Existing frontend bundle-size/dynamic-import warnings remain. The browser suites supplement, rather than replace, the live workflow verification above.

The original screenshot's local draft was not in the MCP browser, so its exact payload was not directly inspected or replayed. The live saved-draft recovery test confirms the recovery mechanism; the original device must still possess its queued files to recover that particular draft. Existing pending retries keep their original idempotency key. A corrected payload receives a new key only after the server has definitively rejected the prior payload, with the original draft replaced atomically. Live DeepSeek extraction and physical phone-camera hardware were not exercised. No commit, push or deployment was performed.
