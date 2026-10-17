# Tracking and PDF activation package

October 17, 2026. **The three exact approved migrations below are now APPLIED.**
Runtime tracking and PDF intake remain disabled pending configuration/isolation checks.
No live GPS fixes, PDF uploads, paid Directions/Gemini calls or POD decisions
were made during this implementation. DR 333 remains Approved/version 2.

## Approved files and applied order

All paths are relative to the repository. Recompute checksums immediately before
any separately approved application; stop on schema/project/checksum mismatch.

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `backend/migrations/2026_11_03_proposed_tracking_route_cache.sql` | `D70280C19A405665F4EE14D549ED631E753324C7C892BF700C0C633B1E83FA96` |
| 2 | `backend/migrations/2026_11_04_proposed_tracking_atomic.sql` | `1DD36954AA6C816AAF64955DF96D9C04911B0AF9C082FF03516B174EBFF03246` |
| Independent | `backend/migrations/2026_11_02_proposed_pdf_receipts.sql` | `3066E5B2A1773673BAEF8BFB06186A7F16555F6954510C495D9E5389A0183B03` |

Keep runtime flags false throughout application/postflight. Tracking schema and
atomic RPCs must both be ready before tracking is enabled. PDF is independent and
may be reviewed/applied separately. Do not apply extraction history, old POD read
grants or any other proposal as a dependency. Existing review migration is untouched.

## Tracking SQL purpose, access and data impact

The first proposal creates private assignment-keyed latest locations and route cache.
The second adds distance/duration and provider-budget counters plus six functions:

- `tracking_assignment_v1(uuid,boolean)` resolves physical assignment, trip and
  drivers.profile_id; optional locks serialize assignment mutation with GPS writes.
- `tracking_write_v1(uuid,uuid,bigint,uuid,text,double precision,double precision,double precision,timestamptz)`
  verifies current TRUCKER profile, assignment revision/owner/active trip, then
  atomically STARTs, CAPTUREs or STOPs the exact session. Captures must be recent,
  valid, strictly newer, and at least 5 seconds apart by server receive time.
  Another tab's old session cannot stop or overwrite a newer session. A STOP can
  disable its previously owned session after an assignment becomes inactive.
- `tracking_route_context_v1(uuid,boolean)` resolves ordered remaining stop IDs and
  store coordinates. Missing coordinates never become invented/geocoded points.
  Assignment/context token changes when assignment, destination or remaining order
  changes; ordinary moving GPS origin is excluded. Locks support late-response checks.
- `tracking_route_write_v1(uuid,text,uuid,text,text,bigint,jsonb,double precision,double precision,text)`
  uses revision/lease CAS, current context checks and a global advisory-lock budget
  of 30 Directions claims per minute across replicas. Lease expires after one minute;
  successful geometry is retained for about an hour; 429 backoff is five minutes.
- `tracking_feed_v1(uuid,uuid,integer)` rechecks ADMIN/STAFF role and returns a stable
  UUID-cursor page of at most 50 plus one sentinel. Only active owned assignments
  with enabled sharing/positions appear; stopped or reassigned positions disappear.
- `prune_tracking_v1()` removes latest-location rows after 24 hours without consent,
  fix or disable activity; removes inactive route caches older than seven days.
  No location history, operational trips/stops/documents or billing rows are deleted.

Tables have RLS and no anon/authenticated grants. RPCs are SECURITY DEFINER with
fixed pg_catalog search path and EXECUTE only for service_role (plus owner).
No existing browser privileges, policies or publications are changed. Backend JWT,
role and existing app-session guards precede every HTTP request. Client actor,
driver, coordinates-of-destinations and trip labels are never trusted as ownership.

The service-role read privileges required by current physical table queries were
confirmed read-only for profiles/drivers/trucks/assignments/trips/stops/images.
There is no reason to broaden browser SELECT to enable location Realtime.

Recovery: disable TRACKING_ENABLED and restart all workers/servers. Retain new
positions/routes for investigation within approved retention. Do not drop tables or
alter operational records as a rollback. Tables are additive with no live backfill.

## Tracking implementation and activation boundaries

- `/api/tracking/capabilities`: authenticated role-scoped availability.
- TRUCKER: GET `/assignments`, POST `/assignments/:id/start`, `/fixes`, `/stop`.
- ADMIN/STAFF: GET `/active?after=<uuid>` and `/metrics` (process usage counters).
- Protected writes use the atomic RPC, not separate read/update writes. Actor comes
  from validated Supabase JWT and current application session. Client IDs cannot
  choose a different driver. Latest locations/route geometry never travel in sockets.
