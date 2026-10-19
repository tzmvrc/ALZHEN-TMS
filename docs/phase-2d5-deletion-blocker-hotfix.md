# Phase 2D.5 deletion blocker — diagnosis and pending SQL fix

## Exact selected trip and read-only findings

Project: `hdmknewarynwpbrhfgai`. User-supplied trip:
`ed329614-62d0-4d83-afbc-8c578fdb23d1` (dispatch `wer`). Selected stop:
`cb9bf6f1-f6ef-439e-b7da-0046375f308d`.

The controlled browser initially had no application tab/request history. Existing
backend route catches do not log deletion request IDs or RPC errors. No password
or deletion retry was requested. The user supplied the physical Trip Details URL.

Installed Phase 2D.3 RPC/helper body fingerprints and ACLs matched the approved
migration. The STABLE read-only preview RPC was inspected before a SELECT call,
using an existing Admin profile to satisfy its explicit role check. This was a
database-side read-only diagnostic, not acceptance of an application password or
session. It returned **zero blockers** for this exact trip:

- One stop, one line item, one assignment, ten driver updates and five events.
- Three receipt images and three corresponding legacy driver attachment references,
  all independently `VERIFIED` by the installed ownership helper.
- One Loading Report and one Unloading Report; zero POD records.
- Zero billing/payable/receivable rows, protected conversions, retained documents,
  Drive files, pending uploads, missing receipt objects or unregistered objects.

The three verified driver update IDs are
`14b387d2-d855-4f28-9a50-0c3de851d47f`,
`414fabdc-5ce7-4b4d-ab4d-0600e006f190`, and
`325eb191-0b6c-47a2-afd0-13b03b64476c`.
No Storage paths, signed links or credentials are needed in the UI/report.

## Root cause: final-stop deletion order versus reference guard

The reproducible failure is in the **actual relational deletion RPC**, not the
current read-only preview or a financial/ownership classification:

1. `delete_whole_trips_v1` validates ownership and calls the shared transaction RPC.
2. `delete_transaction_with_cleanup_v1` inserts its audit/Storage cleanup manifest.
3. It deletes POD/stop rows before the parent-trip cascade deletes `trip_images`.
4. The live `trip_images.trip_stop_id` FK uses `ON DELETE SET NULL`. Removing the
   final stop therefore updates the still-existing receipt image relations.
5. The BEFORE INSERT/UPDATE `deleted_trip_attachment_reference_guard` sees those
   same object paths in the newly inserted journal, even within this transaction,
   and raises SQLSTATE **55000**:
   `Attachment belongs to a committed deletion journal and cannot be reused.`
6. The entire operation rolls back. The backend maps 55000 to HTTP 409 and returns
   the message. The old compact frontend mapper sees `attachment` and replaces it
   with the misleading generic protected-record message.

The analogous POD FK SET NULL can cause the same problem for a final-stop POD.
Earlier fixtures had FK coverage but normally placed the image/POD on the first
of two stops: its SET NULL updates happened before that image entered the final
stop's manifest. A no-POD single-stop case also passed. The previously missing
combination was **one final stop with receipt/POD relations still attached**.

The exact production HTTP response was not retained, so historical request origin
is inferred from the current row/constraint topology and deterministic isolated
reproduction. The installed bug and its exact error were reproduced without
running any destructive production RPC.

## Proposed SQL — NOT installed

`backend/migrations/2026_11_14_proposed_trip_image_delete_order.sql`

SHA-256:
`163E2A3FB5A74DA72BF4470E533914D9967B06A3CED562FCE79DC7599195EE6C`

Only replace `delete_transaction_with_cleanup_v1`. After ownership checks, locked
snapshots and immutable manifest creation, explicitly remove the final parent's
`trip_images` relations **before** deleting their linked POD/stop rows. This is
the same eligible relation scope the eventual parent cascade already removes.
Earlier-stop behavior remains unchanged. No physical files are removed by this
RPC; the existing post-commit validator and retry journal continue to control that.
No triggers, guards, authorization, password flow, financial checks, shared-object
checks or policies are bypassed or removed.

The proposal checks installed source fingerprints and five enabled guards,
preserves function ownership/ACLs with CREATE OR REPLACE, asserts browser denial
and service-role execution, and runs transactionally. Installation performs no
operational DML. Rollback instructions are comments in the proposal: suspend
deletion, restore only the captured previous transaction RPC after separate
approval, and retain all journals and Storage objects. Do not replay the old full
migration or resurrect data whose bytes have already been removed.

## Local UI correction

The modal stays compact. A new UI feedback helper distinguishes financial
retention, ownership review, incomplete uploads, data-consistency failures,
permission/session/rate failures and general errors. The actual journal error is
now a data-consistency message instead of a claim that this trip has protected
records. Internal preview data and attachment lists remain hidden. The helper
only chooses text; it cannot authorize deletion. No backend production source
change or database change was made.

## Verification

- Disposable runner first reproduces the installed error and proves rollback.
- Installing the proposal only in the local disposable database preserves content
  hashes for **12 modeled tables**.
- **36/36** SQL cases pass after the proposal. New cases cover the single-stop
  verified POD, direct last-stop path, and forced failure after image removal to
  prove images and journals roll back. Existing cases include no-POD duplicates,
  transmittal/POD relations, operational reports, multi-stop/bulk behavior,
  financial/shared/ambiguous/pending protection, authentication boundaries,
  concurrent mutations, manifests and cleanup identity checks.
- Backend **212/212**, frontend **109/109** passed. Backend mocks cover password
  verification, session checks and failed Storage cleanup/retry.
