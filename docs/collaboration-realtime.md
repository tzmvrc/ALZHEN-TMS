# Spreadsheet collaboration checkpoint — October 16, 2026

## Sources and trust boundary

PostgreSQL remains authoritative. Socket.IO does not accept cell writes. The
existing protected REST endpoints write physical tables and return canonical
records. A response observer emits metadata only after a successful response has
finished. It captures `originalUrl` before mounted Express routers trim `path`.

`trips`, `trip_stops`, `trip_line_items`, `trip_truck_assignments`, `store_calls`,
and `billings` have row-lock-ordered `collaboration_version` values. Separate rows
have independent sequences; this is not a global commit counter. A rolled-back
write does not advance the persisted version. Existing CAS rules for flexible
cells/Transmittal references remain unchanged.

## Authentication and rooms

The server validates Supabase JWTs, reads the actual profile role/name, and applies
the existing Manila midnight and Trucker single-device session checks. It checks
session validity every 30 seconds and disconnects at token/session expiry.

- ADMIN/STAFF: management metadata and allowlisted spreadsheet table rooms.
- TRUCKER: their server-derived user room and trips with a current assignment.
- Generic canonical-record GET is ADMIN/STAFF only, UUID/source allowlisted, and
  returns only whitelisted spreadsheet fields. No receipt paths are returned.
- Presence accepts bounded cell identifiers/status only, never draft text.
- Origin allowlist, 16 KiB messages, packet/connection budgets, 12 explicit rooms
  per socket and heartbeat expiry bound resource use.

## Deployment

The existing Express HTTP server hosts Socket.IO. Configure `SOCKET_ORIGINS` with
exact authorized browser origins. The reverse proxy must support WebSocket
upgrades at `/socket.io`; both server and client use WebSocket-only transport.
Frontend may set `VITE_SOCKET_URL` and `VITE_SOCKET_PATH` for a proxy deployment.

For multiple backend replicas, configure the same private `SOCKET_REDIS_URL` on
every replica and explicitly set `WEB_CONCURRENCY` to the deployment replica
count. Startup fails when that count exceeds one without Redis. Each replica
also reads the existing Supabase publications for the six sources, providing
durable metadata invalidation. Redis carries interactive presence and confirmed
actor/field metadata across replicas. Do not claim multi-instance collaboration
without configuring/testing Redis; no real Redis cluster was tested here.

No service-role credentials or Redis URL belong in frontend configuration.

## Client reconciliation

One Auth-owned client reconnects/rejoins rooms and tears down on token/account
changes/logout. Table hooks show remote names/colors and advisory selection or
editing outlines. Heartbeats expire at 45 seconds. Presence is not a lock.

Confirmed writes and record refreshes reject lower server versions. A remote
confirmed edit to the selected physical cell shows the latest persisted value in
a nonblocking notice while leaving the draft untouched. Save still uses Enter or
blur; Escape cancels. No keystrokes are transmitted.

Canonical scalar values patch matching physical rows and cached report pages.
Related label/membership/sort changes and insert/delete/reconnect events use the
existing coalesced, draft-deferred page refresh. The coarse Supabase signal does
not trigger a duplicate page refresh for these six sources while the detailed
bridge is healthy. Other modules and fallback recovery retain their previous
signal handling. In-flight identical canonical reads and overlapping signals are
deduplicated. Trucker signals are deduplicated per socket/commit too.

Trucker assigned-trip reads reuse the existing token-scoped API cache (30-second
freshness, five-minute retained snapshot). Background updates retain valid rows
and defer while saving/uploading. The 30-second recovery poll remains because
not all Trucker dependencies are published; it is not a full-page loader.

## Live evidence and limitations

Applied only approved migration `20261016094657` (`collaboration_versions`), file
`backend/migrations/2026_10_26_proposed_collaboration_versions.sql`, SHA-256
`ADD1A74720680D48398665B7D6EA4D281BB6745AEAAC34DF1941E7FE015FD7C6`.
All six columns/triggers/checks and the helper ACL were inspected afterward.
Before/after counts: trips 6, stops 7, items 8, assignments 6, calls 0, billings 0.
No permissions/RLS/publications/views or business fields changed by that migration.