- Existing Socket.IO management room receives `tracking:changed` with assignment ID
  only after successful persistence. Existing Redis adapter carries this across
  instances. No new socket connection or database publication. Protected API polling
  every 15 seconds recovers missed events/other-instance changes; same-page API reads
  deduplicate via token-scoped cache. The map is capped at 500 active assignments
  per snapshot; each DB request is bounded to 50+1, not unbounded history.
- Trucker opt-in controls choose exact current assignment (plate plus ID when more
  than one), request browser permission only on click, start the server session,
  throttle fixes to 30 seconds and stop on navigation/unmount/pagehide. Pending
  permission and late session responses are cancelled safely. Stale token responses
  do not populate another account. Browser close/phone lock can prevent final network
  STOP; no reliable background GPS is claimed. Stale badges and retention remain.
- LiveTripMap uses the existing Leaflet/Mapbox raster host and the shared active feed,
  one marker per assignment, independently colored GeoJSON roads, stop markers,
  accuracy/timestamps and stale state. Cached road layers stay separate from GPS
  pins; routine fixes never call Directions. Old straight-line/event trip markers
  are suppressed for trips represented by the new assignment feed.
- A bounded rotating worker checks one page per minute, plus coalesced change wakes.
  It refreshes relevant active routes about hourly; context changes immediately hide
  old geometry on the next authorized refresh and wake recalculation. SQL finalization
  refuses a route calculated for old destinations/assignments. Unknown coordinates,
  more than 24 remaining destinations or stale GPS skip Directions rather than guess.
- Directions adapter has two concurrent requests/process by default, 32 queued,
  timeout/response/geometry limits, sanitized errors and counters. SQL supplies shared
  request budgeting and leases. Driving routes are not truck clearance guarantees.

Activation requires separate SQL approval, schema/privilege postflight, a backend
`MAPBOX_DIRECTIONS_TOKEN` and explicit permission for real paid routing acceptance.
The existing public frontend raster token is not copied/fallback-used server-side.
Set TRACKING_ENABLED=true only after those steps; default and current local state
remain disabled. Origins/token restrictions and usage alerts need owner review.
Shared-coordinate truck marker grouping still uses the old map's behavior only for
legacy tracks; overlapping new assignment markers need clustering/spiderfy polish.
This is a known UI limitation, not a claim of complete map acceptance.

## PDF SQL and intake

The PDF proposal adds trip_images MIME/SHA-256 fields and exact trip/stop receipt
content uniqueness. It permits application/pdf on the EXISTING private trip-images
bucket, preserving the 5 MiB limit and existing image MIME types. It changes no
Storage policies, grants or publications, moves no files and backfills no documents.
Read-only live inspection still confirms private/image-only bucket and no new metadata.

Runtime is gated by POD_PDF_ENABLED=false. Prepared implementation includes:

- Existing authenticated driver receipt submission and exact trip/stop validation,
  plus protected `/truckers/me/trips/:id/pod/prepare` raster preparation. Oversized
  raw bodies return actionable 413 before upload processing. MIME/signature, encrypted
  and active-content PDFs are rejected; the real parser is also required.
- PDF.js 6.4.299 and @napi-rs/canvas 1.0.11 in a credential-free child process.
  Maximum two renderer processes, 192 MiB JS heap, 15-second kill, 5 MiB input,
  10 pages, 24 million raster pixels, 20 MiB raster bytes and bounded stdout. Eval,
  external fetch, active JS/actions and attachment processing are disabled/rejected.
  No shell commands from filenames/contents. Production must use an unprivileged
  container/account and OS memory/network limits: V8 heap is not a native-memory cap.
- Backend build copies the .mjs worker to dist; dependencies stay server-side.
  Original PDF is saved privately, never replaced by rasters; hash/MIME are attached
  only to the new receipt. Duplicate PDF conflicts do not return an old original as
  a newly owned upload, so compensation cannot delete an earlier document.
- Existing caller cleanup is restricted to its newly created object/receipt. Existing
  audit failure compensation remains; no broad-prefix deletion or document cleanup.
- Protected saved-page endpoint rechecks exact receipt/trip/stop and, for Trucker,
  current assignment and original uploader. ADMIN/STAFF may read linked historical
  receipts. Six preparation requests/actor/minute plus two renderer slots/process.
- Portal capability enables PDF picker/preview only after activation. Prepared PNG
  pages feed the existing browser Tesseract engine sequentially in ONE worker,
  with combined bounded text/progress/confidence. No AI request is automatic.