- **6/6** isolated browser fixtures passed: whole-trip-password,
  whole-trip-delete, trips-bulk-deletion, transaction-deletion, report-wizard and
  tracker-trip-deletion. All writes were intercepted; no live destructive endpoint
  was invoked.
- Both production builds/TypeScript, changed frontend ESLint and diff check pass.
  Existing Vite large-chunk warning remains.

Changed files: compact dialog, new
`frontend/src/services/whole-trip-deletion-feedback.ts`, its new unit test,
`frontend/tests/trips-bulk-deletion.browser.js`, expanded disposable SQL cases,
new `backend/tests/fixtures/verify-trip-image-delete-order.cjs`, SQL proposal,
this report and the progress checkpoint. Other worktree changes were preserved.

## Pre-installation checkpoint (superseded by final installation below)

**Not resolved live until the exact proposal is approved and installed.** Local
feedback and disposable fix are complete. Final read-only check still shows the
selected parent, its one stop and all three images, with **zero deletion journals**.
No production deletion, operational modification, file cleanup, migration, policy
change, feature activation, paid provider call, deployment, commit or push occurred.
The next action requires approval for the exact proposal/checksum above. Do not
retry a production deletion as an automated acceptance test.

## Final installation and runtime verification — October 19, 2026

**APPLIED: `20261019074116` — `trip_image_delete_order`. Ready for
Admin-initiated acceptance testing.**

The owner explicitly approved the exact proposal and existing-trip deletion
functionality through the application. Installation used Supabase MCP and applied
only `backend/migrations/2026_11_14_proposed_trip_image_delete_order.sql`.
Disk SHA-256, verified before and after installation:
`163E2A3FB5A74DA72BF4470E533914D9967B06A3CED562FCE79DC7599195EE6C`.
Backend configuration and connected MCP both target `hdmknewarynwpbrhfgai`.
Migration history showed it absent before installation and records it once now.

All three prerequisite body fingerprints matched and all five reference guards
were enabled. The installed transaction RPC's normalized body MD5 is
`8108cf38fc757d7cda616ddafb41a86c`, exactly matching the approved file. The other
five related RPC/helper body fingerprints remained unchanged. Owner `postgres`,
SECURITY DEFINER, fixed search path and service-only execution were preserved.
The trigger, RLS, table/view ACL, policy and publication aggregate fingerprint was
identical before/after: `b6523d3098a3f032aa23ebba1788bc3b`.

Row counts AND content hashes matched across **29** checked operational/journal/
Storage relations immediately after installation and again after local tests and
runtime checks. Current baseline includes 9 trips, 10 stops, 11 line items,
15 images, 48 driver updates, 1 POD, 48 Storage objects and zero deletion journals.
These are the current baseline, not the earlier checkpoint's image/update counts.
Bucket metadata/configuration was also hash-checked unchanged. No production
delete RPC, operational write or Storage cleanup was executed during verification.

### Final fresh regressions

- Backend **212/212**, frontend **109/109**, zero failures/skips.
- Disposable SQL **38/38**. Two added cases cover both one- and two-stop trips
  with **three verified receipt attachments**, all exact object identities retained
  in their cleanup manifests. The runner first reproduces the original installed
  error before applying the hotfix inside the disposable database, and confirms
  installation preserves hashes for 12 modeled tables. All prior financial,
  ownership, shared-object, pending-upload, rollback, role, concurrency and 20/21
  batch-boundary checks still pass.
- Isolated browser fixtures **7/7**: the previous six plus
  `trip-deletion-realtime`, using two real Socket.IO sessions against the isolated
  fixture server. Deleted sibling rows disappear while unrelated active drafts
  remain intact. All successful deletion/file-removal tests are disposable or
  intercepted mocks.
- Both production builds and TypeScript passed. Targeted frontend ESLint for the
  compact dialog, Trips/Combined component, feedback helper and their unit tests
  passed; diff check passed. Existing Vite chunk-size warning remains.

### Application integration and local runtime

The frontend continues to use `/trips/whole-delete/impact` and
`/trips/whole-delete`, with the current Admin password in the request body only.
The backend uses the unchanged shared whole-trip service and installed atomic RPC.
Admin-only role checks, immutable/deduplicated batches, 20-trip maximum, fresh
password verification/session checks, audit journals, conflict handling, cleanup
retry, cache invalidation and committed-change broadcasts remain intact.
Password success/failure and Storage failure/retry are verified with mocks; no live
password was submitted to a deletion endpoint. The compact modal has no dependency
panels, counters, manifests or technical error dump.

Restarted the existing local backend with its existing environment. The health
endpoint returned `status:ok`. An authenticated Admin read-only capability request
through the application's own API client returned `enabled:true`,
`max_unique_trips:20`, `password_required:true`. This also verifies frontend/backend
communication with the original application session context. An initial probe
arrived before startup completed and failed to fetch; after health readiness, the
read-only retry passed. No deletion request was retried.

Flags remain: whole-trip deletion true, POD review true, tracking false, PDF false;
planned routes remains unset/default false. Runtime reports one worker and no
Redis configuration; existing multi-worker rate protection still fails closed
without shared Redis. No flag or provider configuration was changed.

The identified production trip's read-only preview still reports no blockers.
Actual production deletion and provider Storage cleanup were intentionally not
performed. No implementation blocker remains; genuine retention/ownership blockers
continue to apply to other trips as designed.

Files changed during final installation: expanded disposable attachment fixture,
this report and the progress checkpoint. Previously prepared hotfix files listed
above were preserved unchanged, including the approved SQL checksum. No unrelated
migration, deployment, commit or push occurred. No existing production trip or
attachment was selected or deleted by the agent. The next destructive action,
if desired, must be initiated by an authenticated Admin in the application.
