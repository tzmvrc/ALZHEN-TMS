# Phase 2C.4 — non-destructive deletion acceptance

October 18, 2026. **Whole-trip deletion remains disabled.**

## A. Verdict: READY FOR ACTIVATION REVIEW

The scoped local workflow passes acceptance tests after two narrowly scoped UI
fixes. This verdict permits review, not activation or production acceptance.
Dedicated-account Auth/session acceptance and actual shared Redis infrastructure
verification remain pending. No real password was requested or submitted anywhere.

Inspected the dirty worktree and Phase2C.2/2C.3 checkpoints. Preserved unrelated
changes; no index conflicts. MCP/backend project remains hdmknewarynwpbrhfgai.
Installed migration history verified, without reapplying anything:

- 20261018065149 operations_creator_attribution
- 20261018065157 driver_update_parent_compatible_cleanup
- 20261018065228 whole_trip_deletion

Local/process flags verified: whole-trip-delete unset(defaultfalse), trackingfalse,
plannedunset(defaultfalse), PDFfalse, PODreviewtrue. No remotely deployed process
or production environment is claimed to have been inspected; hosting is postponed.

## B. Password verification

Both reports use WholeTripDeletionDialog -> shared whole-trip client -> protected
Admin route -> shared deletion service -> request-local Supabase Auth verification
-> one atomic RPC. Password authentication occurs on the backend. The route drops
the sensitive body field before awaiting; password never enters SQL arguments,
audit, URLs, browser Storage, analytics, sockets or logs.

Server-derived email and original bearer determine identity, not submitted profile
fields. Supabase password sign-in uses a fresh non-persisting, non-refreshing client
with bounded8s provider fetches. Identity must match the Admin; only that temporary
verification session is signed out with explicit local scope. Original bearer,
application-session validity and current DB Admin role are rechecked afterward.
The copied/deduplicated frozen batch is captured before Auth; no reusable token or
client passwordVerified flag authorizes another batch. SQL rechecks Admin/blockers.

Automated tests cover correct/wrong/empty/missing password; expired/revoked session
before/after verification; STAFF/TRUCKER denial; wrong verification identity; role
changes; provider outage/timeout/rate limit; cleanup failure; repeat/overlapping
attempts; immutable trip selection; password clearing and disabled-feature races.
All Auth successes/failures are mocks; actual Express/SDK protocol tests intercept
all outbound requests. Real authentication acceptance is **pending**: no dedicated
account's password is available through a safe approved input channel. Existing
signed-in sessions, if present, do not establish password verification acceptance.

## C. Session preservation and limited fixes

Protocol tests forbid login/logout/setSession on the shared application Auth client
while permitting local sign-out of the isolated verification client. They pass;
original token/role checks remain stable. No application-session registration,
refresh replacement or global sign-out is performed. Browser cancellation/failure/
mocked success does not initiate Auth login/logout requests. Existing two-context
Realtime fixture passes user isolation, draft/selection preservation, reconnect
deduplication and logout cleanup. This is mocked session evidence, not a real Auth
policy/single-session/refresh-token acceptance result.

Two limited UI fixes:

1. Parent report deletion intent previously could remain mounted after an account
   change even though the child password reset. Shared useWholeTripSelection now
   discards pending trip IDs on account/role/bearer changes in both reports; returning
   to a former scope cannot resurrect the confirmation. Existing row selections
   retain their established page/account scoping.
2. During verification, all form controls are disabled. Focus now moves to the
   dialog container; Tab cannot leave it when no enabled controls exist. Escape
   cannot cancel an already submitted mutation. Normal Tab/Shift+Tab, cancellation
   and focus restoration remain supported; input is masked and labelled.

Token refresh conservatively discards pending destructive intent and requires a
new confirmation; it does not sign the user out or modify normal refresh behavior.

## D. Redis rate protection

Policy: five confirmation attempts per authenticated Admin per15minutes, with
same-Admin overlap prevention. Failed passwords count; missing-password requests
do not reach Auth. All replicas/tabs use the server-derived Admin ID. Redis Lua
atomically increments a fixed-window counter, sets TTL only initially, enforces
the budget and takes a120s NX lease. Compare-token release cannot clear a newer
lease. No password or deletion authority is stored in these keys.