- Existing receipt review uses private original PDF iframe/full-size link, protected
  raster re-scan, manual fields, optimistic OCR versions and ordinary Gemini consent.
  Saved OCR feeds the existing backend Gemini interpretation if billing is restored.
  No schema/history is required just to save OCR through the existing versioned API.

Recovery: disable POD_PDF_ENABLED/restart. Keep originals and metadata. Do not remove
PDF from bucket allowlist or drop fields while uploaded documents depend on them.
Deployments need HTTPS geolocation and CPU/native-memory limits, and should verify
their browser's private PDF viewer; iframe presence is not a cross-browser viewer test.

## Test evidence and remaining acceptance

- Backend 146/146; frontend 73/73. Both TypeScript/builds pass. New/changed targeted
  lint passes; two previously documented ReceiptReviewCard baseline errors remain.
  Existing Vite large-chunk warning remains.
- Real renderer processes rendered a synthetic two-page PDF to PNG; malformed,
  oversized/page-budget and cancellation tests pass. A real service + isolated
  DB/Storage fixture saves PDF MIME/hash and exact stop, preserves milestones and
  originals, and rejects repeated content without a second upload.
- Actual browser fixture: original PDF preview element, one authorized raster read,
  two pages through one mocked Tesseract worker, terminated worker and manual review
  save. Actual Tesseract recognition quality and native viewer behavior on real PDFs
  remain post-approval acceptance items; no private client PDF was used.
- HTTP test uses actual Express Auth/app-session/role middleware with isolated JWT/
  DB fixtures: unauthorized/role-denied/disabled paths, server-derived actor, start,
  fix, stop and bounded management feed. Browser controls test verifies no collection
  before click, start/stop, two fixes and automatic stop on unmount.
- Disposable PostgreSQL 18 compiled both tracking proposals and checked replacement
  sessions, exact stop order, stale captures/revisions, unrelated actor denial, browser
  RPC denial, route lease dedup, changed destination rejection and feed role/bounds.
  Two independent local SQL writers of one timestamp: one true, one false, no duplicate.
  Databases tracking_atomic_20261017 and tracking_atomic_final_20261017 are synthetic
  only. This was pre-activation evidence; the approved application results below supersede it.
  Final locked/FK schema variants tracking_atomic_locked_20261017 and
  tracking_atomic_fk_20261017 also pass. The parent trip lock was verified against
  a concurrent FK-checked new-stop insert: it waits/times out instead of creating
  a phantom destination during route finalization. An initial timing harness read
  buffered stdout after the lock was released; corrected to observe PostgreSQL's
  actual locked/sleep state before starting the second writer. Final concurrency
  result passes without sleeps in application code or production writes.
- Mock Mapbox/store tests: 10 initial route requests, 0 for pin movement, 10 hourly
  refreshes, maximum concurrency 2. Actual Leaflet fixture shows 10 trucks/roads and
  20 destinations, retains route nodes on pin movement and selects exact trip.
- Existing POD decision, OCR/image review, Trucker notifications and Operations
  pagination browser regressions pass. DR 333 was not modified/retested live.
- At that earlier checkpoint, no real GPS writes, provider Directions/Gemini calls, migrations, Storage settings,
  policies/publications, commits or pushes were made. Gemini remains blocked by known HTTP 402.
- npm audit reports one critical proxy-addr advisory; version 2.0.7 is identical in
  HEAD and current lockfile, not introduced by PDF dependencies. No unrelated audit
  fix was applied; review separately before production release.

Recommended next step: review the exact two tracking proposals together (base then
atomic), and the independent PDF proposal. After separate approval and safe
postflight, activate each independently and run approved GPS/PDF acceptance fixtures.
Do not enable either feature against missing schema. Expanded Phase D remains
incomplete until approved live integration, deployment isolation and remaining
cross-account/marker UX checks are completed.


## Approved application checkpoint - October 17, 2026

All three file SHA-256 values in the table above were recomputed and matched the
explicit approval immediately before each application. MCP project reference
`hdmknewarynwpbrhfgai` matched the backend SUPABASE_URL host. Read-only preflight
confirmed absent proposed objects, expected dependencies and no migration conflicts.
The exact files were applied without edits, sequentially, with postflight before
proceeding to the next file:

| File | Applied version | Result |
| --- | --- | --- |
| 2026_11_03_proposed_tracking_route_cache.sql | 20261017033055 | Succeeded, recorded once |
| 2026_11_04_proposed_tracking_atomic.sql | 20261017033115 | Succeeded, recorded once |
| 2026_11_02_proposed_pdf_receipts.sql | 20261017033128 | Succeeded, recorded once |

### Live read-only postflight

