# Mapbox GPS controlled acceptance preparation

October 17, 2026. **PREPARATION ONLY. No live GPS acceptance has been performed.**
Hostinger/deployment work is postponed and unchanged in this checkpoint. No
migrations, production coordinates, record edits, paid Directions/AI requests,
token changes or feature activation are part of this document.

## Current status and ownership

- POD_REVIEW_ENABLED=true, TRACKING_ENABLED=false, POD_PDF_ENABLED=false locally.
- Applied tracking migrations are already present; do not reapply them. No schema,
  Storage or publication change is needed for the prepared test.
- Latest position belongs to an exact truck assignment and authenticated driver
  profile. The parent trip and ordered remaining stops are read models for routing,
  not identities inferred from plate, dispatch, name or GPS text.
- Backend start/capture/stop use JWT + active app-session + TRUCKER role, then physical
  assignment ownership/revision and atomic service-only RPC checks. Admin/Staff
  active-map APIs require their roles. Truckers cannot access the company GPS feed.
- Read-only live inspection: both GPS/cache tables have RLS, no anon/authenticated
  SELECT or publication membership, and zero rows. Write/feed/route RPCs are
  service-executable only with fixed pg_catalog search path. No new grant is needed.

## Token findings: security boundary versus technical API access

- Backend MAPBOX_DIRECTIONS_TOKEN is set but equals the frontend public rendering
  token; it has a public `pk` prefix, not a secret `sk` prefix. Values were not printed
  or copied. Existing reuse is not evidence of valid server Directions authorization.
- Directions v5 accepts a valid Mapbox access token and does not document a separate
  secret Directions scope. A default/public token can technically call it; an `sk`
  token or account-management/download/upload privileges are NOT inherently required.
  This application uses only `/directions/v5/mapbox/driving`, not SDK downloads,
  uploads or token-management APIs. Do not invent a `directions:write` scope.
- We cannot confirm this token's actual account entitlement, revocation, restrictions,
  billing or usable Directions access without the account configuration and/or an
  explicitly approved request. No request was made. Inspect scopes/URL restrictions
  in the owner's Mapbox dashboard; do not send credentials to this conversation.
- Use separate tokens for browser rendering and backend Directions for rotation and
  usage attribution. Keep the backend value out of VITE/build inputs/logs. A separate
  server token may still be `pk` if it needs only public endpoints; unnecessary secret
  scopes add risk. Public browser rendering tokens remain intentionally observable.
- Restrict the browser token to approved local/production origins and only the map
  rendering permissions actually used. Browser URL restrictions can produce403 for
  server requests without an authorized origin; do not simply apply those same
  restrictions to the backend token or forge browser origin headers to bypass them.
  Confirm available server restrictions in the Mapbox account rather than assuming
  an IP allowlist exists. Use account monitoring, distinct token rotation and backend
  budgets. Application budgets do not prevent someone using a stolen public token
  directly outside the app; separate tokens/monitoring matter.
- The ONLY source-code Directions URL is the backend adapter. Frontend renders map
  tiles and receives authorized cached geometry. No frontend Directions request path
  was found. This confines the app's requests, not third-party use of public tokens.
- Credential scan: existing built frontend contains neither the configured Supabase
  service-role value nor Gemini key. Backend Directions value is present because it
  equals the already-public frontend rendering value; no unintended secret-scoped
  token was found. Replace the backend reuse through a separately approved local
  configuration step, never by changing the frontend token automatically.

Official sources checked:

