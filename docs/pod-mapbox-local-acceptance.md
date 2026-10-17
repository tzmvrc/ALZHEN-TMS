# Local POD and Mapbox functional acceptance

October 17, 2026. Hosting/deployment is postponed. This checkpoint did not deploy,
apply migrations, upload production files, change POD decisions, collect GPS, call
paid providers or modify DR333. Both new feature flags remain false.

## Current verification evidence

| Area | Evidence | Remaining live coverage |
| --- | --- | --- |
| Admin POD access | Real Admin session: image rendered, saved OCR readable, Approve/Reject controls enabled, history readable | No new decision executed |
| Staff access | Isolated real Express/Auth/role middleware accepts STAFF receipt reads; service/UI/RPC fixtures cover decisions | Independent STAFF account needed |
| Trucker assigned trips | Real Trucker session reads five assigned trips; PDF/GPS capabilities false | New upload/resubmission requires approved record/write scope |
| Restricted receipt access | Real Trucker denied management receipt endpoint403; isolated unrelated-driver upload denied before Storage | Different unrelated Trucker account needed for ownership acceptance |
| Approval/rejection/audit | Backend and isolated UI tests: canonical identity, reason, retry/conflict, no false success; existing disposable RPC evidence retained | New non-DR333 decision sequence not authorized/executed |
| Notifications | Real Trucker reads existing notifications; recipient-room/read-status isolation and dedup pass fixtures | No new notifications generated; unrelated-recipient live test pending |
| Multi-stop/original preservation | Resubmission fixture preserves completed-stop milestones, DR and originals; live read-only before/after hashes unchanged | Approved receipt-only resubmission needed |
| Tracking | Isolated APIs, controls, ten-truck map, cache/reconnect/browser tests pass | No actual GPS or provider routing acceptance |

Read-only live receipt used with user permission:

- Receipt `62fa7830-7fb9-4ace-9921-0e3879b08d02`, DR111.
- Trip `ed329614-62d0-4d83-afbc-8c578fdb23d1`.
- Stop `cb9bf6f1-f6ef-439e-b7da-0046375f308d`.
- It is outside the previous DR333 trip. Status stayed PENDING; OCR444 characters.
  Private original362169 bytes; two reads produced identical SHA256. No signed URL,
  token or OCR body was printed. Admin test mounted the real review component in a
  temporary authenticated page with non-GET API requests blocked: zero attempted
  or successful writes. Controls/history were inspected without opening decisions.
- All image, stop, trip, POD, review-event and notification table content hashes
  matched before/after. No new receipt/test records were needed or created.
- This Trucker is assigned to the viewed trip. Its403 proves the administrative
  route boundary, not denial of a different driver's assignment. Do not conflate
  these two tests. Original-image historical viewing from the Trucker portal remains
  unverified; current portal preview covers the selected local upload. No new
  historical receipt gallery was implemented in this checkpoint.

## Real OCR observations

`frontend/tests/ocr-accuracy.browser.js` calls the actual browser Tesseract engine
through the actual preprocessing service, using generated canvas images only.
No image/OCR text is sent to Gemini or any business API; normal OCR engine/language
assets may download from Tesseract's existing CDN. No business image was scanned.

| Synthetic fixture | Engine confidence | Expected reference result |
| --- | --- | --- |
| Clear | 95 |2468 found |
| Blur5px | 51 |2468 missed |
| Rotated90degrees | 55 |2468 missed |
| Multiple DR lines | 95 |2468 and1357 found |
| No DR field | 95 | Neither test reference invented |
| Blank | 0 | Empty text |
| Invalid image bytes | n/a | Rejected; workflow error/manual fallback retained |

These are six synthetic cases, not a calibrated accuracy percentage or a client
document benchmark. Last run took600-1925ms per image, including first-worker setup.
Blur and rotation require an upright clearer photo or manual correction; no automatic
deskew/orientation feature was added. Low-confidence UI threshold is70. Multiple
references still require human verification regardless of confidence. OCR never
changes physical receipt/trip/stop identity or approves a document.

Manual correction/rescan/reload/five-second persistence/conflict-draft tests pass in
the real review component with isolated API responses. Invalid/blank scans do not
prevent original-image submission or manual review. Fixed ImageBitmap cleanup on
preprocessing fallback/error paths; worker termination remains in finally.

## Tracking audit and local fixes

- Backend MAPBOX_DIRECTIONS_TOKEN is present, but exactly equals the existing public
  frontend rendering token. No value was printed/copied. Configure a separate
  server-appropriate token before acceptance, confirm account/billing/restrictions,
  and obtain approval for any billable Directions verification request. Do not assume
  a browser-origin-restricted token authorizes a server request.
- Assignment IDs, authenticated driver profile, active trip/assignment revision and
  session ID are checked server-side. START requires consent, STOP targets only its
  session, writes are atomic and timestamps strictly ordered. Stale/duplicate/wrong
  assignment submissions fail. GPS capture asks browser permission only after click;
  logout/unmount stops capture and attempts server STOP.
- Current capture target is30seconds (minimum5s); dashboard fallback refresh15s.
  Stale indication starts after2minutes. Positions do not trigger a Directions call
  per fix. Route cache is per assignment/ordered remaining stop context, approximately
  hourly; changes invalidate context. Global SQL budget30claims/minute, process
  concurrency2 and bounded queue/retry/lease controls remain unchanged.
- Found/fixed a short-cache race: tracking events now invalidate only `/tracking/active`
  before a refresh; ordinary cache reuse could otherwise show a pre-commit fix until
  polling. Late events from replaced sockets now check active session ownership.