- Both tracking tables have RLS, zero rows and no anon/authenticated privileges or
  policies. Neither is published. Service role has the migration/default service
  privileges; all six RPCs are SECURITY DEFINER, fixed pg_catalog search path,
  service-executable and not executable by anon/authenticated. Inspected signatures,
  constraints, foreign keys, route budget/lease fields and retention implementation
  match the approved SQL. No live GPS, pruning or route-claim RPC was invoked.
- Bucket remains private with 5242880-byte cap. MIME allowlist is exactly PDF,
  JPEG, PNG and WebP. Receipt MIME/hash columns are nullable; all nine existing image
  rows retain NULL metadata, with no backfill. The approved partial unique content
  index and MIME/hash checks exist. Storage policies and publication list are unchanged.
- Before/after hashes match for all trips (6), stops (7), assignments (6), images
  (9, excluding the two new NULL columns), POD records (1), POD review events (2)
  and notifications (2). No operational information changed. Operations view still
  reads 11 rows, Tracker 6; the existing review RPC remains service-only.
- DR 333 was not modified or decision-tested again. Extraction-history and other
  unapproved migrations were not applied. No production PDF upload, GPS collection,
  paid Directions or Gemini request was made.

### Runtime decision and exact blockers

- `TRACKING_ENABLED` remains false (unset is also false). Private backend
  `MAPBOX_DIRECTIONS_TOKEN` is absent. The frontend public rendering token was not
  copied or used as a backend credential. Directions API authorization is therefore
  unverified; no paid verification request was made.
- `POD_PDF_ENABLED` remains false (unset is also false). The actual compiled worker
  and native canvas successfully rendered two synthetic pages on this Windows host.
  The 5 MB / 10-page / 24-million-pixel / 15-second / output limits, credential-free
  child, cancellation and failure cleanup are tested. However, no deployed
  unprivileged renderer account/container, native-memory cap or OS network isolation
  has been verified. V8's heap limit is not a native-memory limit. Keep intake off
  until those deployment controls and private original-document rendering are verified.
- Existing POD_REVIEW_ENABLED=true is preserved. No flag changes or backend restart
  were needed because neither new feature met its activation prerequisites.
- Gemini remains blocked by HTTP 402. Tesseract/manual review remain usable; no retry.

### Repeated verification after migration

- Full backend suite 146/146; full frontend suite 73/73. Backend TypeScript/build,
  copied renderer worker, frontend TypeScript and Vite build pass. Vite retains its
  existing large-chunk warning. Targeted tracking/PDF module lint passes. The two
  previously documented ReceiptReviewCard Hook lint errors remain (lines 92, 212);
  that file was not changed in this activation checkpoint.
- New disposable PostgreSQL 18 databases: tracking_activation_20261017,
  pdf_activation_20261017, pod_pdf_activation_20261017. Tracking RPC fixture checks,
  two concurrent GPS writers (one true, one false, one latest row), PDF MIME/hash/
  duplicate-content/sibling checks, and POD review RPC checks with PDF schema pass.
  Review retry/conflict, notification rollback and downstream-state preservation pass.
  All test records are local synthetic fixtures. The owned cluster was stopped afterward.
- Seven isolated browser fixtures pass: tracking-map, tracking-controls, pdf-review,
  receipt-review, pod-decision, trucker-notifications, operations-pagination.
  Ten mock truck routes and twenty destinations remain intact on pin updates; zero
  Directions calls. PDF manual review uses two pages in one mocked Tesseract worker.
  Operations uses 102 synthetic rows, cross-page search and safe deletion correction;
  cached return adds zero requests. Notification cache reopen adds zero reads.
- Authenticated live GPS, private PDF upload/OCR/decision and mobile native-viewer
  acceptance are NOT performed. Existing successful live image-POD acceptance is
  historical evidence, not a new PDF or tracking acceptance result.

### Rollback and resume

Set TRACKING_ENABLED=false and POD_PDF_ENABLED=false, then restart the backend if
previously enabled. Leave applied tables/RPCs, documents and metadata intact; do not
undo schema or bucket MIME support while dependent clients/documents may exist.

