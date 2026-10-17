# POD workflow, PDF and tracking proposals

October 17, 2026. **POD review ONLY was approved and applied as `20261017022906`.**
The other three proposals remain unapplied and unapproved. See the activation
checkpoint in docs/tms-table-overhaul-progress.md for hash, security and test evidence.
The Operations pagination approval does not authorize these changes.

## Exact files

All files are under backend/migrations. Recalculate hashes before any application.

| Migration proposal | SHA-256 |
| --- | --- |
| `2026_10_31_proposed_pod_review.sql` | `472F3590BEA5CBA08667729D274C6163BEC742CEF1A93B4E1E25425CFC3C36BF` |
| `2026_11_01_proposed_pod_extraction_history.sql` | `0E91D323090176B4E0D44E8A6F5A9714335CF8766759D0AE3383FAADDC00B675` |
| `2026_11_02_proposed_pdf_receipts.sql` | `3066E5B2A1773673BAEF8BFB06186A7F16555F6954510C495D9E5389A0183B03` |
| `2026_11_03_proposed_tracking_route_cache.sql` | `D70280C19A405665F4EE14D549ED631E753324C7C892BF700C0C633B1E83FA96` |

## 1. POD review: approved and applied

File: `2026_10_31_proposed_pod_review.sql`.

Purpose: atomic approval/rejection at exact trip/stop/receipt identity, reviewer
metadata, decision history and one trucker notification per successful decision.

Objects: six new trip_images decision columns, pod_review_events, service-only
review_pod_receipt_v1 RPC, expanded admin_notifications type CHECK. Existing OCR
review fields, POD lifecycle CHECK, base grants, RLS policies and publications stay.

Data impact: existing images/receipts gain PENDING decision metadata, not inferred
approval. No backfill of verified values, deletion, document move or test records.
The migration itself makes no business decision. Only subsequent authorized API
requests can update exact linked POD receipt state and create audit/notifications.

Security: the RPC is SECURITY DEFINER with fixed pg_catalog search_path and
qualified object names. EXECUTE is service_role only, with an internal current
ADMIN/STAFF profile check. Backend derives actor identity from validated JWT/app
session. Browser/anon cannot call it. Audit is RLS-enabled, service-read-only;
no generic audit writer is granted. Base pod_records SELECT/INSERT/UPDATE/DELETE
are not broadened. The older 2026_10_30 read-grant proposal is **not needed** for
this RPC workflow and remains unapplied; do not apply it as a dependency.

Eligibility and ordering:

- Exact receipt kind/trip/stop; private original bucket and Storage object metadata
  must exist. Live read-only check found zero missing objects among 8 receipts.
- Actor/request advisory lock, receipt row lock, optimistic OCR/review versions and
  stop row lock serialize decisions. Later successful reviews are audited; approved
  documents are terminal. Replay of the identical request returns the same outcome.
  Reusing a request ID for different payloads is a conflict.
- DR must match the saved transaction, uploaded receipt and reviewed DR. Multiple
  historical POD rows need an explicitly chosen matching physical POD ID; never
  select an arbitrary row. The normal UI intentionally blocks on this conflict;
  historical reconciliation/selection UI remains a later enhancement.
- Approval creates a RECEIVED POD only if no POD exists, or promotes only
  PENDING_TRUCKER_CONFIRMATION to RECEIVED. Downstream stages stay unchanged.
  Existing Transmittal Reference, remarks, delivery dates/status, quantities,
  CBM, trip status, assignments and billing values are never overwritten.
- Rejection requires a reason and changes no downstream POD stage. It retains the
  original file and extraction/OCR state. A subsequent new document is a separate
  PENDING submission. Re-review of a rejected document creates a new audit entry.
- Notification recipient is the historical trucker uploader; otherwise exactly one
  current PRIMARY trucker assignment is required. Missing/ambiguous recipients
  block the whole decision with an actionable error. No client recipient ID.
- Decision, linked POD change, notification and audit commit or roll back together.
  Notifications use the existing recipient/event unique index; no outbox needed
  because they are PostgreSQL rows in the same transaction, not external sends.

Compatibility and activation: POD_REVIEW_ENABLED defaults false. Deploy tested
backend/frontend, inspect current schema/permissions/counts and verify exact hash,
apply only after approval, verify RPC permissions, then explicitly enable/restart.
The UI checks the capability flag and keeps ordinary OCR usable while disabled.
Actual signed-in approval testing needs a separately approved test document.

Recovery: disable POD_REVIEW_ENABLED, revoke EXECUTE after dependency review if
necessary. Keep audit and decision columns/data. Do not drop audit history or narrow
notification CHECK while POD notices exist. No Storage rollback is involved.
Existing authorized permanent deletion/financial protections remain. Minimal audit
identity snapshots survive explicit document/transaction deletion; audit contains
reviewer name/reviewed fields and must remain restricted to management.

## 2. Durable extraction history: design proposal, not activated

File: `2026_11_01_proposed_pod_extraction_history.sql`.

Objects: private pod_extraction_runs table, source/terminal immutability trigger,
completed-cache and expired-lease indexes. No existing records are copied.
Original saved OCR text, version/hash, actor, consent time and model are stored
separately from structured interpretation and matching. Reviewed operational values
are not synchronized from this table. Only service_role gets SELECT/INSERT/UPDATE;
no browser reads, publication change or generic API.

State is PROCESSING -> COMPLETED/FAILED. Terminal results/source snapshots cannot
be overwritten. A retry creates another attempt. Request ID replay, actor-scoped
completed lookup, lease-token CAS and recovery of expired processing jobs are the
required next backend integration; **not implemented/activated in this checkpoint**.
Do not apply solely to claim durable jobs are running. Gemini is not called by SQL.

