# Phase 2C.5 — Offload/Backload reporting checkpoint

Date: October 18, 2026. Local implementation and isolated acceptance; **not authenticated production acceptance**.

## A. Implementation summary

- Reused `OperationsEventSubmissionForm`, assigned Operations API, exact transaction choice helpers, private receipt upload/signing services, and the existing change-signal/Socket.IO infrastructure.
- Added **Report Trip** to the Trucker Dashboard action area. Its mobile modal provides searchable assigned dispatch choices, Offload/Backload selection, required reason, image previews/removal, upload progress and retry. Parent trip and stop UUIDs are submitted separately. Management retains its DR-based Offload selector.
- Both submission paths enforce authorization on the backend. Trucker assignment, active trip, stop ownership, and Offload DR eligibility are rechecked independently of browser choices.
- Required reason is validated server-side (maximum 2,000 characters); internal line breaks are retained. Image restrictions remain JPEG/PNG/WebP, 5 MiB each, five Offload images or twenty Backload images. Existing signature validation/private upload compensation is reused.
- Existing submit guard prevents repeated clicks. A saved report with a failed image upload stays in upload-retry mode instead of creating another report. This is not a claim of durable, cross-session creation idempotency after an ambiguous lost POST response.
- Backload creation now sets trusted `created_by`, `submitted_by`, `submitted_at` and physical event type. Legacy dispatch submission delegates to that same create service. Unknown creator fields are rejected on edits.
- Ordinary Offload/Backload type relabeling is rejected after submission; their inline/modal type controls are read-only. Existing audited conversion infrastructure and historical ledgers are preserved separately.
- Added current-user password confirmation for existing Admin/Staff report deletion. Whole-trip deletion retains its separate Admin-only policy and disabled feature flag.
- Reused one cleanup engine for both physical cargo report types. Offload retains its installed atomic RPC/journal; Backload receipt deletion is prepared against a separately proposed RPC and fails closed while it is absent.

## B. Trucker Dashboard

`ReportTripDialog` uses the authenticated token-scoped assigned-report cache and deduplicated fetch. It never creates trips. Two stops with similar dispatch labels remain distinct options with their own UUIDs. Missing DR or stale assignment is rejected by the backend even if a stale option is selected.

The modal closes only after confirmed report submission and successful receipt upload, retaining the existing explicit upload-retry state on partial failure. Account changes unmount the owner-scoped modal; requests cannot install another account's choices. The dialog includes a focus boundary. A successful submission invalidates Operations caches and requests draft-safe reconciliation of an already visible Activity reports view, without reloading the whole driver dashboard.

## C. Reported By

Authoritative identity is `coalesce(created_by, submitted_by)`, resolved through profiles. It is never the assigned driver, delegate, current viewer, or last editor. The existing editable `reported_by` delegate remains distinct from original attribution. Original creation fields are not accepted in update payloads.

The installed creator migration `20261018065149` correctly projects original Offload submitters into the 28-column service-only pagination view, including global search/sort. The visible Offload `Reported By` column uses the resolved name. Missing historical creators render the existing unavailable dash.

Backloads already have the required creator columns, so submission needs no schema change. Bounded-page enrichment now displays original Backload names. **Dataset-wide Backload creator search/sort requires proposal 09 below**: the live view still projects a null Backload reporter ID. No historical creators were backfilled.

## D. Record-only deletion and password security

Both single-record and bulk report endpoints use the same password guard and deletion service. New endpoint: `POST /api/reports/operations/reports/delete`, with exact `{source_type, record_id}` targets and `current_password` in the request body only. Existing single DELETE delegates to it. Maximum twenty selected records, deduplicated by physical type and UUID; no implicit selection across pages.

The guard verifies the current account through a separate non-persisting Supabase Auth client, matches the returned user ID, signs out only the temporary verification session, and rechecks the original bearer, application session and current database role before mutation. It shares the existing five-attempt/fifteen-minute limiter and overlapping-request lease. Multi-replica Redis failure remains fail-closed. No reusable authorization token or client `passwordVerified` flag is accepted.

Existing role policy is preserved: ADMIN and STAFF may delete operational report records; TRUCKER may submit/read assigned reports but cannot delete them. The generic guard does not grant Staff whole-trip deletion. Passwords are masked, held only in transient component/request state, removed from the controller body, and cleared after cancellation, failure, success or account/token change. No passwords are logged.