Two different real ADMIN accounts verified presence, same-cell conflict notice,
draft preservation, later-save-wins, 5.2-second stability and browser refresh.
Only explicitly approved DR 333 stop `76883550-70e8-4f64-b69d-f17b2120375b` was
edited, then restored. The sibling DR 111 value/version was unchanged. Successful
save-response measurements were 2253, 1307 and 2015 ms (including restoration),
not isolated Socket.IO latency benchmarks. A first failed notification test also
restored its temporary edit and led to the mounted-router regression fix.

Real TRUCKER JWT/socket accepted; forged ADMIN room request rejected and management
record GET returned 403. The assigned stop update reached its authorized API
response without a page reload in 4663 ms measured from initiating the staff edit;
the approved dispatch was restored again. Test versions/audit timestamps remain
as evidence; no audit history was erased. No deletion/upload/status tests touched
production data.

POD approval notifications are **not complete**: `pod_records` is not published
and service_role currently lacks SELECT; `driver_trip_updates` is also not
published. No grants/publications were changed. Current routes do not yet expose
the requested Requests-integrated approval workflow. GPS remains the existing
authorized milestone/event path; pin-only socket broadcasts are unfinished.

Operations/Transmittal/flexible-cell presence, shared formatting events, real
Redis delivery, token-refresh/revocation with real separate accounts, and a full
all-field conflict audit remain. Existing secure Supabase signals, flexible-cell
CAS, widths, permanent deletion and storage cleanup are preserved.

## Repeatable isolated tests

- Backend Node/tsx test suite includes auth, actual Socket.IO transport, protected
  record projection and mounted-router commit-observer tests.
- Frontend Node/tsx suite tests version rejection and canonical-read dedup/retry.
- `frontend/tests/collaboration.browser.js`: actual transport/editors with two
  synthetic accounts and in-memory persistence; presence, conflict, draft safety,
  last save, five seconds, reconnect and logout. Start its local fixture first.
- Existing persistence and Trucker loading browser fixtures remain applicable.
- Disposable PostgreSQL 18 tests cover six-table versions, rollback, helper ACL,
  forced-version rejection and two concurrent connections acquiring the same row.

Authenticated tests require manual local sign-in and explicit approval for the
specific temporary test record. Do not rerun live edits automatically.

## Phase 2B.5-C — shared design and durable invalidation (October 16, 2026)

Shared design reuses `shared_table_column_widths.design`; there is no second
configuration table. Protected GET `/table-layouts/:table/design` and PATCH
`/table-layouts/:table/design/:column` require ADMIN/STAFF. A patch contains only
validated appearance settings and an expected revision. Width and design writes
share the existing revision, so racing changes return 409 rather than overwrite
each other. Failed optimistic design drafts remain available for retry.

Successful backend layout writes emit `table:layout-updated` to the authorized
management room, with table/column/revision/event ID only. The existing Supabase
`admin_change_signals` feed also bridges `datasets:invalidated` into that room.
Both feed the same frontend topic/revision deduplicator. Neither exposes business
rows, receipt paths, or private profile fields. Trucker rooms do not receive
management signals. Existing Redis adapter support is retained; a real
multi-instance Redis deployment remains unverified.

Report grids apply shared order, visibility, pinning and column colors. Trips and
standard reports also persist existing cell formatting and the added safe font
family/size/italic controls. Tracker persists its existing bold/text/background
controls by stop identity. Operations preserves its existing column controls;
management grids use shared visibility and widths. Flexible Tables retain their
existing database-backed column definitions. This does not add font editors to
every management grid or replace existing flexible-table formatting ownership.

Incoming design snapshots are deferred during editing, modal drafts, resizing,
reordering and fill gestures where those interactions exist. Unified search is
marked refresh-safe: Enter can execute a server search while it retains focus,
without disabling draft protection on business inputs.

Applied exact approved migrations:

