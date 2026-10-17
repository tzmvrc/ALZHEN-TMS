# POD and tracking integration: inspected state and approval boundaries

October 17, 2026. This is an implementation checkpoint, not a completion claim.

## Initial inspection (historical; superseded by checkpoints below)

- OCR: browser Tesseract in `frontend/src/services/ocr.service.ts`, with image
  preprocessing and worker termination. No replacement provider introduced.
- Review: `ReceiptReviewCard.tsx`, protected ADMIN/STAFF receipt APIs, and
  `trip_images.ocr_text/ocr_confidence/ocr_version/reviewed_at/reviewed_by`.
  Corrected fields currently travel in a text header above preserved raw text.
  This does not provide structured extraction history or POD approval.
- Intake: trucker upload validates current assignment and exact active stop;
  private `trip-images` bucket, 5 MB JPEG/PNG/WebP. PDF is not supported by the
  current API, OCR worker or bucket MIME allowlist. Do not relabel PDFs as images.
- Live inspection found 8 receipt rows, all linked to a stop, and 0 pod_records.
  No documents were downloaded, OCR-processed or modified during inspection.
- POD lifecycle currently allows PENDING_TRUCKER_CONFIRMATION, RECEIVED,
  FOR_TRANSMITTAL, TRANSMITTED, SHIPPED, COMPLETED. Approval/rejection is a
  different lifecycle and must not be substituted for these business statuses.
- `pod_records` has trip/stop foreign keys and timestamps, but no approval audit,
  extraction, rejection reason, document relationship or request-id fields.
  There is no current unique stop constraint; do not invent a uniqueness rule.
- Notifications: `admin_notifications` has recipient ownership and deduplication
  infrastructure, but its CHECK accepts only `report_mention`. POD notifications
  cannot safely use that unrelated type. Confirm trucker recipient APIs before
  extending the existing notification model.
- Change detection: trip_images/trip_events/admin_notifications are published;
  pod_records is not, but already has the restricted admin-change-signal trigger.
  No publication change was made or assumed necessary.
- GPS: DriverPortal obtains browser location at operational actions; backend
  resolves authenticated assignment and writes trip_events. Existing schema
  stores latitude/longitude/event_time, not accuracy or a dedicated latest-fix
  capture sequence. A separate opt-in tracking lifecycle remains to implement.
- Maps: existing Leaflet map uses configured Mapbox raster tiles and recorded GPS
  tracks. It does not yet calculate Mapbox Directions road geometry, cache hourly
  routes or independently stream pin updates as requested. Preserve current maps.

## New read-only permission proposal (NOT APPLIED)

File: `backend/migrations/2026_10_30_proposed_pod_service_read.sql`

SHA-256: `274EBDDD03A6E8E936E0EB68A7FBB647981CF42FEE5144B7754125518726DD0D`

Exact effective change: `GRANT SELECT ON TABLE public.pod_records TO service_role`.

Purpose: allow protected backend inspection of physical POD records. Live
preflight found service_role SELECT/INSERT/UPDATE/DELETE all false. Existing
service-only POD view access does not grant physical-table access.

Data impact: none. Security: server service role gains POD reads; no anon or
authenticated grants, RLS, policies, publication or Storage changes. Existing
role checks remain mandatory; never place the service key in the browser.
Compatibility: additive privilege, existing view contracts unchanged. This does
not enable approval writes, add an approval endpoint or solve audit/notification
requirements. No broad write grant is proposed.

Recovery: after dependency review and approval, revoke only this new SELECT
privilege. No data restoration needed. Disposable PostgreSQL 18 validation
passed: service read granted, browser/anon still denied, RLS remains enabled.
Do not execute against live Supabase without explicit approval.

## Gemini configuration and next extraction checkpoint

The user selected Gemini and approved it as the OCR interpretation provider.
The existing private key was moved from frontend/.env into backend/.env; the
frontend entries were removed. Backend GEMINI_MODEL is gemini-2.5-flash. The
new protected interpretation action uses this model only. Never paste credentials
into chat or use a VITE-prefixed key. Actual model metadata read succeeded, but
synthetic generateContent requests returned HTTP 402 (depleted prepayment
credits). Replenish provider billing before live interpretation acceptance.

Keep Tesseract, send only necessary OCR text to the approved interpretation stage,
validate structured output strictly, preserve absent fields as null, and compare
against exact transaction IDs. Use the provider's documented structured-output
contract: https://ai.google.dev/gemini-api/docs/generate-content/structured-output

