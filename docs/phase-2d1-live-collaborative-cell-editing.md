# Phase 2D.1 — Live collaborative cell editing

Checkpoint: October 19, 2026. Implementation and isolated acceptance complete.
Authenticated production two-user acceptance has **not** been performed this phase.

## Architecture before and after

Previously the authenticated singleton Socket.IO connection carried selection
presence and confirmed-write metadata. Supabase supplied durable change signals;
authorized REST reads reconciled committed values. Draft text stayed local.

The same connection now additionally carries bounded, ephemeral scalar-cell
drafts. PostgreSQL, existing save APIs, record versions, Tracker compare-and-swap,
and confirmed-write reconciliation remain authoritative. No CRDT or automatic
text merge was added. Enter/blur still save; idle typing does not save; Escape
cancels. Draft packets cannot call a write service.

The frontend store subscribes by physical cell. Incoming text updates the matching
`CollaborativeCell` overlay, not report rows, query caches or table state. Local
text editors use a component buffer; report owners retain a current ref for save,
navigation guards and mentions. Tracker publishes its first dirty-state change
to the owner, then retains subsequent text locally until confirmation.

## Coverage and physical identity

| View | Draft identity / coverage |
| --- | --- |
| Trips, Combined, Dispatch Monitoring, Dispatch, Trip Booking, Store Calling | Existing report editing definitions map text, numeric, date/time and remarks cells to `trips`, `trip_stops`, `trip_line_items`, `trip_truck_assignments`, `store_calls`, `billings`, or `loading_reports` IDs and physical field keys. |
| Loading milestones | Exact `loading_reports.id`, never a stop ID. |
| Unloading milestones | Exact `trip_stops.id`; timestamp/date/seconds conversion remains unchanged. |
| Tracker | DR override uses `trip_stops.id/dr_number`. Other overrides use the existing `flex_columns.id` plus physical stop ID and `value`; no flex row/cell is created to start typing. |
| Standard report Transmittal Reference | Same authorized column/stop binding, with its own report scope. New read-only `/api/realtime/draft-tracker-columns` resolves existing column identities. |
| Operations | Dispatch and remarks follow the actual stop/trip save branch; Offload comments use the exact report ID; persisted item quantities/CBM use `offload_items.id`. |
| Empty standalone Offload item | Uses physical Offload parent ID and `item.quantity`/`item.total_cbm` child-slot key until a child row exists. Browser-generated pending UUIDs are not collaboration identities. |

The cell key is `[reportScope, source, recordId, field, boundStopId|null]`.
Stop identity is included explicitly for column-bound Tracker values. Globally
unique physical stop/item IDs isolate other stop-level cells; intentionally
trip-wide fields share one identity within the report. Display rows, dispatch
labels, DR labels, page indexes and row positions are never cell identities.

All hosts of the shared `ReportTextCellEditor` are integrated. Dropdown/relationship
search text is a lookup query, not the cell value, and is deliberately not sent.
Computed/protected columns, creator attribution and inaccessible fields are
excluded. Separate record/modal forms, master-data editors and custom Flexible
Table editors do not use this shared text editor and were not converted into live
text collaboration in this checkpoint. Their existing save-based behavior remains.

## Event contracts

| Event | Direction / purpose |
| --- | --- |
| `cell:edit-start` | Client to server, acknowledged after record/field/report authorization. |
| `cell:draft-changed` | Client to server to exact table room; latest unsaved value/phase, not persistence. Editing updates are volatile; saving/failure flushes are reliable. |
| `cell:edit-end` | Client cleanup with session ID and sequence; never claims a successful save. |
| `cell:edit-ended` | Server cleanup with socket/session/sequence/reason (release, replacement, expiry). |
| `cell:draft-snapshot` | Existing room join supplies bounded active previews, including reconnects. |
| `cell:edit-rejected` | Expired/revoked session: preserve local text and mark preview unavailable. |
| `draft:availability` | Relay readiness; pause previews if shared coordination fails. |
| `cell:committed`, `table:invalidated` | Existing confirmed persistence/version/invalidation path. |
| `cell:saved-notice` | Metadata-only competing-save awareness for existing versionless Loading/Operations/Tracker writes; no invented record version or canonical-record fetch. |
| `table:access-revoked` | Stop previews/room participation after access revocation. |

Start/change payload:

```ts
{
  target: { table, source, recordId, field, tripId?, stopId?, reportId? },
  sessionId: uuid,
  sequence: positiveSafeInteger,
  value: string,
  phase: "editing" | "saving" | "failed"
}
```

