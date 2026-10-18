# Phase 2C.7 — Integration and submission reliability

Checkpoint: October 19, 2026, local time. Supabase project `hdmknewarynwpbrhfgai`.

## 1. Verdict and evidence boundaries

Application implementation, isolated integration tests and the two narrowly scoped
database migrations below are complete. **Controlled live write acceptance remains
pending.** No disposable production trip/report scope was supplied for this phase.
Existing reports, trips, images and DR 333 were not used as destructive fixtures.

Whole-trip deletion remains enabled in the **local backend**, with its existing
Admin/password/retention controls. No hosted deployment or production runtime
activation is claimed. Tracking, planned routing and PDF intake remain disabled;
POD review remains enabled. No Mapbox Directions or Gemini calls were made.

## 2. Initial findings and fixes

| Finding | Resolution |
| --- | --- |
| Double-click protection did not cover a lost successful report POST response | Mandatory client request UUID on report HTTP submissions; durable actor/request journal and one transactional submission RPC |
| An upload retry could store the same image twice after losing its response | Independent per-file request UUID, immutable content hash, replay of the original receipt/path |
| Storage upload preceded metadata, allowing orphan bytes after failed compensation | Persist a PENDING ownership/capacity reservation before writing bytes; never erase the reservation on a network failure |
| Backload's twenty-image check could race between uploaders | Serialize capacity checks on the physical Backload row in a database trigger; PENDING slots count too |
| A report could be deleted while a reserved Storage upload was still running | PENDING receipt guard blocks report/transaction/whole-trip deletion and conversion; the whole transaction rolls back |
| Whole-trip impact preview did not know about the new pending-upload blocker | Backend adds an authorized pending-image retention check and fails closed if it cannot read it |
| Interrupted forms lost their in-memory upload retry state on navigation | Own pending receipts expose their opaque request ID through the authorized list API; report details can resume with the original file |
| Trip status could become terminal between backend validation and the new RPC | Follow-up scope guard checks the locked trip's terminal state for Truckers, matching existing application rules |
| Live service role lacks general receipt UPDATE | Added only column UPDATE for `upload_status` and `received_at`; path, owner and scope remain uneditable through that grant |

No unrelated refactoring was performed. Existing pending work and staged files
from Phase 2C.6 were preserved.

## 3. Database changes installed

The backend URL identifies the expected project. The MCP database was independently
matched to that configured REST endpoint using a SHA-256 fingerprint of ordered
trip identities, without printing trip IDs or credentials. Catalog inspection
confirmed dependencies, current grants, triggers and unapplied object names.
Both migrations passed fresh disposable PostgreSQL 18 tests before installation.
Backup verification remains waived under the owner's prior authorization; no data
backup or production export was created or claimed.

| File under `backend/migrations/` | SHA-256 | Installed version |
| --- | --- | --- |
| `2026_11_11_operations_submission_reliability.sql` | `D51501003DCDE09227B4E441B9F87ECA5F48F6A2C9AD22F772076781179C91EB` | `20261018160856`, `operations_submission_reliability` |
| `2026_11_12_operations_submission_terminal_guard.sql` | `DD54CB8B726D676657A90DB3BC34CD79B46B62994E18A3A183D5AC1BFD5B2E35` | `20261018161115`, `operations_submission_terminal_guard` |

Installed exactly once; earlier migrations were not reapplied.

Migration 11 adds:

- Private, RLS-enabled `operations_submission_requests`, keyed by actor/request UUID.
  The journal retains the original request and outcome for retry/conflict detection;
  it is not a public report or additional Realtime source. No automatic journal
  expiry is used, because expired keys could otherwise recreate deleted reports.
- Service-only invoker-rights RPCs `submit_operations_report_v1`,
  `reserve_operations_receipt_v1`, `complete_operations_receipt_v1` and their shared
  scope helper. All use fixed `pg_catalog, public` search paths and postgres ownership.
- `report_receipts.upload_request_id`, `upload_sha256`, `upload_status`, an
  actor/request unique index, and Backload capacity/pending-upload guards.
- Only column-scoped service UPDATE on upload status and received time. Service
  role still has no general receipt UPDATE or storage-path UPDATE; browser roles
  cannot execute the new RPCs or read/write the private journal.

Migration 12 replaces only the newly introduced scope helper. Its owner, ACL,
invoker behavior and search path remain unchanged. Seven terminal statuses and
assignment revocation are checked before committing a Trucker submission.