Before persisting new fields, prepare a separate reviewed schema proposal for
extraction attempts/status/history, original document linkage and approval audit.
Approve/reject must use a transaction-safe, idempotent operation with exact
trip/stop validation and notification deduplication. Corrected OCR is a suggestion
until explicitly reviewed; it must not overwrite transaction values or mark POD
approved automatically. Approval schema and PDF bucket changes are not yet
proposed SQL and are not authorized by the read-only grant above.

GPS latest-fix ordering/accuracy and route-cache storage also need a separate
minimal proposal after completing their consumer audit. Do not encode those
values in arbitrary notes, weaken RLS or reuse report statuses as job statuses.

## Manual acceptance still required

1. Sign approved independent ADMIN/STAFF accounts in locally; verify actual paged
   Operations reads, retained drafts and cross-session refresh. No live test writes
   without a designated approved test record.
2. After extraction/approval implementation and approval of its schema: use an
   approved private test document, verify exact stop matching, ambiguous/manual
   review, corrections, rejection and retry without duplicate notifications.
3. After PDF intake approval: validate PDF limits/rendering and preserve originals.
4. After tracking implementation: explicit opt-in/out, denied browser permission,
   stale capture rejection, offline/suspended-tab behavior and assignment changes.
5. After Directions implementation: at least 10 isolated active fixtures, hourly
   geometry reuse, destination change, rate limits and pin-only updates with no
   extra route calls. Record counts and distinguish fixture from live usage.


## Gemini interpretation checkpoint (October 17, 2026)

### Implemented

- POST /trips/:id/receipts/:receiptId/interpret, existing Supabase authentication
  and ADMIN/STAFF role middleware plus service role allowlist. No Trucker access.
- Requires external_processing_consent=true and the current expected_version.
  Resolves exact physical receipt/trip/active stop before external work. Context
  reads are bounded to 101 stops (rejects above 100), with batched name lookups.
- Sends only the original saved Tesseract text, removing reviewed text headers.
  No signed URLs, image bytes, profile details or transaction context sent.
  No automatic AI invocation on upload, scan, navigation or background refresh.
- Backend-only Gemini 2.5 Flash generateContent with structured JSON schema.
  Eleven fields: dispatch, DR, SO, customer/store, delivery/receiving dates,
  receiver, quantity, product information, document references. Each includes
  a supporting OCR quotation and uncertainty flag. Missing values stay null.
- Strict backend validation rejects malformed/extraneous structures, invalid
  calendar dates/negative/non-finite quantities. Unsupported quotations/identifiers
  and quantities become null with review warnings. Zero is preserved.
- Deterministic matching compares saved dispatch/DR and customer/store context
  within the already-linked trip. Duplicate/shared dispatches do not merge stops;
  ambiguous or contradictory matches require manual review. Suggested stop mismatch
  is explicit, never a reassociation write. SO/date matching and cross-trip candidate
  discovery are not yet implemented; do not infer those from extracted fields.
- Checks receipt version and association again after the external request. Returns
  provisional interpretation and matching evidence, persisted=false, approved=false.
- Process-local 10-minute cache, max 200 entries, keyed by actor/receipt/version/
  model/text hash; deduplicated in-flight requests. Context authorization revalidated
  even on cache hits. Six new requests per actor/minute, max two concurrent per
  process, 40,000-character input, 100 KB response and 30-second timeout.
- No automatic retries; failed requests do not poison successful retry. Explicit
  sanitized 402 billing / 429 rate-limit errors; other failures retain manual review.
  Per-process limits/cache do not claim distributed/durable job coordination.
- UI shows quoted suggestions separately from editable OCR, with document-specific
  external-processing confirmation. Explicit Use suggested fields changes only
  supported review draft fields; no automatic save or approval. Missing/uncertain
  values do not clear existing drafts. Stop-mismatch suggestions cannot be applied.
  Results are scoped to the current account/trip/receipt/version.

### Credential and build audit

- Key was present in frontend/.env; now backend-only with the explicit model above.
  Both credential files are Git-ignored and untracked. No VITE_GEMINI_API_KEY added.
- Private exact-value scan found no key in tracked files, reachable Git objects,
  existing frontend build or the fresh 34-file frontend build. No key value printed.
  This does not establish the absence of exposure outside this repository/device.
- Root ignore now permits .env.example templates. backend/.env.example contains
  empty key placeholder and model name only; never copy real values into templates.
- Restart a deployed backend after configuring environment variables; browser/Vite
  credentials are not a fallback. Real documents require explicit processing consent.

### Tests and remaining acceptance

- Backend 128 tests pass; frontend 69 tests pass. Both TypeScript/build checks pass.
- Four new backend tests cover structured output/null/zero/invalid data, source
  grounding, stop ambiguity, scoped consent/role/version checks, no writes, header
  removal, rate limits, deduplication, cache isolation, failure/retry and provider errors.