Server adds authenticated user ID, bounded display name, identity-derived color,
socket ID and expiry. Clients cannot provide those identity attributes. End packets
contain only session ID/sequence. Confirmed notices contain IDs/changed field keys
and authenticated actor metadata; never the typed text.

Default trailing throttle is **50 ms**, configurable through frontend
`VITE_CELL_DRAFT_THROTTLE_MS` (bounded 20–250 ms). Saving flushes immediately.
Payload text is at most **8,192 UTF-8 bytes**. Larger local input is not truncated
or saved automatically: preview ends with an explanatory local warning; the full
local value remains available to existing save validation.

## Authorization and lifecycle

- Existing Supabase JWT validation, profile-derived role, application-session and
  midnight/session-expiry policy protect the handshake. No authentication policy
  was relaxed. TRUCKER cannot join management report draft scopes.
- A closed source/field/report allowlist is checked server-side, then a read-only
  physical-record/parent ownership check. Archived records and converted
  Loading/Offload/Backload report sources fail.
  Tracker uses existing view/edit ACLs without initializing tables or cells.
- No arbitrary source/profile/password field is accepted. Draft room names alone
  are insufficient to send text. The current app is single-company; no new tenant
  model or claim of multi-tenant isolation was introduced.
- Default draft TTL is 15 seconds; heartbeat is 10 seconds while visible. Server
  expiry, disconnect, room leave, logout and component cleanup remove previews.
  Session/role/record permissions are revalidated on the existing 30-second timer;
  revocation is bounded by that interval, not asserted instantaneous.
- Sequence numbers and two-minute session tombstones reject delayed updates after
  end/cancel. Authorization generation checks prevent late authorization from
  resurrecting a cancelled editor. At most four active drafts per socket, 256
  session tombstones per socket, 64 snapshot entries, 256 remote client entries.
- Per-user typing budget: 60 packets/second plus per-socket burst protection and
  existing 16 KB socket payload limit. Cleanup remains available after the typing
  budget is exhausted. Cross-tab budgets share authenticated identity.
- Single-worker mode uses memory. Existing Redis adapter/budget coordination is
  reused only when configured; `WEB_CONCURRENCY>1` requires that adapter. Redis
  unavailability pauses drafts/fails closed. No Redis dependency/service was added
  for local operation; real multi-worker outage acceptance remains pending.
- Reconnect creates fresh editor session UUIDs, reauthorizes and supplies current
  room snapshots. Same-principal token refresh preserves local editing handles;
  account/role changes and logout clear them. No offline draft replay queue or
  persistent browser draft storage exists.

## Concurrent editing and save/cancel reconciliation

Each editor keeps an independent local draft. Other users see a colored unsaved
overlay/name; active local inputs retain cursor, focus and value, with the competing
draft shown separately. Multiple editors are represented compactly.

Confirmed competing saves create a nonblocking warning while retaining local
input. The existing standard-report notification also offers the latest persisted
value. No client-clock ordering or automatic merging was added. Existing database
save/version rules apply; in particular Tracker stale-version failures remain
failures requiring review, not silent overwrites.

Success removes the ephemeral editor only after the existing save API confirms;
failure retains text and shows a failed preview/error. Escape removes the preview
and restores confirmed rendering without a write. Local confirmed caches never
receive unsaved preview values. Existing durable-change deduplication and layout
revision handling remain separate from draft sequence numbers.

## Test evidence

- **208/208 backend tests passed**, zero failed/skipped. Includes actual Socket.IO
  transport with injected Auth/record access; field/source/role rejection, sequence
  ordering, same/different-stop drafts, expiry, disconnect, permissions revoked,
  cancellation during asynchronous authorization, cross-tab rate budget, and
  confirmed-only versionless save notices.
- **93/93 frontend tests passed**, zero failed/skipped. Includes throttle/final
  flush, 5,000 subscription isolation, stale/end tombstones, reconnect snapshot
  ordering, local conflict preservation, logout and oversized-preview behavior.
- Both TypeScript checks and production builds passed. PDF worker build copying
  remains intact. Vite retains its existing >500 KB chunk warning.
- New production files and changed ReportDataView/Operations/shared-editor/service
  files pass targeted lint. Full changed-file lint reports **7 pre-existing errors
  and 1 warning** in Tracker/Auth. Running eslint on their Git HEAD versions
  reproduced the same rules/counts (Tracker: control regex, state-in-effect;
  Auth: component-export, caught-error, state-in-effect, hook dependency). No
  unrelated lint refactoring or rule suppression was introduced.
- **13 unique isolated browser fixtures passed**:
  `live-cell-drafts`, `live-tracker-drafts`, `live-operations-drafts`,
  `live-cell-draft-performance`, `collaboration`, `report-edit-persistence`,
  `trip-time`, `loading-time`, `tracker-pagination`, `operations-pagination`,
  `shared-design`, `table-viewers`, `admin-realtime`.