- `20261016121840` shared_table_design; source
  `backend/migrations/2026_10_27_proposed_shared_table_design.sql`, SHA-256
  `F8F3142EA55DDE8F2AB59CE456EADCFFFFB96D60B73C01D06B7D9E4D39BCA077`.
- `20261016121852` pod_view_service_read; source
  `backend/migrations/2026_10_28_proposed_pod_view_service_read.sql`, SHA-256
  `7168DC7E7D7AE6ABFAD8361F348E8577A1153223FD6F6E157F83C0F51DDFE25D`.

The POD change grants SELECT only on existing owner-security view
`vw_pod_drive_files` to service_role. The protected backend endpoint was exercised
with a real Admin session and returned success/zero rows. `pod_records` and
`pod_drive_files` still have no service-role/browser SELECT grant; their RLS,
policies and publication membership are unchanged. Existing metadata signals
cover their administrative invalidation. This does not implement POD approval,
its linked writes, or Trucker approval notifications.

Two real, different ADMIN accounts verified shared bold formatting, browser
refresh persistence, and remote font-size changes with an active unsaved draft.
The draft survived; Escape allowed the queued format to apply. The first measured
bold propagation was 5824 ms including database/API/refetch work, not isolated
socket latency. Only DR 333 test-row appearance was changed and restored. Its
dispatch/DR/quantity and all other business fields were not edited. The test cell
metadata was removed through the authorized API afterward; revision advanced
from 3 to 8 and width remained 178. Real STAFF-role format testing, remote
resize during drag, token-refresh/revocation and real Redis delivery remain.

## Phase D viewer rosters (October 17, 2026)

`table:viewers` is separate from cell presence. An authorized `room:join` sends
a roster of distinct profile IDs with names, signed avatar URLs and colors.
Redis adapter `fetchSockets` aggregates tabs/instances; no database table is used.
`table:heartbeat` refreshes membership; a silent socket expires after 45 seconds.
`table:expired` lets an active client rejoin through authorization. Disconnect and
`room:leave` update the previous table. Logout clears the frontend roster. A
server-initiated disconnect gets one delayed reconnect attempt; invalid credentials
remain rejected. Existing network retry and token-change initialization remain.

Only Admin/Staff may join table rooms. `users:staff` requires ADMIN. Flexible table
joins/rechecks reuse existing table view permissions. Roster payloads omit email,
role, expiry, private profile paths and draft values. The existing profile-picture
bucket signs avatar access; no public bucket/grant/policy was added.

The toolbar control shows three overlapping avatars and +N overflow. The popover
includes all current viewers, including self. This is advisory presence, not a
lock or persisted edit. Isolated real-transport/browser tests cover role denial,
multi-tab deduplication, table isolation, refresh, disconnect/reconnect, forced
server disconnect and silent expiry. Real two-ADMIN roster/image/fallback was
observed; real STAFF and multi-instance Redis remain unverified.


### Loading milestone invalidation (Phase D.2, October 17, 2026)

Loading Start/Finish now save an existing physical loading_reports record using
both report and trip IDs. loading_reports is a dependency of Combined/Trips,
Dispatch Monitoring and Dispatch pages; its existing secure change signal clears
affected cache entries and queues draft-safe refresh. These timestamps are
trip-shared (UNIQUE trip_id); unloading remains stop-scoped. No new publication,
grant, policy or migration was applied. Loading reports have no per-record
collaboration version, so these new cells do not announce a fabricated versioned
socket commit/cell-presence identity. Existing table-viewer presence is unchanged.
An isolated actual-editor browser verified refresh deferral during an unsaved
draft, followed by the current authoritative response after Escape, five seconds
and reload. This is not evidence of live two-account timestamp writes.

## Phase D.3 — management design and paged Operations (October 17, 2026)

Users and master-data grids now consume the existing shared column order, color,
visibility and left/right pin metadata as well as widths. Their cells keep stable
physical keys when reordered; sticky offsets use current visible pinned widths.
The common hook defers both design and width snapshots during editors/modals and
resize drags. Existing per-column CAS errors/retry remain. An isolated real
Socket.IO Admin/Staff fixture verified remote order/color/visibility/pins, reload,
draft preservation and deferred remote design during a drag.