- Real receipt-review component with isolated APIs/OCR: consent cancellation zero
  requests; explicit review/application; unavailable provider manual fallback;
  repeat save/rescan versions, conflict draft retention, five seconds and reload.
- Targeted new-module lint passes. ReceiptReviewCard retains two previously
  documented React Hooks baseline errors; no suppressions/new lint errors added.
- Actual Gemini metadata request HTTP 200. Synthetic-only interpretation attempted;
  HTTP 402 depleted prepayment credits prevented a successful live extraction.
  No real POD text/documents sent, no Supabase writes/migrations/publication changes.
- Next: replenish billing, repeat one synthetic live extraction, then obtain an
  approved real test-document processing scope for acceptance. Prepare durable
  extraction/history and atomic approval schema separately for approval. PDF intake,
  POD approval/notifications, continuous GPS and Directions remain unfinished.


## POD review / PDF / tracking preparation checkpoint (October 17, 2026)

See docs/pod-workflow-approval.md for the exact four separate proposals, hashes,
security/data impact, dependencies, recovery and activation limits. None applied.
The prior generic POD service-read grant is no longer a dependency: the new
service-only review RPC reads/writes exact linked records without base grants.

POD decision API/UI are implemented but default-disabled through
POD_REVIEW_ENABLED. They reuse the existing receipt review screen: confirmation,
required rejection reason, preserved drafts, request-ID replay, canonical saved
state and latest 50 audit entries. A Requests-tab global queue is still a later
integration; do not confuse receipt controls with a completed Requests redesign.

The receipt upload replacement path had been replaying step 4 and moving the
unloading-finish timestamp. Completed-stop resubmissions now require the saved DR,
preserve milestones/trip status/line items, retain previous originals, and record a
new receipt plus existing driver audit. First delivery completion remains unchanged.
Rejected receipts and extraction text are not deleted by resubmission. Portal
replacement wording now identifies a new review submission. No new schema required
for this fix. Fully historical/unassigned-trip resubmission is not added; current
assignment/active transaction restrictions remain.

Private bucket checks are read-only now. Ordinary requests will not create/update
buckets behind the approval boundary. Missing/public bucket gives a setup error.
Existing configured private-bucket behavior remains. PDF validation is prepared
but upload/rendering remains disabled pending approval and bounded renderer work.

Gemini was not retried at all in this checkpoint. Billing remains the last known
402 blocker; Tesseract/manual review remains available independently of POD review.
No production records, Storage objects or the previously noted unreferenced object
were modified/deleted. No authenticated live decision or GPS/PDF test is claimed.


## POD review activation (October 17, 2026)

Supersedes the proposal-only/disabled review status above: exact approved review
SQL SHA-256 `472F3590BEA5CBA08667729D274C6163BEC742CEF1A93B4E1E25425CFC3C36BF`
applied as Supabase migration `20261017022906`. Live RPC/audit/defaults/grants and
unchanged business hashes/private bucket/publications verified read-only. Local
backend POD_REVIEW_ENABLED=true; rollback false plus restart. Existing receipt
controls and recipient-only notification transport are reused; no new channel,
browser grant or Storage setting. Full activation evidence/tests and live acceptance
limitations are in docs/tms-table-overhaul-progress.md. Controlled tabs are logged
out; no production decision or notification delivery is claimed. PDF, durable
extraction and tracking proposals remain unapplied. No Gemini retries.

## Live POD acceptance and PDF/tracking preparation (October 17, 2026)

### Authorized live acceptance

User signed in ADMIN on 127.0.0.1 and TRUCKER on localhost, then explicitly
approved rejecting followed by approving ONLY receipt
`35217c69-9180-4103-9c33-66a51ee85c60`, DR 333, trip
`185788e0-23c0-48f0-9108-9be1bad783c6`. Final APPROVED/version 2. Do not repeat
or undo those decisions. They are the only business writes performed this turn.

Actual browser/API: original private image loaded, 1,539 characters of saved OCR,
review capability enabled, empty rejection reason disables confirmation, Cancel
makes no decision. Rejection and approval both HTTP 200; history shows both and
approval survives browser refresh. One exact-stop RECEIVED POD was created.
Original image remains available. No Gemini, OCR or verified trip-value changes.

Both notifications reached the signed-in Trucker, with the approval appearing
while the panel was open without reload. Own API shows two notices/unread count 2;
left unread. Database confirms exactly two decision events, two notices, ONE
Trucker recipient, exact receipt/stop metadata. This is observed automatic UI
delivery, not measured socket latency. A temporary separately imported diagnostic
subscriber during Vite HMR counted zero events, so it is not evidence of transport
internals. Recipient-room transport/dedup remains covered by isolated Socket.IO tests.