- [Directions token requirements](https://docs.mapbox.com/api/navigation/directions/)
- [API scopes/default token behavior](https://docs.mapbox.com/api/overview/)
- [Token restrictions and server requests](https://docs.mapbox.com/accounts/guides/tokens/)

## Bugs corrected locally

1. Throttled watch callbacks previously depended on another GPS callback to flush a
   queued point. The controller now schedules the newest pending fix, bounded by the
   configured interval. Network failure retries a still-recent fix; stale pending
   points are discarded rather than submitted indefinitely.
2. Invalid/nonfinite/out-of-range/inaccurate, duplicate and delayed browser fixes are
   rejected before submission. Server/RPC validation remains authoritative. Do not
   deduplicate merely because latitude/longitude match: a stationary truck can
   legitimately send a later timestamp and accuracy reading.
3. Watch setup failure now stops the newly created session before showing failure.
   A failed STOP retains that session for explicit retry and does not silently open
   a replacement session. Local watches/timers and in-flight fetches are cancelled.
4. Capture AbortSignal now reaches the real HTTP request. Aborting transport cannot
   roll back a request the server already committed; STOP and session checks still
   protect later writes. Unexpected tab/process termination remains best effort.
5. The UI checks secure context before asking for location. Starting/replacing a
   controller rechecks the mounted scope; secure-context failure remains retryable.
6. Tracking refresh events received during an existing fetch are coalesced into a
   follow-up refresh, instead of being discarded until the next poll. Valid visible
   markers remain during transient network errors. Prior targeted cache invalidation
   and stale-session Socket guards are retained.
7. Added optional exact profile+assignment local acceptance restriction, described
   below. It is not configured and does not activate anything.

## Prepared local acceptance restriction

Backend `.env.example` now documents these optional settings:

```dotenv
TRACKING_ENABLED=false
TRACKING_TEST_PROFILE_ID=
TRACKING_TEST_ASSIGNMENT_ID=
```

- Both empty preserves ordinary role/ownership-restricted operation.
- If one is configured, BOTH must be valid UUIDs. Partial/malformed pairs fail closed.
- With both configured, only that profile can discover tracking capability/start or
  capture, and only for that exact assignment. Current driver/assignment ownership,
  revision, trip status and consent are still checked; the restriction grants no access.
- Admin/Staff GPS feed and route worker filter to the same assignment AND its current
  profile. Reassignment to another profile stops test processing. Pagination cursors
  still advance through bounded underlying pages.
- No unrelated route claims/provider calls are scheduled in this scope. The worker
  skips global retention pruning during scoped acceptance, preserving unrelated rows.
- Authenticated STOP remains permitted for a previously owned session even if it is
  outside the new scope, so scope changes do not prevent a safe stop. Ownership and
  exact session checks still apply. The global feature flag must remain enabled long
  enough to confirm STOP; turning it off blocks the API including STOP.
- These are private server settings, never client query parameters or UI overrides.
  Do not enable tracking globally with an empty scope for this single-driver test.

## Simulated coverage (no live Supabase coordinates)

| Scenario | Evidence |
| --- | --- |
| One truck across points | Browser controller queues newest fix, sends in order, drops delayed/duplicate/invalid input |
| Ten trucks/ten trips | In-memory repository keeps10 independent session/assignment/driver locations |
| Two ordered stops per trip | Route simulation keeps exact IDs/order; reversing stops changes only that assignment's route |
| GPS versus route refresh |10 initial mocked routes; movements add0; stop-order/assignment revisions add2; hourly interval adds10 |
| Network loss/reconnect | Capture retry/cancel unit tests; map retains last pin through failed read, reconnect fetches fresh value |
| Permission denial | No begin/watch/save on denial or invalid initial fix; no request before explicit click |
| Stop/session lifecycle | Watch cleanup, timer cancellation, late begin cleanup, failed-stop retry and stale session denial |
| Timestamp/duplicates | Server validation plus in-memory atomic contract tests reject duplicate/out-of-order/stale/invalid inputs |
| Unrelated users | Role/ownership fixtures deny other-driver reads/writes and Trucker management feed |
| Realtime | InitialGET1, commitGET1, network failureGET1, reconnectGET1; unrelated eventGET0 |
| Browser refresh/navigation | Synthetic pagehide invokes stop; unmount stops; reload never resumes automatically |
| Privacy/test scope | Profile+assignment restriction and feed/worker filtering tested; no global prune in test scope |

Browser fixtures mock ALL app API requests and browser GPS. Route adapter tests use
synthetic fetch responses, not Mapbox. Private live tracking tables remain empty.
Existing disposable PostgreSQL evidence covers actual atomic writer locks/RPCs;
this checkpoint does not rerun SQL fixtures against Supabase or change that schema.
Unexpected process kill/tab close cannot guarantee delivery of a final STOP request;
the browser may terminate networking before JavaScript cleanup completes. Last known
location remains until stop/retention, visibly stale after2minutes. This is an explicit
limitation, not a passing real-phone lifecycle claim.

## Real-phone acceptance prerequisites

### Accounts and exact records (must be named and approved later)

- One Admin observer (independent Staff optional) and one designated Trucker account.
  A separate unrelated Trucker account verifies denial; do not sign the SAME Trucker
  into two devices because the existing single-device session rule replaces it.
- Approved exact profile, physical assignment UUID, truck UUID/plate and trip UUID.
  Assignment must currently belong to that driver, have no unassigned_at, and reference
  a nonarchived/nonterminal trip. Do not use DR333 or alter any delivery record.
- Two already-authorized remaining stops, ordered by sequence then stable ID, with
  valid saved destination coordinates. Confirm that coordinates represent the intended
  destinations; missing/uncertain coordinates are a blocker, not a reason to geocode
  or rewrite stores without permission.
- No new trip/assignment/store is created by preparation. If no suitable test record
  exists, obtain separate explicit creation approval. Record baseline revisions and
  trip/stop/assignment hashes plus empty/nonempty exact GPS/cache row counts read-only.

### Phone and local network

- Supported modern browser, OS location enabled, correct automatic date/time, permission
  granted to the exact test origin and stable network. Use device location accuracy
  appropriate to the test; do not assume laptop GPS resembles outdoor phone GPS.
- Geolocation requires a secure context. Desktop `http://localhost`/loopback is a
  special trusted origin on THAT device. Phone `localhost` means the phone, not the PC.
  Accessing `http://192.168.x.x:5173` over Wi-Fi is generally NOT a secure context for
  geolocation. Do not bypass browser security with flags or assume LAN implies HTTPS.
- Prepare an approved LAN-accessible local HTTPS origin with a certificate trusted by
  the phone, including the chosen hostname/IP SAN; a dismissed certificate warning
  is not reliable secure-context verification. Local CA installation/private key
  handling and firewall exposure require operator consent. No tunnel or hosting is
  installed/activated here. Verify `window.isSecureContext` and navigator.geolocation
  on the phone before any Start click.
- Frontend API and Socket URLs must be reachable FROM the phone. `localhost:5000`
  compiled into Vite points at the phone. Prefer an approved local TLS proxy that
  forwards UI/Vite, `/api` and `/socket.io` through the SAME trusted HTTPS origin;
  HTTPS UI -> HTTP backend is mixed content and must not be relied on.
- Configure exact CORS_ORIGINS/SOCKET_ORIGINS and public frontend API/socket URLs for
  that local test origin, preserving current desktop origins as needed. Do not modify
  Hostinger deployment files for this. Do not expose service-role/token values or
  relax origins to `*`. Supabase Auth redirect changes, if actually needed, require
  separate approval; ordinary password login does not justify broad redirects.
- Keep portal foregrounded while moving. Browser lock/close/background suspension can
  pause GPS and timers; this is a web portal, not an always-on native tracking service.

Sources: [MDN Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API),
[MDN secure-context exceptions](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Controlled activation plan - DO NOT EXECUTE YET

1. Obtain explicit approval naming test account/profile, assignment, trip, stops,
   observation window, permitted GPS writes and Mapbox Directions request/spend budget.
   Include permission to send those coordinates/destinations to Mapbox. Exclude every
   unrelated trip and DR333. Do not treat this preparation request as that approval.
2. Configure a separate backend token privately; inspect account restrictions/access.
   No new secret/admin scope is necessary solely for Directions. Verify the existing
   public map token's approved HTTPS origins separately. Any live API verification
   request needs the approved spend scope; absence of one leaves authorization unknown.
3. Perform read-only schema checks: existing migration versions, service RPC EXECUTE,
   GPS table RLS/no browser grants/unpublished, assignment's exact driver/trip/revision,
   ordered remaining destination coordinates, exact test row baselines and count of
   other enabled sessions. Do not stop or delete other users' sessions. If unexpected
   data/grants/dependencies exist, pause and report, not run corrective SQL.
4. In local backend/.env only AFTER approval, configure BOTH exact test UUID settings.
   Keep TRACKING_ENABLED=false during configuration. Leave POD_PDF_ENABLED=false and
   POD_REVIEW_ENABLED=true. Restart and verify no GPS/route workers run with the flag
   false. No record edits or migrations are required for the scope guard.
5. After HTTPS/phone permissions/token and test scope checks pass, separately approve
   changing TRACKING_ENABLED=true and restart the local backend. The route worker can
   automatically call Mapbox when that permitted assignment has a fresh fix; budget
   approval must therefore come BEFORE this step, not after the first GPS submission.
6. On Admin, confirm only the scoped feed is shown and record process request metrics
   baseline. On TruckerA, reload the portal after backend flag changes (capability is cached per mounted view), then confirm only the designated assignment is offered. On TruckerB,
   capability false/start403 and no GPS permission prompt; do not forge identities.
7. TruckerA explicitly clicks Share my location and grants browser permission. Confirm
   server-created session and first valid fix before calling it shared. Never start
   browser capture from navigation alone. If multiple assignments appear unexpectedly,
   STOP and inspect scope rather than selecting an arbitrary one.
8. Observe a few points for the approved interval: default capture throttle30seconds,
   atomic DB minimum5seconds; latest pending fix flushes without another watch callback.
   No synthetic coordinates reach live Supabase. Compare correct assignment/trip ID,
   reported accuracy, capture time and Admin pin. Coordinate pairs need not differ
   while stationary; timestamp identity determines whether a fix is newer.
9. Admin refresh is event-driven with a15second polling fallback, not a guaranteed
   network latency SLA. Accuracy/last update and >2minute stale indication must be
   visible. Cached road follows ordered remaining stops; pins move independently.
   No invented straight line is a successful Directions route. Observe one approved
   initial route; use mocked clock for hourly/budget stress tests rather than paying
   for repeated calls or editing production destinations.
10. Brief approved network interruption: keep last valid map content, show unsuccessful
    save/location state, then recover to a fresh coordinate. No full page reload or
    clearing valid map should be required. Do not claim offline delivery is guaranteed.
11. Stop from the phone BEFORE leaving the test page; wait for confirmed stop. If
    STOP_CONFIRMATION_PENDING, retry while connected. Confirm exact session disabled
    and scoped feed empty. Turn TRACKING_ENABLED=false and restart backend immediately
    afterward. Never clear test-scope settings while the global flag remains true.
12. Confirm unrelated trip/stop/assignment hashes and GPS/cache rows match baselines.
    Record results without credentials, signed URLs or full GPS traces in Git logs.

### Immediate stop / recovery

Use portal Stop while connected, then disable flag/restart. Local capture is cleared
on unmount/pagehide/logout, with best-effort server STOP. Closing the phone tab alone
is not a guaranteed server-stop operation. If the phone is lost/offline, disable the
global flag locally to stop backend worker/new submissions, then seek an authorized
exact-session stop/cleanup operation. Do not bypass service ownership or delete
operational records. Disabling the feature does not erase previously saved locations.

### Retention and separately approved GPS cleanup

Only a latest fix per assignment is stored, not a trace history. Normal global
retention RPC removes stale latest locations after24hours and inactive routes after
7days; the worker invokes it about hourly when ordinarily enabled. Acceptance scope
intentionally skips global pruning, and disabled tracking runs no pruning. Retention
is therefore not a guaranteed wall-clock deletion while the feature remains disabled.

No test GPS DELETE endpoint is currently exposed. After acceptance, obtain explicit
approval for cleanup of the exact assignment/profile/session and its exclusively
owned route cache. Read baseline/current rows first, confirm sharing disabled and no
newer session/reassignment/lease, then use a reviewed transaction with locks and exact
UUID predicates through the protected backend/admin connection. Require the location
session UUID and expected revision, not just trip/plate/name. Delete the route cache
only if it was created exclusively by this test and has not been replaced. If another
session or preexisting data depends on it, STOP and reconcile; do not broad-prefix
delete, call global prune, or modify trips/stops/assignments/receipts. No cleanup SQL
has been executed or preapproved. Disabling flags is the current safe rollback.

## Remaining blockers and files

- No named approved test scope, real phone HTTPS/certificate configuration, separate
  backend token authorization or paid-provider/GPS-write approval exists yet.
- Live GPS, route quality, actual mobile accuracy and lock/close behavior remain
  unverified. Co-located marker interaction polish and the dashboard's500-record
  safety ceiling are known limitations, not demonstrated problems for ten trucks.
- Changed application paths: browser location controller/API abort propagation,
  LocationSharing lifecycle, active-map refresh coalescing, backend test scope and
  routes/runtime; `.env.example` documents scope placeholders only. Hostinger files
  and actual `.env` values are unchanged.
- New/extended tests: tracking simulation/scope/runtime/API, location controller,
  controls/realtime browser fixtures. See latest progress checkpoint for final counts.

Stop here and wait for explicit controlled activation approval.


## Final regression evidence

- Backend full suite:157/157 pass with `--test-concurrency=1` (86.55s).
  Initial heavily parallel run had154pass/2fail out of156 at that point: two existing
  synthetic PDF tests reached their15second limits under CPU contention. The later
  scope-runtime test increased the count to157. Serial complete suite passes with
  unchanged PDF limits; no timeout safeguard was relaxed or skipped.
- Frontend full suite:76/76 pass. Both TypeScript checks/builds pass. Targeted changed
  TS/TSX lint and Git diff/cached checks pass. Existing Vite chunk warning remains;
  unrelated ReceiptReviewCard lint baseline not changed/suppressed.
- Three isolated browser fixtures pass: tracking-controls (3start/3fix/3stop,
  pagehide/unmount/no-auto-resume), tracking-map (10trucks/10roads/20stops,
  cached geometry and fresh pins), tracking-realtime (retained pin on failed read,
  fresh commit/reconnect, unrelated event0requests). No production requests/writes.
- Read-only Supabase counts0/0 and privacy checks passed. Local flags false/false;
  test scope unset. No actual env or deployment files changed; no paid API or real
  GPS capture. Vite alone was started locally to serve mocked browser fixtures.
