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