Existing historical receipts use the READY default. No creator backfill, report
backfill, operational cleanup, new Storage policy, browser grant, or Realtime
publication change occurred. The existing Operations view retains 28 columns.
All six new function definitions read back from Supabase match the disposable
installation, using MD5 of `pg_get_functiondef` with CR characters removed.

## 4. Offload/Backload and original reporter

Admin and Trucker forms still use the same submission service. The backend resolves
and independently validates exact trip/stop UUIDs and current assignment. Offload
continues to require an eligible DR transaction. Required reasons retain line
breaks. Existing previews, image removal, per-image progress and mobile form layout
remain intact. Submission type is not changed after creation.

Original `created_by` / `submitted_by` come from authenticated backend identity;
the new RPC also forces those fields to that actor. Update validators continue to
reject creator fields. The installed reporting views use original creator identity,
not the editable delegate or last editor. Existing profile name resolution and
unknown historical creator fallback are retained. Disposable creator fixtures
verify Admin/Staff/Trucker names, delegate separation, global search/sort and the
private 28-column view contract across more than one page.

The HTTP report endpoints now require `request_id`. Receipt POST requires
`X-Upload-Request-Id`. Old clients fail validation rather than taking an unsafe
fallback; frontend and backend must be updated together. Internal service calls
without a key represent new actions, not retried HTTP submissions.

Repeated requests with the same actor, key and original content acknowledge the
same report. Reusing a key with different content conflicts. Distinct keys permit
legitimate separate reports on the same trip. Deleted reports are never recreated
by replaying their old request. Parent/report creation, Offload item creation and
the retry journal commit atomically.

After an unconfirmed response the form freezes its original values and offers
**Retry same submission**. Cancel warns that the report may already exist. A new
form is a new request: after deliberately discarding uncertain form state, inspect
the report list rather than re-entering the same report blindly. No report payload
or image bytes were added to persistent browser storage.

## 5. Image recovery and Storage

The private `report-receipts` bucket remains JPEG/PNG/WebP, 5 MiB. Server-side size,
MIME/signature, assignment and physical report scope checks precede reservation.
Offload remains limited to five images; Backload to twenty, including pending slots.

Reservation records the original filename, size, MIME, SHA-256 and owned private
path before Storage receives bytes. The path keeps the existing
`operations/{trip}/{kind}/{report}/{uuid}.{extension}` cleanup contract. Uploads
never overwrite existing bytes. When an upload response is lost, the backend
downloads the existing object and checks its hash before confirming it. A READY
replay needs no Storage upload or download. Completion checks that the private
object exists and preserves the first received timestamp.

Pending images have no signed preview URL and display an incomplete-upload state.
Only their original uploader receives a recovery request key from the authorized
receipt list. The existing report-details UI lets that uploader reselect the
original file. A different filename or different bytes cannot replace the pending
image. Other viewers see its state, not someone else's recovery control. Signed
links for completed images retain existing temporary authorized access.

**Intentional retention boundary:** there is no automatic expiration/deletion of
PENDING reservations. They may describe an in-flight or already stored image.
Deleting or converting the report is blocked until recovery completes. If the
original file is lost, or its uploader loses assignment/access before recovery,
an operator must review ownership/bytes and a recovery scope; this checkpoint does
not invent ownership, silently abandon the image, or bypass the retention guard.
Existing unowned Storage objects were not swept or deleted.

## 6. Deletion, passwords and authorization

- Offload/Backload deletion remains record-only, through the installed atomic
  deletion/journal RPCs. Parents, sibling stops, assignments, PODs, unrelated images
  and protected financial/history records are preserved.
- Current-user password verification, separate non-persisting Supabase Auth client,
  original-session revalidation, identity binding and five-attempt/fifteen-minute
  limiter remain in place. No password logging, storage or session replacement was
  introduced.
- Optional-report deletion retains ADMIN/STAFF policy; TRUCKER is denied.
  Combined/Tracker whole-trip deletion remains ADMIN-only, maximum twenty unique
  parent trips, atomic for the complete batch. STAFF/TRUCKER passwords do not grant
  whole-trip permission.
- Legacy transaction/last-stop deletion still requires the current user's password;
  the previous bypass remains closed. Its existing reviewed role policy is unchanged.
- Pending image guards roll back report deletion, journals and parent/stop changes
  together. Completed image paths pass the existing ownership checks and enter
  durable cleanup. Cleanup failure remains retryable without selecting another
  report's Storage paths.