- Browser regression: initial GET1, committed update GET1, reconnect GET1, unrelated
  notification GET0. Ten-truck fixture: ten cached roads/twenty destination markers,
  pin-only updates preserve route nodes, stale indicator and exact-trip selection.
- Mock provider run: initial Directions10, GPS movement adds0, hourly refresh adds10,
  maximum concurrency2. Budget request31 is blocked before provider fetch. None of
  these calls reached Mapbox. Real GPS, latency and provider authorization unverified.

## Controlled live acceptance prerequisites (do not execute yet)

### Accounts and explicit record scope

1. Approved ADMIN and independent STAFF accounts in separate browser contexts.
2. TruckerA assigned to an explicitly approved test assignment/truck/trip and
   TruckerB with no access to it. Keep each Trucker on one active device/session;
   logging the same account into another device can intentionally replace its session.
3. Identify exact trip, assignment, stop and receipt UUIDs plus DR, expected dates and
   owner. Exclude DR333 and its previous receipt/trip from new acceptance.
4. For POD writes, prefer an already completed designated test stop: replacement
   receipt uses receipt-only resubmission and preserves DR/unloading milestones.
   **Initial receipt upload on an incomplete stop is also a delivery-completion action**
   in the current workflow. Do not treat that path as an isolated document-only test.
5. For GPS, parent trip must remain active (not Completed/Cancelled/archived), with
   current driver/truck assignment and known valid destination coordinates. Use
   at least two safe stops to verify order/isolation. A completed POD test stop plus
   another pending stop may satisfy both tests only if the user approves that exact trip.
6. User must explicitly approve any record creation, uploads, review decisions or
   resubmissions. The permission used here covered read-only receipt viewing; no
   decision-state changes were performed. Proposed future reject/approve steps must
   name the receipt, reason and final state. Audit/notifications are permanent history.

### Browser/phone and configuration

- Local flags remain POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false,
  POD_PDF_ENABLED=false. Gemini stays unused/billing-blocked. Do not enable PDF for
  image/GPS acceptance; it has a separate deployment-isolation gate.
- Desktop localhost is a trusted geolocation context. A phone's localhost refers
  to the phone, not this PC. Plain HTTP on a LAN IP is not a suitable secure origin
  for phone geolocation. Prepare an approved reachable trusted HTTPS development
  origin, valid certificate and exact allowed CORS/Socket/Auth origins. Do not deploy
  to Hostinger or create an external tunnel automatically for this test.
- Phone OS and browser location permissions must be granted; check auto date/time,
  accuracy and network. Keep the portal foregrounded. Do not promise tracking after
  browser closure, phone lock or suspension.
- Configure the separate backend token privately. Obtain explicit scope/budget for
  live GPS persistence AND any Directions request. Once approved, enable
  TRACKING_ENABLED=true locally and restart the backend. This switch enables the
  authorized tracking feature globally, not just the chosen trip; verify zero
  unrelated sharing sessions before the controlled run. Do not silently disable
  other users' sessions or alter their records.

### Expected observations

- Admin/Staff: original/OCR/review history visible; reject reason required; only
  confirmed decisions show success. Correct recipient gets one notification per
  decision; unrelated Trucker receives none. Repeated same request does not duplicate.
- Trucker: assigned trips load; correct stop selected; image preview and upload
  feedback work; OCR failure leaves manual review possible. Receipt-only replacement
  creates a new original and leaves the previous file/milestones/DR/sibling unchanged.
- GPS: explicit assignment selection when multiple; no permission request before
  Start; sharing only after consent; correct driver/assignment pins on Admin map;
  accuracy/capture time/stale label visible; normal fixes preserve cached roads;
  Stop/logout stops local collection and confirms session disablement.
- Use mock clock for hourly/budget/destination-change load tests; do not repeatedly
  call a paid provider or edit operational destinations merely to test invalidation.

### Rollback

Stop Location Sharing in the test Trucker session and confirm server STOP before
turning off the global feature. Then TRACKING_ENABLED=false plus backend restart;
keep PDF off and POD review as previously configured. Disabling the flag stops new
API activity but does not itself erase retained coordinates or receipt/audit records.
Do not delete originals, notifications or audit history to fake restoration. Any
test-data cleanup requires an explicit approved scope. No schema rollback is needed.

## Database and remaining gates

Read-only live inspection confirms private5MiB receipt bucket, service-only review
RPC, RLS/no authenticated SELECT on GPS tables, no tracking Realtime publication and
zero tracking/cache rows. No new grants/publications/migrations are needed for the
tested paths. Authenticated new decisions/notifications, real Staff/unrelated Trucker,
receipt upload/resubmission, GPS and actual routing remain pending approval/accounts.

## Verification summary / files

- Backend154/154, frontend73/73; both TypeScript checks/builds and targeted changed
  TS/TSX lint pass. Existing Vite large-chunk warning and unrelated ReceiptReviewCard
  lint baseline remain. Git diff/cached checks pass.
- Seven isolated browser fixtures: real OCR accuracy, tracking realtime, tracking
  map, tracking controls, receipt review, POD decisions and Trucker notifications.
  All production API writes are mocked or blocked. Only OCR accuracy uses the real
  OCR engine; review fixtures mock it intentionally for deterministic UI behavior.
- New files: this checklist, backend/tests/pod-permissions.test.ts,
  frontend/tests/ocr-accuracy.browser.js, frontend/tests/tracking-realtime.browser.js.
- Modified: backend/tests/pod-resubmission.test.ts (unrelated owner denial),
  frontend/src/services/ocr.service.ts (bitmap cleanup), collaboration.service.ts
  (session guard), components/admin/useTrackedAssignments.ts (targeted invalidation),
  progress/activation/integration documentation.