Read-only before/after whole-row hashes remained identical:

- Trip stops: `02cf59d2de7459a4d2acfb8115deebca`.
- Line items: `c7c053edd41dfa24b6d530fcd4c55dea`.
- Parent trip: `6b2ef22173f87a564c316df687933c9e`.

Thus unloading timestamps, DR/SO, trip/delivery status and sibling values did not
change. Sibling DR 111 receipt remains PENDING/version 0. No independent STAFF
or unrelated TRUCKER session was supplied: a real third-browser non-delivery test
remains pending, although the two committed events have exactly one DB recipient.

### PDF preparation: not activated

- Added preparePodIntake: original bytes/hash kept separately from OCR rasters,
  private bucket/MIME/5 MiB validation, explicit renderer required. Renderer contract:
  isolated parsing, maximum 10 pages, 24 million total pixels, 20 MiB raster output,
  15-second abort signal; output is checked again. Byte heuristics are not a parser.
- Existing receipt uploader now validates documents before DB/Storage operations;
  disabled PDFs fail without writes. The raw-body route parses PDF only to return
  that clear error. Client upload validation checks type/name/size before network.
- Existing image upload, original retention and exact trip/stop checks remain.
  Actual PDF Storage upload/preview/Tesseract page integration and a sandboxed
  renderer are NOT installed or activated. Current file picker remains image-only.
- `2026_11_02_proposed_pdf_receipts.sql` remains unchanged/unapplied, SHA-256
  `3066E5B2A1773673BAEF8BFB06186A7F16555F6954510C495D9E5389A0183B03`.
  It proposes MIME/hash metadata, receipt hash uniqueness and PDF on the SAME private
  5 MiB bucket, no policies/publication changes. Finish renderer/integration and
  separately approve this proposal before enabling PDF; SQL alone is insufficient.

### Tracking and road routes: prepared, not activated

Read-only inspection: event coordinates lack continuous consent/session/accuracy
ordering. Assignments link drivers.profile_id, trucks and trips; stores/warehouses
have coordinates. Tracking/cache tables remain absent. Existing frontend
VITE_MAPBOX_ACCESS_TOKEN is configured for raster tiles; backend Directions token
is absent. No secret values were printed/copied. Added backend template placeholder.

- tracking.service: explicit consent, current assignment/owner checks, server-derived
  actor, session UUID, fresh captures, stale/session conflicts, scoped reads and stale
  state. Repository contract MUST atomically recheck assignment revision, active
  owner, enabled/session and capture ordering. No unsafe split-write fallback.
- location-capture: explicit start requests browser permission, creates server session
  only after permission/location succeeds, defaults to 30-second throttling (minimum
  5 seconds), single in-flight send, abort/clearWatch/stop cleanup, permission errors
  and overlapping-start/logout race handling. No implicit GPS collection. Suspended
  or closed mobile browsers cannot guarantee background capture.