The locally enabled whole-trip feature was preserved and the known local backend
was restarted to load the changes. Health returns 200; startup reports the enabled
whole-trip flag, one worker and no shared limiter configured. Multi-worker Redis
coordination remains isolated-test coverage, not a real hosted infrastructure claim.

## 7. Realtime, caching and multi-stop isolation

Existing Offload, Backload and receipt change-signal triggers and the existing
Socket.IO bridge are reused. No subscriptions or publication tables were added.
Database events commit with their transaction; failed submissions/deletions do not
broadcast a successful persistence event. New report and image changes invalidate
Operations caches without clearing unrelated report caches or shared layouts.

The two-context mocked transport fixture verifies coalesced source reads, active
draft/selection protection, deferred remote resize, one active channel after
reconnect and logout isolation. Real local Socket.IO transport tests use fixture
identities and cover authorization, room boundaries, deduplication and cleanup.
They are not live two-account Supabase acceptance.

Exact trip_stop_id associations survive creation, editing, image recovery and
record deletion. Existing stop order and shared assignment behavior are unchanged.
The pagination fixture uses 102 rows, thirteen page requests, zero requests on
cached return, global search/filter/sort, last-page recovery and draft-safe refresh.

## 8. Verification results

| Check | Final result |
| --- | --- |
| Full backend automated tests | **202/202 pass**, 0 failures/skips |
| Full frontend automated tests, including TSX files | **88/88 pass**, 0 failures/skips |
| Backend TypeScript and production build/worker copy | Pass |
| Frontend TypeScript and production build | Pass |
| Changed frontend TypeScript-file ESLint | Pass |
| Git diff whitespace and unresolved-index checks | Pass |

Backend has no configured ESLint command. Existing Vite large-chunk warnings remain;
no unrelated lint cleanup or architectural rewrite was performed.

Eleven isolated browser fixtures pass:

1. `offload-dr-form` — actual shared form, Admin/Trucker contexts, exact stop,
   quantity/CBM, role-sensitive fields and dropdown stacking.
2. `admin-report-trip` — shared form under an Admin fixture identity, both types,
   multiple images, required reason, exact second stop and double-click prevention.
3. `trucker-report-trip` — actual mobile DriverPortal, both types, image preview
   removal and submission; StrictMode initial request deduplication.
4. `operations-submission-retry` — lost report and image responses, unchanged keys,
   two unique reports/four unique images despite three/five transport attempts.
5. `operations-upload-recovery` — own persisted pending key, wrong-filename rejection,
   no recovery control for another uploader, READY after recovery, no empty image src.
6. `operations-pagination` — 102 rows, server query parameters, caching, empty results,
   page selection, last-page recovery and preserved active draft.
7. `operations-table` — toolbar, editing, physical IDs, deletion cancellation,
   retained dependencies, pending cleanup and shared width persistence.
8. `whole-trip-password` — masked/current password, failed/cancel/account-change
   clearing, double-submit prevention and dialog focus behavior.
9. `tracker-trip-deletion` — deduplicated physical parents, page-scoped selections,
   role restrictions, blocked confirmation and simulated final-page recovery.
10. `transaction-deletion` — exact stop, protected failure, cancellation, sibling
    preservation and cleanup retry.
11. `admin-realtime` — two mocked contexts, draft/selection/layout protection,
    reconnect and logout; source burst reads `[1,1]`, one active recovered channel.

All browser mutations are intercepted. None created production reports, uploaded
production images or invoked live destructive endpoints/RPCs.

Disposable PostgreSQL verification includes:

- Creator attribution/global search/sort and Operations pagination (>100 reports).
- Existing Offload and Backload atomic deletion, retained documents/history,
  protected FKs, unrelated parents/stops, audit journals and retry behavior.
- Existing whole-trip review/retention suite and exact 20/21 parent boundary.
- New request replay/conflict, actor spoof rejection, assigned-trip isolation,
  nullable scope, invalid reason, pending ownership, image hash mismatch,
  object-existence requirement and column-scoped service completion privileges.
- Real concurrent PostgreSQL clients: twenty-two Backload reservations produce
  exactly twenty successes/two capacity rejections; repeated keys reuse one row.
  Two simultaneous identical submissions return one report; distinct keys remain
  distinct reports. Offload and Backload deletion races each create one journal.
- Pending uploads block whole-trip and last-stop operations with complete rollback.
- Seven terminal trip states and revoked assignments deny Trucker submissions;
  an active authorized assignment succeeds.