Each report deletion is atomic under its existing/proposed policy; a bulk operation intentionally returns individual outcomes, including protected records and pending Storage cleanup. **This is not an all-or-nothing whole-trip batch.** Trips, stops, assignments, PODs and sibling reports are not deletion targets.

Offload uses `delete_offload_with_cleanup_v1`, preserving conversion, retained-document and FK safeguards. Its journal records deletion before exclusively owned Storage cleanup; failed removal or acknowledgement remains pending and retryable. Backloads without receipts retain their existing exact-record/FK-guarded deletion path. Backloads with receipts call the prepared atomic cleanup service; the missing live RPC returns an explicit protection error until separately approved. No unsafe attachment fallback is used.

New `/operations/report-cleanup` read/retry routes and the existing cleanup notice support both kinds; old Offload cleanup endpoints remain compatible. Backload journal absence is tolerated only as the known unapplied schema; other failures are surfaced. Recovery uses the exact journal operation/type, never a broad Storage prefix.

## E. Live cleanup impact — inspection only

Target project: `hdmknewarynwpbrhfgai`; backend URL and configured Supabase MCP project reference agree. Read-only inspection confirmed the installed creator migration and deletion permissions.

| Target/dependency | Count / exact target set |
| --- | --- |
| Physical Offloads | **0; IDs `[]`** |
| Parent trip IDs / stop IDs / dispatches affected | `[]` / `[]` / `[]` |
| Offload items | 0 |
| Offload receipt metadata | 0 |
| Conversion ledger references involving Offloads | 0 |
| Backloads / Backload receipt metadata | 0 / 0 |
| Storage objects eligible for this cleanup | **0** |
| DR 333 affected | No |

There are no existing physical Offload entries to delete. Loading/Unloading rows visible under an All filter are not Offloads and must not be included. No deletion command was executed or prepared against an implicit entire table. If records appear later, re-inspect an explicit ID set and obtain final approval before cleanup.

The private `report-receipts` bucket contains **one object with no current Offload/Backload receipt references**. Its ownership has not been established for deletion. It is excluded and untouched. Bucket privacy, 5 MiB limit and allowed image types remain unchanged.

No financial/audit retention blocker can attach to an empty target set. Catalog inspection identifies owned item FKs (child cascade only), receipt FKs (restrict) and historical conversion protection. Disposable tests model retained documents and additional protected FKs; they do not assert a new legal retention policy.

Final read-only operational counts: 7 trips, 8 stops, 9 line items, 7 assignments, 1 POD record, 9 trip images, 0 Offloads and 0 Backloads. These remain consistent with the preceding checkpoint. DR 333 was not used for testing.

## F. Supabase requirements — PROPOSALS ONLY

1. `backend/migrations/2026_11_09_proposed_backload_creator_attribution.sql`
   - SHA-256: `D420DA31A42335FD05E03F62ED3E4F9F3DAB969956DCE9F9B8A21415BE3A7333`.
   - Changes only the Backload original-creator projection of the existing Operations view; preserves its 28 columns, types, owner and ACL. No data backfill, new browser grants, RLS or publication changes.
   - Capture the current view definition immediately before approval/application. Recovery restores that exact definition. Installation order: after the already installed Operations pagination and Offload attribution migrations.
2. `backend/migrations/2026_11_10_proposed_backload_deletion_cleanup.sql`
   - SHA-256: `9CC29592B7379FDC2605D138476BBA9B039B76734C6F28AD23B48096AC520980`.
   - Adds a private Backload journal and service-only atomic `delete_backload_with_cleanup_v1(uuid,uuid)`, using the existing Offload transaction/cleanup pattern and shared application cleanup engine.
   - Fresh Admin/Staff role check, advisory/parent locking, conversion and retained-document/shared-path checks, receipt/item snapshot, owned child cleanup and rollback on protected FKs. No trip/stop deletion and no installation-time operational deletion.
   - New journal RLS enabled; anon/authenticated denied. Service role receives only journal reads/acknowledgements and RPC execution. No Storage bucket, browser policy or Realtime publication change.
   - Recovery: disable the consumer and retain pending journals for retries. Dropping journals with pending work loses recovery information. Deleted Storage bytes cannot be restored from snapshots.

Both proposals passed disposable PostgreSQL checks and remain **unapplied and unapproved**. The live Backload RPC is absent; the Offload RPC exists, service role can execute, authenticated browser role cannot. Neither proposal is a request to activate whole-trip deletion.

## G. Tests and limitations