Flexible Tables retain their existing definition-owned order/visibility and
manage authorization. Colors/pins use the same column's versioned settings rather
than a second layout definition. Existing flex_columns change signals refresh
authorized peers through the draft-safe gate; shared widths remain in the
existing company layout service. No font controls, grants or tables were added.

The new Operations page path uses the existing offload/report change signals and
API cache prefixes; no new Realtime channels/publication changes are needed.
Its actual-screen isolated fixture verified page-scoped selection, deletion page
correction, remote data refresh and preservation of an active remarks draft.
The SQL projection is still proposal-only; enable VITE_OPERATIONS_PAGINATION only
after explicit approval, application and read-only verification. This does not
constitute authenticated live pagination or two-account production verification.


## Operations pagination activation (October 17, 2026)

Supabase migration `20261017011210` applied the exact approved Operations SQL.
The page API is now the default for management navigation and preload; explicit
`VITE_OPERATIONS_PAGINATION=false` provides rollback. Existing report invalidation
prefixes and draft gates are retained. No publication, socket rooms or RLS
changes were required. The 102-record actual-screen fixture passed without
overriding the feature flag, including remote refresh during an active draft.
This supersedes the proposal-only status above.

POD expansion inspection: trip_images, trip_events and admin_notifications are
published. pod_records is not directly published but has the existing restricted
admin_change_signal trigger, as do trip_images and trip_events. Publication
changes are not assumed necessary. service_role currently lacks base POD SELECT
and all write privileges; browser access must not be broadened. Approval/
rejection audit, transactional notification deduplication, PDF intake and GPS
accuracy/capture ordering still require separate implementation and approved
schema changes. Existing OCR text review is not POD approval.


## POD review preparation and trucker notifications (October 17, 2026)

No Supabase publication, grants or policies were changed. Read-only inspection
confirmed admin_notifications is already published with authenticated SELECT
restricted by recipient_profile_id=auth.uid(). Receipt/POD writes already emit
restricted admin change signals; new audit/extraction/location tables are not
published by the proposals.

The existing privileged backend channel now consumes notification changes and
emits only a notice-ID/revision invalidation to the authenticated user:<recipient> room.
The frontend uses the existing Socket.IO connection and fetches only its own
protected notification API data. No message, image path or OCR travels in the
socket signal. Trucker reads/read-status writes now use the same recipient-scoped
controllers as staff; JWT/app-session role restrictions remain. No client-supplied
recipient ID is accepted. Duplicate events are deduplicated; reconnect causes
notification revalidation without reloading assignments/dashboard/routes.

Isolated real Socket.IO verified target recipient delivery, no unrelated recipient
leak, no sensitive payload and duplicate-event suppression. Browser fixture verified
1 initial notification read, 0 extra cached-open reads, 1 read for a burst of new
signals, mark-read and Escape. These are fixture measurements, not live-session
latency claims. Approval itself remains disabled pending the exact POD review SQL
approval/application. Its proposed atomic notification insert emits only after
commit; rollback cannot produce a false successful notification.

Tracking remains architecture/preparation only: the future endpoint must emit
minimal assignment/revision changes to authorized trip/management rooms, fetch
coordinates through protected APIs, and keep marker updates separate from road
geometry. No broad direct location SELECT/publication is proposed.


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

## Gated tracking transport (October 17, 2026)

The existing coordinator consumes trackingEvents only after confirmed GPS/stop/
route persistence and sends `tracking:changed` with assignment ID to management.
No coordinates, credentials, new room or direct browser database grant. Existing
Redis adapter distributes across replicas. Management consumers use bounded
token-scoped API reads; 15-second polling recovers missed events. Source context
changes wake the route worker; API hides obsolete geometry. Cell drafts remain
independent of marker updates. No new publication or live location event enabled:
TRACKING_ENABLED remains false, schema/RPC proposals unapplied. See
tracking-pdf-activation.md for exact approvals, evidence and remaining acceptance.