Deterministic isolated Redis-protocol tests pass: sixth attempt denied, shared
replica/tab budget, concurrent requests, fixed-window expiry, stale-lease release,
connection/command failures and safe release after Auth errors. Redis failures do
not fall back to permissive local counters. Local limiter also fails closed when
WEB_CONCURRENCY>1 without shared Redis.

Actual configuration findings (no credentials printed): local SOCKET_REDIS_URL is
absent; process value absent; deployment backend template leaves it empty and
Compose specifies WEB_CONCURRENCY=1. No real production Redis instance is available
for acceptance. Mocked protocol is **not** a real Redis/Lua execution or multi-host
outage test. Actual Redis/TLS/ACL/expiry/reconnect checks remain an activation gate
for replicas. Independent hosts must explicitly use the same Redis even if each
advertises one worker. No Redis configuration was changed.

Leases are finite120s, not indefinite locks. Lease expiry can admit a later attempt;
stale release remains safe, the shared five-attempt budget still applies, and SQL
serialization/idempotent journals remain authoritative. Verify long-running request
and cleanup behavior in the intended topology before activation; do not claim an
unbounded distributed lock.

## E. Bulk selection and parent identity

Both actual report browser fixtures pass single/multiple selection, current-page
select-all, individual unchecking, Clear and inline row/unique-trip counts. Tracker
page changes clear selection; final-page deletion clamps safely. Combined uses
page-scoped displayed physical rows and returns to page1 after mocked success.

Three rows from two parent trips resolve to exactly two trip IDs. Same DR/dispatch
labels never merge distinct parents; sibling rows deduplicate to one trip. Invalid,
missing or stale physical IDs fail closed. Exactly20 unique trips are accepted;
21 are explicitly blocked without truncation or multi-request partial deletion.
Page scope never means all database rows.

## F. Preview, dialog, authorization and policy boundary

Installed preview is STABLE and its complete normalized body matches the reviewed
SELECT/count-only definition: ad699f3a5759073e1dc85b9af5cd1ecf. New deletion body
matches35abed0f197268e13b5a360612c3866f; it was inspected, **never invoked live**.
Compatible existing stop RPC MD5 is91fd1eaf57d95d3f646b58d5d2d4bdd6. RESTRICT NOT
VALID parent FK, owner/search paths/service-only ACLs match installation. Browser
authenticated users cannot directly execute either new RPC. Policy/publication
digests still match2C.3; private receipt bucket unchanged.

Read-only service-role preview deduplicated two copies of one real parent into one
trip, returned all28 impact count fields and can_delete=false (activation blocker).
No cleanup job created. Live catalog counts remain7trips,8stops,46driver-updates,
0orphans and0deletion-jobs. Financial/attachment/history blockers were tested using
disposable fixtures, not by creating live dependencies.

Preview covers stops/items/assignments, POD/transmittal flex bindings, loading/
unloading, cargo/items/receipts, driver history, tracking/cache, financial and
conversion/document/attachment blockers; retained review audit is identified.
It exposes IDs/dispatch/counts/blocker summaries, not private documents, GPS fixes,
credentials, recovery snapshots or Storage paths. Preview is informational. The
mutation independently rechecks role/ownership/retention under transaction locks;
a successful earlier preview cannot bypass a later financial or attachment block.

Dialog tests pass exact IDs/counts, cross-report parent-deletion warning, masked
password, blockers, disabled confirmation, duplicate-submit prevention, clear-on-
cancel/failure/account-change, no false success after API/network errors, correct
mocked-success count/toast, targeted cache invalidation and pagination recovery.

Authorization boundary: only one backend call site invokes the **new bulk** RPC,
behind Admin middleware, password guard and two application flag checks. Tests
prove a flag disabled during verification still prevents reaching SQL. STAFF and
TRUCKER cannot access Admin bulk controls or that endpoint. Owner/service_role are
privileged database identities; the application flag is not a database permission.