- Backend: **193/193 pass**, zero failures/skips. Includes actual Express HTTP with mocked Auth/DB, Admin and Staff password confirmation, incorrect/missing password, identity/role changes, expiry, rate limits, immutable deduplicated record batches, report validation, attribution, assignment denial, image validation, cleanup retries, parent/sibling preservation and existing regressions.
- Frontend: **87/87 pass**, zero failures/skips. Includes selection identity, image limits/types, caching and deletion outcomes.
- Five isolated browser fixtures pass: `operations-table`, `operations-pagination`, `offload-dr-form`, `trucker-loading`, `trucker-report-trip`. DR form runs both ADMIN and TRUCKER contexts. New mobile portal test submits both types, preserves the exact second stop, attaches multiple synthetic images, removes a preview and double-clicks submission without duplicate reports. All Auth/API traffic is mocked; no production uploads or writes.
- Pagination browser fixture uses 102 synthetic rows: global search/filter/sort, page-scoped selection, zero requests on cached return, last-page deletion recovery and draft-safe incoming refresh pass. Updated its older hidden-button assumption to the established disabled action-button design and the password-confirmed bulk transport.
- Disposable PostgreSQL: original Offload deletion assertion suite passes; equivalent Backload proposal suite passes for owned items/receipts, idempotency, sibling preservation, retained documents/history, protected FK rollback and authorization. Creator fixtures cover ADMIN/STAFF/TRUCKER, unknown historical creator, creator/delegate separation, global search/sort and the unchanged 28-column/private-grant contract with more than 100 reports. The owned local cluster was stopped afterward. No live destructive RPC was invoked.
- Backend/frontend TypeScript and production builds pass. Changed frontend TypeScript-file ESLint is clean. Backend has no configured ESLint command. `git diff --check` and unresolved-index checks pass. Existing Vite large-chunk warnings and unrelated CRLF notices remain.
- Browser fixture corrections: notification mocks now return the actual notifications response shape; initial fixture failures were fixed and rerun. They were not live authentication failures.
- Live authenticated submission, paid/provider Auth password confirmation, live upload, live record deletion and independent cross-session report propagation were **not** performed. Real Redis/provider acceptance limitations from Phase 2C.4 still apply. No production test report was created.
- Durable creation idempotency after a lost POST response and atomic enforcement of the Backload twenty-image limit under simultaneous uploaders are not newly guaranteed by this checkpoint. Existing Offload capacity enforcement and in-form retry protection remain intact.

## H. Files changed in this checkpoint

- Backend: `src/controllers/operations-report.controller.ts`, `src/routes/report.routes.ts`, `src/services/{operations-report.logic,operations-report.service,offload-deletion.service,deletion-password.service}.ts`.
- Backend tests: `deletion-password`, `offload-submitters`, `offload-cleanup`, `operations-delete`, `operations-report.logic`, new `operations-record-password` and `operations-record-password-http`; new `fixtures/mock-report-deletion.ts` and four `backload-*` SQL fixtures.
- SQL: the two new proposals listed above. Previously installed migration files were not modified.
- Frontend: `OperationsEventSubmissionForm`, `OperationsReportsView`, `OffloadCleanupNotice`, new `ReportTripDialog`, `pages/Driver/DriverPortal.tsx`, `services/operations-report.service.ts`.
- Frontend tests: `operations-preload`, `operations-table.browser`, `operations-pagination.browser`, `trucker-loading.browser`, new `trucker-report-trip.browser`.
- Documentation: this file and appended checkpoint in `tms-table-overhaul-progress.md`.

## I. Remaining approvals and exact resume point

Review proposals 09 and 10 independently; apply neither without explicit approval and a fresh schema/checksum preflight. Backload creator search/sort and attached-report deletion remain approval-dependent. A controlled live Admin/Trucker submission/upload and attribution acceptance test requires separately authorized test records and accounts; live deletion additionally requires an explicit exact record set and decision authorization. The current cleanup target set is empty, so there is nothing to confirm for deletion now.

No new bucket, Storage policy, RLS relaxation or publication change is required. Existing `admin_change_signal_trg` covers Backloads, Offloads and receipt metadata; `admin_change_signals` is published and used for authorized targeted refresh. Direct Backload/Offload publication membership already exists; no new subscriptions/publications were introduced. Private image paths stay behind protected APIs.

Safety: no live Offload/Backload/trip deletion; no live operational insert/update; no production Storage upload/deletion; no migration, grants, RLS or publication modification; no feature activation; no GPS, Mapbox Directions or Gemini calls; no deployment, commit or push. Whole-trip deletion/planned routes remain unset and default false, tracking/PDF false, POD review true.