Next: configure a private backend Directions token without printing it; verify its
API restrictions with an explicitly approved routing scope. Verify deployment OS
renderer limits, then activate each flag independently and restart through npm run dev
(or the deployment's normal process manager). Obtain explicit authorization for a
safe test assignment/driver GPS session and synthetic private PDF acceptance records.
No further SQL or publication changes are currently required for these prepared paths.


## Configuration and renderer safety checkpoint - October 17, 2026

No migrations, Storage settings or flags were changed in this checkpoint.

### Mapbox configuration readiness

- Backend expects only MAPBOX_DIRECTIONS_TOKEN; it is absent in backend/.env.
  Frontend VITE_MAPBOX_ACCESS_TOKEN is present for public rendering and is not a
  backend fallback. Both .env files are ignored. No credential values were printed.
- Authorization for Directions is unverified because the backend token is absent.
  No Mapbox Directions request was sent. Local configuration steps:
  1. In the Mapbox account, select/create a separate token appropriate for server
     Directions requests, with necessary access and active account billing.
  2. Edit backend/.env locally and set MAPBOX_DIRECTIONS_TOKEN to that token. Keep
     TRACKING_ENABLED=false. Do not put it into frontend/.env or a VITE_ variable.
  3. Check its restrictions in the Mapbox dashboard. Browser-origin URL restrictions
     may reject server requests with 403; do not assume the existing rendering token
     is suitable or add unnecessary secret/admin scopes.
  4. Restart the backend using npm run dev from backend (or the real deployment's
     process manager). Obtain approval for a controlled Directions verification
     request and a designated driver/assignment GPS test before live activation.
- Existing safeguards inspected: process concurrency 2 (configurable 1..4), queue32,
  30 requests/minute/process, SQL global advisory-lock claim budget30/minute across
  replicas, one-minute route lease, hourly cache, changed-context rejection, timeout
  15s, bounded response1MiB/20k coordinates, preserved geometry on failures/backoff.
  Added mocked test proves request31 is blocked before fetch and the minute resets.
- Official configuration references: https://docs.mapbox.com/api/navigation/directions/
  and https://docs.mapbox.com/accounts/guides/tokens/ . No paid verification performed.

### Renderer improvements and deployment blocker

- Parent now rejects empty/oversized input and invalid caller limits before spawning.
  Caller page/pixel limits are passed to and enforced by the worker, capped at
  10 pages and 24 million pixels. Original input limit remains 5242880 bytes.
- Parent validates the child JSON structure, page count, dimensions, canonical
  base64, PNG signature/IHDR dimensions and total raster/pixel budgets. It no longer
  assumes a successful child exit makes arbitrary output valid.
- Timeout/cancellation/output overflow forcibly terminates the child with SIGKILL,
  clears buffered output and releases its slot after close. A cancellation race
  between spawn and listener registration is covered. Canvas/page cleanup and PDF
  task destruction now run on failure as well as success.
- Preserved two-child concurrency, credential-free environment, 192MB V8 heap,
  15s timeout, 28MiB protocol/20MiB raster budgets, fetch denial, disabled PDF JS,
  rejected attachments/active documents and private signed original access.
- Actual compiled worker is copied into dist and renders two synthetic pages with
  native canvas on this Windows host. This is NOT verification of another deployment.
- No Docker/Compose/hosting/PM2/system-service deployment manifest was found in the
  repository. The child inherits the backend OS identity/filesystem privileges;
  application fetch denial is not an OS egress sandbox and V8 heap does not cap
  native canvas memory. Deployed restricted identity/filesystem access, native-memory
  cap and network isolation are not demonstrated. POD_PDF_ENABLED remains false.
  Deployment location/configuration was requested to complete that assessment.

### Verification and resume

- Backend 150/150, frontend 73/73; both TS checks/builds pass. Targeted changed
  renderer/intake/tests lint passes. Existing Vite chunk warning remains; previously
  documented unrelated ReceiptReviewCard lint errors were not changed or suppressed.
- Four renderer tests cover actual synthetic rendering, malformed PDF/page budgets,
  caller budget/input rejection, invalid child output and in-flight abort with slot
  recovery. A separate compiled-dist smoke test passes. PDF review browser fixture
  passes with mocked Tesseract and no production writes.
- Read-only live check confirms the three previously applied versions, empty private
  tracking/cache tables, no tracking publication and private PDF/image bucket5MiB.
  Controlled browser has only about:blank, with no authenticated account available;
  authenticated read-only UI checks remain pending. No GPS/PDF writes, DR333 changes,
  Gemini calls, paid routing, commits or pushes. Git diff/cached checks pass.
- Changed this checkpoint: pdf-renderer.service.ts, pdf-renderer.worker.mjs,
  pod-intake.service.ts (comment), pdf-renderer.test.ts, tracking-services.test.ts,
  and activation/progress/integration documentation. No schema changes required.
- Keep POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false, POD_PDF_ENABLED=false.
  Next: private Directions configuration, actual deployment sandbox verification,
  then explicit authorization for safe driver/GPS, routing and synthetic PDF live
  acceptance. No further Supabase migration approval is currently needed.


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