- mapbox-directions.service: backend driving/GeoJSON, ordered origin plus at most 24
  stops, 15-second timeout, 1 MiB response and geometry validation; default concurrency
  2 (1-4 configurable), queue 32, process budget 30 requests/minute, sanitized errors
  and request counters. No automatic retries, secret URL logs or frontend-token
  fallback. Uses [official Mapbox v5 contract](https://docs.mapbox.com/api/navigation/directions/).
  Driving geometry does not guarantee truck height/weight restriction clearance.
- road-route.service: durable-repository CAS leases/finalization, destination and
  assignment fingerprint excluding marker movement, hourly refresh, inactive skip,
  last valid route on errors and backoff (5 minutes for 429). Finalization must
  recheck assignment/destinations so late provider responses cannot win.
- TrackedTruckLayer: prepared layer for existing Leaflet/Mapbox raster host; one
  marker per assignment, distinct route colors, ordered stop markers, stale time,
  exact trip callback; memoized paths retain geometry during pin updates. Rendering
  makes no route requests or GPS captures.

NOT yet mounted: protected tracking HTTP controllers, atomic Supabase repository/RPC,
bounded assignment feed, centralized socket invalidation, opt-in portal UI/map feed,
scheduled lease worker, distributed budget. No live tracking writes or new rooms.
Co-located trucks should reuse existing map clustering during integration.

`2026_11_03_proposed_tracking_route_cache.sql` unchanged/unapplied, SHA-256
`D70280C19A405665F4EE14D549ED631E753324C7C892BF700C0C633B1E83FA96`.
Service-only RLS tables do not implement atomic assignment/session/capture and route
claim/finalize checks: prepare their exact RPC proposal separately before activation.
No publication/browser grants are proposed. Do not activate table-only tracking.

### Verification / resume

- Backend 142/142, frontend 73/73; both TypeScript/builds pass; targeted lint clean.
  Existing ReceiptReviewCard baseline errors and Vite chunk warning are unchanged.
- Actual Leaflet fixture: 10 trucks, 10 roads, 20 stops, pin update retains path
  node/geometry, stale popup and physical trip callback; zero Mapbox requests.
  Initial synthetic markers were too close for a normal click; separated fixture
  coordinates and reran without force-clicking. Shared-coordinate UX is not claimed.
- Provider/store mocks: initial requests 10, pin movement additional 0, hourly
  additional 10, maximum concurrent 2. Shared claim prevents duplicate workers;
  late finalization rejected; rate limit retains route and defers retry.
- PDF tests cover disabled/no-write actual uploader, original/hash, missing renderer,
  MIME/private/size/page/pixel limits. GPS mocks cover consent, throttle, stop,
  stale state, permission denial and pending-session/logout races.
- Existing decision, notification and OCR browser fixtures pass. Gemini and paid
  Directions were NOT called. Last known Gemini blocker remains HTTP 402.
- No new migrations, Storage settings, grants, policies or publication changes.
  Review migration not reapplied. No commits/pushes.

Next: optional third Trucker/independent Staff acceptance; bounded sandboxed renderer
and original/metadata intake wiring; atomic tracking RPC/repository proposal and
protected routes before requesting separate schema/activation approvals.

## Gated runtime integration supersedes preparation-only status

October 17, 2026: renderer, upload/page APIs, Tesseract multipage integration,
tracking HTTP/atomic repository, portal controls, live-map feed and worker are
implemented behind disabled flags. See `docs/tracking-pdf-activation.md` for exact
SQL/checksums, security, retention and deployment requirements. No proposals applied.
Backend 146/146, frontend 73/73, builds/targeted lint and seven browser fixtures pass;
real synthetic PDF rendering and disposable PostgreSQL checks pass. DR 333 untouched;
no live GPS/private PDF or paid provider calls. Gemini billing remains blocked.


## Tracking/PDF approved application - October 17, 2026

The exact approved tracking base, atomic tracking and PDF receipt files were applied
as 20261017033055, 20261017033115 and 20261017033128, respectively. Checksum/project
and live object/privilege/operational hash verification passed. See
[activation evidence](tracking-pdf-activation.md#approved-application-checkpoint---october-17-2026).
No existing receipt/POD/business data changed; DR 333 remains untouched.
Private trip-images now permits application/pdf alongside existing images, remains
private and capped at 5 MB. Tracking tables remain empty and unpublished, protected
by RLS/no browser grants, with service-only RPCs. No publication or policy changes.

Runtime flags are still false: private backend Directions token absent; deployed PDF
native-memory/network/unprivileged-process isolation unverified. Actual compiled
PDF worker renders synthetic pages locally. Schema readiness is not feature activation
or live acceptance. Existing image intake/POD review/manual OCR remain enabled.
No Gemini retry (known 402), paid routing, live GPS or new production PDF test.

146 backend/73 frontend tests, both builds/TypeScript, targeted tracking/PDF lint,
seven isolated browser regressions and disposable PG18 RPC/PDF/concurrency tests pass.
Two existing ReceiptReviewCard lint errors remain; Vite chunk warning remains.
Next approvals concern safe authenticated GPS/PDF test scope and any paid routing
verification, after credentials/deployment prerequisites; no extra SQL needed now.
Durable AI history remains separately unapproved and unapplied.


## Phase D - Mapbox readiness and renderer hardening (October 17, 2026)

- Preserved all three applied migrations and flags. Backend Directions token absent;
  frontend public token present, not reused. Exact local configuration/runbook and
  request budgets documented in docs/tracking-pdf-activation.md. Directions access
  remains unverified; no paid calls made.
- PDF parent enforces input/caller limits, validates child raster protocol and PNG
  dimensions, forcibly terminates cancelled/timed-out children and clears buffers.
  Worker obeys requested limits and cleans canvas/page/PDF task on failure.
- Compiled worker/native canvas render synthetic PDFs successfully on local Windows.
  No production backend deployment manifest found. Child inherits backend OS rights;
  native-memory cap, restricted identity/filesystem and OS egress isolation remain
  unverified. PDF intake stays disabled; deployment configuration requested.
- Backend150/150, frontend73/73; both TS/builds and targeted changed-module lint pass.
  Compiled-dist renderer smoke and isolated PDF review browser fixture pass. New tests
  cover invalid output, tighter budgets, in-flight cancellation/slot recovery and
  30/minute Directions limit. Git diff/cached checks pass. Vite baseline warning stays.
- Read-only Supabase confirms private5MiB bucket, empty unpublished tracking tables
  and existing migrations. Browser only has about:blank; authenticated checks pending.
  No real GPS/PDF write, DR333 edit, Gemini/paid routing call, SQL, commit or push.
- Changed: backend/src/services/pdf-renderer.service.ts, pdf-renderer.worker.mjs,
  pod-intake.service.ts comment; backend/tests/pdf-renderer.test.ts,
  tracking-services.test.ts; activation/integration/progress docs.

Resume: obtain actual backend deployment configuration, verify worker OS isolation,
configure private MAPBOX_DIRECTIONS_TOKEN, then seek controlled live acceptance scope.
POD_REVIEW_ENABLED=true preserved; TRACKING_ENABLED=false and POD_PDF_ENABLED=false.
No additional Supabase action is needed for this checkpoint.


## Hostinger KVM2 Docker preparation checkpoint - October 17, 2026

Architecture prepared only; no purchase, provisioning, deployment, DNS/Auth change,
Supabase write, paid provider call, DR333 modification, commit or push.

### Created configuration and integration

- deployment/compose.yaml: HTTPS proxy, static frontend, single backend, isolated
  PDF/OCR worker. Only80/443 published. Multi-stage Dockerfiles, UID1000, read-only
  roots, no capabilities/new privileges, health checks, restart policies, CPU/RAM/PID
  limits, bounded noexec tmpfs and rotated operational logs. Cloud Supabase retained.
- deployment/Dockerfile.backend provides backend and worker targets; frontend/proxy
  Dockerfiles and Caddyfiles provide HTTPS, WebSockets, SPA direct links, public-only
  build arguments, persistent certificates and redacted/rotated proxy logs.
- PDF worker has network_mode:none, no app credentials/env_file and only a dedicated
  Unix socket volume. Backend mounts the socket volume read-only. Production renderer
  delegates to the socket and refuses credential-bearing local fallback. Worker
  handles bounded rendering plus optional offline English Tesseract CLI OCR; existing
  browser Tesseract remains the application's current OCR path.
- Added exact production HTTPS CORS/proxy configuration; unconfigured development
  behavior preserved. Same JWT/role/app-session/Socket.IO safeguards remain.
- Templates: deployment/.env.example (public build/config), backend.env.example
  (private placeholder-only server config), backend/.env.example socket/CORS guidance.
  Root .dockerignore excludes secrets/envs/tests/builds. Secrets/runtime paths ignored.
- deployment/container-healthcheck.cjs, smoke-pdf.cjs and validate-config.py provide
  process/socket probes, a real future container synthetic render+Tesseract test and
  static YAML/policy checks without reading actual environment files.
- docs/hostinger-vps-deployment.md: Ubuntu/Docker/firewall/DNS/ACME setup,8GB resource
  budget, controlled build/start, isolation checks, monitoring, rollback and encrypted
  backup/recovery responsibilities. Contains official primary documentation links.

### Verification / blockers

- Backend153/153 and frontend73/73 pass; both TypeScript/builds and targeted new/changed
  module lint pass. Health/smoke scripts pass Node syntax checks. Static YAML/policy
  validation passes with disposable PyYAML outside the project. Git diff/cached checks
  pass. No unmerged entries. Existing Vite chunk warning/ReceiptReviewCard lint baseline
  remain; dependency advisory release review remains separate.
- Local native PDF rendering passes. Adding local standard fonts initially exposed
  a Windows separator requirement; fixed and renderer tests pass again. Real socket/
  named-pipe protocol test covers health, bounds, busy response, OCR (mocked engine),
  unavailable worker and sanitized errors. Production no-socket refusal/CORS tested.
- Docker is NOT installed on this workstation. No Docker/Compose engine execution,
  image build, Caddy validation/ACME, Linux cgroup/PID/egress enforcement, Ubuntu-host
  native canvas or real container Tesseract test has been claimed. Run the documented
  smoke/isolation acceptance checks on an approved Docker host before enabling PDF.
- Backend Directions token is now present but equals the existing frontend public
  rendering token (public prefix, not secret prefix). It appears in browser assets
  as that already-public rendering token. No new private token was exposed by this
  work; separate backend token/API authorization remain prerequisites. Supabase
  service-role and Gemini private values absent from frontend build/deployment files.
  No local credentials were copied into templates or modified.
- Flags remain POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false, POD_PDF_ENABLED=false.
  Gemini402 unchanged. No tracking/PDF live writes or paid verification.

### Files / exact resume

New: deployment/* configuration/templates/scripts, docs/hostinger-vps-deployment.md,
backend/src/config/http.ts, src/pdf-worker.ts, services/pdf-worker-client.ts,
services/pdf-worker-server.ts and tests/deployment.test.ts; root .dockerignore.
Modified: .gitignore, backend/.env.example, app.ts, pdf-renderer.service.ts,
pdf-renderer.worker.mjs and progress/activation/integration docs. Existing work kept.

Next: approve a precise release artifact and target-host access/provisioning before
any deployment. Pin verified base-image digests, run actual Docker builds/config
validation and native worker smoke/isolation tests. Supply separate Directions
credentials and approve controlled test records/provider usage. Coordinate domain,
DNS and Supabase Auth URLs separately. No additional database migration is required
for this prepared topology. Keep both new feature flags false through those gates.


## Local POD/Mapbox functional acceptance - October 17, 2026

Hosting/deployment postponed by user. New local acceptance guide:
`docs/pod-mapbox-local-acceptance.md`; supersedes the prior deployment resume order.
No Supabase writes/migrations, production uploads/decisions/GPS, DR333 changes,
paid Mapbox/Gemini calls, commits or pushes in this checkpoint.

### Verified

- Real user-signed-in Admin and Trucker sessions available. Admin review capability
  enabled; Trucker administrative receipt/review endpoint403; own assigned list5
  trips and existing notifications readable. PDF/GPS capabilities false. Admin
  denied Trucker-only assigned-trip endpoint. Independent STAFF/unrelated Trucker
  sessions were not available; their permissions are covered by isolated tests only.
- User allowed an existing non-DR333 receipt to be viewed. Used receipt
  62fa7830-7fb9-4ace-9921-0e3879b08d02 (DR111), trip
  ed329614-62d0-4d83-afbc-8c578fdb23d1, stop
  cb9bf6f1-f6ef-439e-b7da-0046375f308d. Outside the old DR333 trip.
  Actual review component rendered original image;444 OCR characters accessible;
  Approve/Reject enabled; history shows no decisions; status remained PENDING.
  Private image362169bytes with matching hashes on two reads. Admin fixture blocked
  non-GET API requests, with0 attempted writes. No new records were created.
- Full images/stops/trips/POD/review-event/notification hashes matched before/after.
  Read-only live schema check: private5MiB bucket, service-only decision RPC, RLS
  GPS tables/no browser SELECT or tracking publication; tracking/cache rows0.
- Real Tesseract browser run on six generated images: clear95confidence found2468;
  blur51/rotated55 missed the DR; multiple95 found2468+1357; missing95 invented neither;
  blank0 returned empty; invalid bytes rejected. These scores are engine confidence,
  not measured general accuracy. Blurry/sideways images need manual correction or
  clearer upright photos. No business image/text sent to an AI/provider.
- Mocked POD decisions/audit/retry/conflict/reason, receipt-only resubmission, exact
  stop preservation, original retention and recipient-only notifications pass.
  Added actual HTTP Auth/role fixture for Admin/Staff read access and denied Trucker
  admin operations; unrelated driver resubmission rejected before Storage.
- Mock tracking:10roads/20stops, no Directions requests for pin changes,10hourly
  requests, max2concurrent,30/minute budget. Socket-refresh browser shows initial1,
  committed update1, reconnect1, unrelated event0 requests. No real GPS/routes.

### Direct local fixes

- OCR preprocessing now closes ImageBitmap in finally, including fallback/error.
- GPS confirmed/reconnect events invalidate only active-location cache before fetch,
  avoiding briefly stale cached pins; replaced socket tracking events check active
  session. Existing route geometry, session isolation and draft protection preserved.
- Backend Directions token still equals frontend public rendering token. Configure a
  separate server-appropriate token and approve authorization/routing verification.

### Tests / files / exact resume

Backend154/154, frontend73/73; both TS/builds and targeted changed TS/TSX lint pass.
Seven isolated browser fixtures pass, including actual Tesseract accuracy test.
Vite chunk warning/old ReceiptReviewCard lint baseline remain. Both Git diff checks
pass. New: pod-mapbox-local-acceptance.md, pod-permissions.test.ts,
ocr-accuracy.browser.js, tracking-realtime.browser.js. Modified: pod-resubmission
fixture, ocr.service.ts, collaboration.service.ts, useTrackedAssignments.ts and
progress/activation/integration docs. All preexisting work preserved.

Resume locally: obtain independent STAFF and unrelated Trucker sessions; explicitly
approve a new non-DR333 decision/upload/resubmission sequence and safe active
assignment/GPS/paid-routing scope. Use the new checklist's exact IDs, baseline and
rollback requirements. Current Trucker is assigned to the viewed trip; its403 proves
admin-role separation, not unrelated-driver ownership denial. Historical Trucker
receipt gallery/reload viewing remains unverified beyond selected-upload preview.
No new schema change needed. Keep POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false,
POD_PDF_ENABLED=false and Gemini unused until separately cleared. Do not deploy.


## GPS controlled-test PREPARATION checkpoint - October 17, 2026

User explicitly requested preparation only. Full checklist and technical token audit:
`docs/mapbox-gps-controlled-test.md`. No activation, live GPS writes, paid Mapbox/
Gemini requests, operational edits/DR333 access, Supabase SQL changes, deployment,
commits or pushes. Hostinger configuration untouched; all existing work preserved.

### Local fixes

- Location controller now flushes coalesced throttled fixes using a timer, retries
  recent failed fixes, rejects invalid/duplicate/delayed browser input, drops stale
  queued fixes and cancels pending timer/watch/fetch on stop.
- Watch setup failure cleans its created session. Failed server STOP retains exact
  session for explicit retry and prevents silently opening another. UI rechecks
  mounted scope and secure context. AbortSignal reaches actual tracking HTTP request.
- Active-map events during a fetch schedule a coalesced follow-up refresh; retained
  pins survive failures. Prior event/cache/session guards preserved.
- Added optional TRACKING_TEST_PROFILE_ID + TRACKING_TEST_ASSIGNMENT_ID (both or
  neither; invalid partial scope fails closed). Exact driver/assignment ownership,
  role/revision/RPC checks still apply. Scope gates starts/captures, filters management
  feed and route jobs, and skips global retention pruning. Safe owner/session STOP
  remains available after scope change. Actual .env scope is UNSET, flags remain off.

### Token / phone / database findings

Directions token remains identical to existing frontend public pk token. Directions
requires valid Mapbox token, not extra secret/admin scopes; it may technically work
with a public/default token. Actual restrictions/entitlement/access are unverified;
no live request. Recommend separate backend token for rotation/usage and no browser
origin restrictions blindly reused for server calls. Built frontend scan found no
Supabase service-role or Gemini secret value. Backend is the only Directions caller
in source. Existing public rendering token is intentionally browser-visible.

Read-only live GPS tables0/cache0, RLS/no anon/authenticated SELECT, no tracking
publication and service-only RPC EXECUTE verified. No new database change needed.
Phone LAN HTTP is not a valid substitute for trusted HTTPS; localhost points to phone.
Guide details trusted local TLS/origins/API/socket accessibility, exact account/trip/
assignment/stop approval, paid-budget consent, scoped flags/restart, no-auto-resume,
30second capture/15second poll/2minute stale behavior, confirmed STOP before disabling,
and separately approved exact-session GPS cleanup. Unexpected tab kill cannot
promise server STOP delivery. Scope mode deliberately does not globally prune data.

### Tests and files

- Backend157/157 serial full suite passes; frontend76/76 passes. Initial parallel
  backend run had2existing PDF timeout failures under load; serial rerun passes with
  unchanged15second safety limits. Both TS/builds, targeted lint and Git diff/cached
  checks pass. Existing Vite warning/old unrelated ReceiptReviewCard lint remain.
- New10truck/10trip/2stop simulation:10initial mock routes,0movement additional,
  2context-change additional,10hourly additional. Unauthorized/duplicate/out-of-order/
  invalid/stale captures denied; stopping one truck preserves others.
- Unit/HTTP/runtime fixtures cover scope denial/fail-closed/filter/no-global-prune,
  offline retry, pending permission/logout, watch failure and failed-stop recovery.
- Three browser fixtures pass: multi-truck map; explicit consent/pagehide/unmount/
  reload without auto-resume; event freshening/network loss/reconnect cache behavior.
  All GPS/API/Mapbox responses simulated. No real GPS acceptance claim.
- New files: backend/src/services/tracking-test-scope.ts,
  backend/tests/tracking-test-scope.test.ts, tracking-scope-runtime.test.ts,
  tracking-simulation.test.ts, docs/mapbox-gps-controlled-test.md.
- Modified: backend runtime/routes/.env.example/tracking-api test;
  frontend location-capture/api/tracking-api services, LocationSharing/
  useTrackedAssignments, location-pod test, tracking-controls/realtime browser tests;
  progress/activation/integration docs. No Hostinger files changed.

Exact resume: WAIT for explicit one-profile/assignment test scope approval, trusted
phone HTTPS setup, separately configured/verified Mapbox token and GPS/provider-spend
permission. Do not change flags or delete retained data under this preparation scope.