Existing transaction routes remain intentionally ADMIN/STAFF, under the previously
reviewed transaction policy: exact-stop deletion can remove its parent when no
sibling remains; a stop-less legacy parent may be deleted through that existing
workflow. The old RPC rejects stop-less deletion of a parent that still has stops.
These routes do not call the new bulk RPC or offer arbitrary multi-stop bulk
deletion. This phase did **not** add password/whole-trip flag enforcement to every
existing permanent-delete capability (including Offload). If the client wants a
global Admin/password rule for those established workflows, that is a separate
policy change requiring review; it must not be inferred from bulk acceptance.

## G. Final verification

| Check | Final result |
|---|---|
| Backend full suite | **187/187**,0failed/skipped/cancelled |
| Frontend full suite | **87/87**,0failed/skipped/cancelled |
| Backend/frontend TypeScript | Pass |
| Backend/frontend production builds | Pass; PDF worker included |
| Isolated browser fixtures | **10 passed**,0failed |
| New hook/dialog/client lint | Pass |
| Touched report-file lint |2existing Tracker errors,0new |
| Git whitespace/index checks | Pass; existing CRLF notices; no unresolved index |

Browser fixtures: scope isolation; password/focus/session handling; shared dialog;
Combined wizard/selection; Tracker bulk/page boundary; retained reports; secure
two-context Realtime; Tracker pagination; transaction deletion; Operations actions.
All API writes intercepted; no production requests used as successful deletions.

Disposable PG18: fresh whole_trip_phase24 installs the reviewed SQL **locally**,
repeats original FK regression, complete modeled whole-trip retention/financial/
attachment/ownership/rollback suite,15last-stop cases and3new 20-parent/21-parent/
preview-purity checks. Three synchronized driver/deleter races and two independent
whole-trip callers pass. Creator28-column/ACL comparison and repeat-install12-table
hash checks also pass in owned fixtures. Cluster stopped. These fixtures do not
model every production ledger, trigger or external consumer.

Existing Tracker lint errors are no-control-regex and react-hooks/set-state-in-
effect. Existing Toast hook-export warning/error from the wider2C.3 lint scope is
unchanged; Toast was not changed or relinted here. Existing Vite large chunks remain.
Backend has no configured ESLint task; TypeScript checks cover its changed tests.

## H. Remaining activation gates

1. Separate explicit approval to enable whole-trip deletion; none requested here.
2. Dedicated Admin authentication-only/session-refresh acceptance via safe input,
   including actual provider session/MFA policy. Never submit real passwords to a
   deletion endpoint for this non-destructive phase; no production account changes.
3. Shared secured Redis and real topology/failure/expiry/latency testing if multiple
   workers/hosts will run. Single-process local tests do not validate production.
4. Confirm legacy transaction/Offload policy boundary above with the client.
5. Approved designated disposable/test records, excluding DR333, for any later
   destructive acceptance; verify backup/recovery risk, journal monitoring, retry
   ownership and retention responsibilities. The2C.3 installation backup waiver
   is not a recovery point or authorization to delete.
6. HTTPS outside local development, protected service credentials and operational
   monitoring. Eight legacy attachment-bearing updates remain protected; no
   automatic cleanup/backfill or extra migration is proposed.

## I. Safety and changed files

No live trip deleted, operational record modified, Storage object deleted, new
live migration applied, RLS/grant/trigger/publication changed, feature flag enabled,
production destructive test, GPS/provider request, deployment, commit or push.
DR333 untouched. Tests may enable a flag only in isolated processes with mocked
RPC/Auth; the application configuration remained disabled throughout.

Limited source fixes: new hooks/useWholeTripSelection.ts, its integration into
ReportDataView/TransmittalTrackerView, and WholeTripDeletionDialog busy focus trap.
Tests expanded: deletion-password and HTTP session isolation; new Redis acceptance
tests; exact batch-limit unit assertion; Combined/Tracker/password browser cases;
new selection-scope browser fixture and disposable whole-trip acceptance SQL.
Documentation: this report and main progress checkpoint. No migration or deployment
file changed. Stop here pending review, not activation.