- Two concurrent whole-trip requests for one two-stop parent acknowledge the same
  operation, retain two stop journals and preserve unrelated parents.
- Schema recovery succeeds only with empty new workflow evidence and preserves
  fixture trips; recovery correctly refuses nonempty retry/upload journals.

The disposable schema models the documented relationships; it is not a complete
production dump. No destructive/concurrency test ran on Supabase.

Initial runner/setup failures were corrected and rerun: bare Node lacked bundler
resolution; TSX needs `TSX_TSCONFIG_PATH=tsconfig.app.json` and inclusion of `.tsx`
tests. The new recovery browser fixture initially used the wrong container ID and
did not release its skeleton state. These were test harness mistakes, not weakened
product assertions. The first whole-trip fixture setup also needed its existing
journal migration before the catalog RPC; the corrected full chain passed.

## 9. Final live read-only preservation checks

| Entity | Before / after installation |
| --- | --- |
| Trips / stops / line items | 7 / 8 / 9, unchanged |
| Offloads / Backloads / report receipts | 0 / 0 / 0, unchanged |
| PODs / trip images | 1 / 9, unchanged |
| Billings / payables / receivables | 0 / 0 / 0, unchanged |
| Storage object rows across existing buckets | 42, unchanged |
| Whole-trip audit markers | 0, unchanged |
| New submission request rows | 0 |

Existing policy/publication fingerprints and the four installed destructive RPC
definition fingerprints are unchanged. New function definitions match the local
installation; owner/grants/search paths and bucket privacy/limits were read back.

A final **read-only** authenticated capability check found that the previously
available Admin session had ended under the existing midnight Manila expiry rule.
No password was requested or submitted, no sign-in policy was changed and no live
write acceptance is claimed. Phase 2C.6's earlier authentication-only result is
historical evidence, not a fresh submission/cleanup/two-user test in this phase.

## 10. Recovery and remaining acceptance

`backend/migrations/recovery/phase_2c7_submission_reliability_rollback.sql` is a
tested **unexecuted live recovery proposal**, SHA-256
`F550BC07E59C1215EA6F55F0A60A652566A8D202B63A445578D09A7D72D606FC`.
Stop submission/upload consumers before schema recovery. The script refuses to
drop nonempty retry/reservation evidence. With new workflow data, retain the
additive schema and reconcile it rather than dropping tables/columns. It is not a
Storage/data backup and cannot restore already deleted bytes. To reverse only the
terminal guard, restore that function from migration 11 after review; owner/ACL
remain unchanged. No live rollback was executed.

Remaining controlled acceptance needs fresh dedicated Admin/Trucker sessions and
an explicitly designated disposable trip/stop/image scope. Verify an authorized
submission, cross-session appearance, original creator after another Admin edits,
interrupted upload recovery and any explicitly approved record-only cleanup.
Existing production reports/trips must not be used as destructive fixtures.
Real multi-worker Redis and hosted runtime acceptance remain deferred with hosting.

No further Supabase migration, bucket change or publication change is currently
required. No feature activation beyond the already enabled local deletion feature
occurred. Gemini remains billing-blocked and was not retried.

## 11. Files changed in this checkpoint

- Backend: `controllers/operations-report.controller.ts`,
  `services/operations-report.service.ts`, new `services/operations-submission.service.ts`,
  `services/whole-trip-deletion.service.ts`.
- SQL: migrations 11 and 12 above; the recovery proposal above.
- Backend tests: `offload-details.test.ts`, `operations-report.logic.test.ts`,
  `whole-trip-deletion.test.ts`, new `operations-reliability.test.ts`;
  new `operations-reliability-{schema,check,deletion-check}.sql`,
  `operations-reliability-concurrency.cjs`, `operations-terminal-guard-check.sql`,
  `whole-trip-pending-upload-check.sql`, `whole-trip-concurrency-2c7.cjs` fixtures.
- Frontend: `OperationsEventSubmissionForm.tsx`, `OperationsReportsView.tsx`,
  `ReportImageGallery.tsx`, `services/api.service.ts`, `services/operations-report.service.ts`.
- Browser tests: new `admin-report-trip`, `operations-submission-retry` and
  `operations-upload-recovery` fixtures. Existing fixtures were reused.
- Documentation: this report and the appended main progress checkpoint.

Safety: no existing production trip or unrelated operational data was deleted;
no production report/image test insert, production Storage upload/deletion,
GPS/provider activation, paid API request, deployment, commit or push occurred.
Only the two authorized, verified additive migrations changed the live schema.