Retention: derived OCR/extraction rows are owned by the receipt and cascade only on
explicit authorized receipt/transaction deletion. Minimal review audit is separate.
Recovery: stop workers/revoke write grants, retain existing extraction history.
PDF and review proposals do not require this table to perform manual review.

## 3. PDF receipts: preparation, renderer still required

File: `2026_11_02_proposed_pdf_receipts.sql`.

Preflight requires the existing private trip-images bucket, exactly current image
MIMEs and 5 MB limit. Adds nullable mime_type/file_sha256 to trip_images and a
partial exact-stop content-hash unique index. Existing rows stay nullable, with no
uncertain MIME/hash backfill. Adds application/pdf only to that same bucket. No
other bucket, object, policy, permissions, public setting or size cap changes.

Existing image upload services remain image-only. The new preparation validator
checks cap, signature, digest and obvious active/encrypted PDF content; this is not
a complete PDF parser/sanitizer. **A bounded PDF renderer and actual upload/preview/
Tesseract page integration must be implemented and tested before activation.**
Do not pass a PDF blob directly to the existing image-only Tesseract worker.

Design: preserve original PDF in the private bucket, render locally with bounded
page count/pixel budget, OCR each page with existing Tesseract and combine page-
labelled text. Preserve signed access and human original-document review. Do not
create public URLs. Existing exact-object deletion cleanup is format-independent.
Failed-upload cleanup remains the existing best-effort mechanism; a durable intake
rollback journal is a remaining integration consideration, not a completed feature.

Recovery: disable PDF intake, then remove only the PDF MIME after review/approval.
Retain uploaded originals/metadata; the allowlist controls future uploads, not
historical downloads. Do not apply until renderer/intake consumers are ready.

## 4. GPS and road-route cache: architecture proposal, not activated

File: `2026_11_03_proposed_tracking_route_cache.sql`.

Creates two RLS-enabled service-only tables: one latest fix per physical assignment,
one cached road route per assignment. Trip identity is resolved from the existing
assignment FK, not duplicated in another writable trip field. No old locations,
events or routes are transformed. No browser grants or new publication members.

Required future runtime flow:

1. Explicit browser Start tracking asks Geolocation permission; no automatic watch.
   Backend verifies authenticated TRUCKER/current assignment using existing source
   relationships, derives profile/driver/trip and creates a tracking-session ID.
2. Bounded/throttled latest-fix writes store position/accuracy/capture/server receive
   time. Atomically compare session, assignment revision and captured_at; ignore
   equal/older captures, reject stale/future times. Stop/logout/revocation disables
   capture and clears the watch. Browser suspension/lock is not guaranteed tracking.
3. Authorized latest-fix API joins assignments/trips; old actor/driver/truck snapshots
   must not be shown as a new assignment after reassignment. Use server authorization,
   never client-supplied profile, active status or driver identity.
4. Minimal marker invalidations go to authorized trip/management rooms, then protected
   API reads update individual map markers. Do not broadcast private coordinates to
   unrelated Truckers or refetch the full dashboard/report on every GPS fix.
5. Destination fingerprint includes assignment identity/revision and ordered remaining
   stop IDs/coordinates, excluding moving truck position. Destination/sequence/vehicle
   changes invalidate immediately; ordinary movement does not call Directions.
6. Claim a per-assignment DB lease with revision CAS, then use bounded Directions
   concurrency and backend token configuration. Recalculate about hourly for active
   relevant trips, cache geometry/time/counters, respect retry_after/rate limits and
   keep last valid geometry on failure. Skip inactive/missing-coordinate trips.
7. Support 10+ independent assignments/routes. Map layers update only changed geometry;
   pins move independently. Existing Leaflet/Mapbox raster map can render returned
   road geometry without a new framework. Preserve current GPS tracks and controls.

The pure validators/fingerprinting/hourly planner are implemented and fixture-tested;
opt-in browser watch, protected persistence RPC/API, Directions adapter, lease worker
and live map integration **remain to implement**. Table grants alone do not enforce
assignment/session ordering: do not expose them through a generic CRUD endpoint.
Do not apply this proposal until dependent runtime is ready. Recovery: disable
tracking/workers and revoke writes after review; preserve last-known positions/routes.

## Verification and limits

- Read-only live inspection: 0 POD rows, 8 receipt rows; original private objects all
  have metadata, service_role has BYPASSRLS but no base POD grants, notification
  recipient RLS already exists. Receipt/events/notifications are already published;
  pod_records already emits restricted admin change signals. No live DDL/DML used.
- All four proposals compiled/asserted against a fresh disposable PostgreSQL 18 DB,
  including idempotency, role/stop/version/DR/original-object checks, atomic rollback,
  downstream-field retention, private grants and immutable extraction history.
- Schema-only deletion fixture verifies exact-child cleanup preserves sibling/shared
  records, removes derived extraction rows and retains minimal audit, then rolls back.
- Two concurrent fixture writers: 1 commit, 1 conflict, one audit/notice outcome.
  service_role successfully executes RPC without base POD table grants.
- Actual Socket.IO fixture: only recipient receives notice-ID/revision signal; no message,
  private path or other user's data. Duplicate signal is ignored.
- Actual UI fixtures: decision cancel/required reason/draft/retry key/duplicate-submit/
  account isolation; trucker cached notification opening and coalesced socket refresh.
- Gemini was NOT called during this checkpoint. Last known blocker is HTTP 402;
  Tesseract/manual review remain intact. No authenticated live approval or GPS/PDF
  acceptance claim: migration and test-document approval are still required.