- Direct collaborative fixtures use two independent browser contexts and the real
  Socket.IO transport at port 5199; authentication, REST persistence and Storage
  are synthetic. Letter-by-letter visibility, independent same-cell inputs,
  conflict notices, failed-save previews, five-second persistence, browser refresh,
  token refresh, reconnect and active-draft logout cleanup passed. Typing and
  cancellation issued **zero save API requests**; only two explicit successful
  saves and one deliberately failed request were attempted in the main fixture.
- Last measured remote preview latencies: **57, 117, 85, 82 ms**. In the mounted
  5,000-cell fixture, 100 remote updates painted in **29.7 ms**, with **zero table
  owner/unrelated-cell rerenders** during typing and **zero API requests**. These
  are local fixture measurements, not production network latency guarantees.
- Browser runner/setup issues (an unchanged repeat fixture value, obsolete status
  text selectors, a Vite module-identity mismatch, and renderer import shape) were
  corrected and rerun. An assertion expecting the raw server error was replaced
  with the actual safe API error and explicit failed-preview/data-preservation
  checks; no persistence or authorization assertion was weakened.

## Supabase, runtime and remaining acceptance

Read-only catalog inspection confirmed existing physical parent columns and
existing publication coverage, including `admin_change_signals`, trips/stops,
line items, assignments, Store Calls, Loading and Offloads. Existing column-bound
flex storage is reused. No database table, migration, RLS, grant, trigger,
publication or Storage change was required or executed.

No production trip/report/receipt/DR333 was edited; no live save/delete fixture,
GPS capture, provider request, deployment, commit or push occurred. Feature flags
were not changed: local whole-trip deletion/POD review retain their prior state;
tracking/planned routes/PDF remain disabled/default false.

The owned local backend was restarted through the existing `node --import tsx
src/server.ts` workflow. `/api/health` returned `ok`; startup confirmed one worker,
unchanged enabled local whole-trip deletion, and no shared Redis configuration.
This is local application readiness, not production authenticated acceptance.

Remaining acceptance: two approved live management sessions on an explicitly
authorized disposable record, and real multi-replica Redis failover/load testing
if that deployment topology is used. Browser fixtures do not prove those live
conditions. Separate custom/modal editors are outside this shared-cell scope.

## Files

- Backend: `config/cell-draft-fields.ts`; `services/cell-draft.logic.ts`,
  `cell-draft-authorization.ts`, `cell-draft-server.ts`, `collaboration-server.ts`,
  `collaboration-events.ts`, `collaboration.logic.ts`,
  `transmittal-tracker.service.ts`; `routes/realtime.routes.ts`.
- Frontend: `services/cell-draft.service.ts`, `collaboration.service.ts`;
  `components/admin/CollaborativeCell.tsx`, `cell-draft-context.ts`,
  `useLiveCellEditor.ts`, `useDraftTrackerColumns.ts`,
  `ReportSpreadsheetShared.tsx`, `ReportDataView.tsx`,
  `OperationsReportsView.tsx`, `TransmittalTrackerView.tsx`; `context/AuthContext.tsx`.
- Tests: backend `cell-draft.test.ts`, `collaboration-events.test.ts`, isolated
  collaboration server fixture; frontend `cell-draft.test.ts`, four new live-draft
  browser fixtures and updated legacy collaboration selectors.
- Documentation: this report, `collaboration-realtime.md`,
  `tms-table-overhaul-progress.md`.

## Focused follow-up � Single cell identity indicator

The selection-presence label and draft identity now share one renderer in
`CollaborativeCell`. ReportDataView supplies its existing selection peers; its
colored selection border and label styling remain unchanged. Users are deduplicated
by authenticated user ID, including multiple tabs. Tables without a separate cell
label use the same sole presence indicator. The unsaved overlay contains text only,
with draft state in metadata/tooltip; it has no separate username badge. Multiple
users remain identifiable through the existing compact count/name tooltip, which
also indicates whose draft is shown. Local inputs remain independent.

Verification: 95 frontend tests passed, including two new selection/draft identity
rendering tests; four isolated browser fixtures passed (standard shared grid,
Tracker, Operations and existing save/presence regression). TypeScript, build and
targeted lint passed; existing Vite chunk warning remains. The main two-context
fixture explicitly checks one identity indicator during letter-by-letter typing,
plus save, cancellation, failure, conflict, disconnect/reconnect and logout.
No backend transport/save change, Supabase change, live operational write, feature
flag change, deployment, commit or push was made for this follow-up.
