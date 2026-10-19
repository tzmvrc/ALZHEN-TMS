# Phase 2D.2 - One-load Users and report UI

Checkpoint: October 19, 2026. Local implementation and isolated verification completed.
The pre-existing Phase 2D.1 worktree, collaboration UI fixes and operational workflows were preserved.

## 1. Users loading architecture

Before: the Users component independently loaded managed accounts, two role-specific
profile lookups, and category/filter-dependent trucker pages. Category changes could
reset the table loading state. Opening a trucker cleared the available detail first,
so the modal could show a full loader despite already having summary/cache data.

After:

- One directory orchestration uses existing `/users` and `/truckers` responses.
  ADMIN uses managed-account profiles for both Admin and Staff; the two extra
  role-profile lookups are unnecessary. STAFF reads only its authorized trucker endpoint.
- The trucker directory is fetched in bounded pages of 100 with the existing API
  cache. All loaded pages are shared across category, search, status and assignment
  filters. No new endpoint or parallel cache store was introduced.
- Fresh source responses use the existing five-minute TTL. Synchronous navigation
  may use a five-minute stale grace while revalidating. Unchanged mounts still call
  the cache layer, which returns cached values without HTTP requests.
- Category/filter changes do not retrigger the directory effect. The current
  Admin & Staff / Truckers grouping and management/modal design are preserved.
- Trucker Details opens immediately from cached detail or known list fields.
  Only `/truckers/:driverId` supplies missing vehicle/assignment/history information;
  reopening uses its existing cached response. Additional loading/failure feedback
  stays inside the populated modal rather than replacing it.
- Dashboard initialization warms Users when Users is the active feature, using the
  same deduplicated source requests as the component. It does not eagerly download
  the directory on every unrelated tab, preserving the existing per-tab preload policy.
- Search/filter/category preferences use a separate token-scoped screen-state key,
  so invalidating `/users` does not accidentally reset navigation preferences.

### Invalidation and security

Create/edit operations invalidate existing account/trucker caches. Authorized
profile, driver, trip, stop, assignment and truck change signals reconcile the
mounted directory; open Trucker Details refreshes through its own endpoint. A
removed account closes its details modal. Refresh failure retains visible data.
User-edit dialogs defer background reconciliation while a form is active.

Existing token-scoped API keys, session-generation checks, Auth cache clearing on
logout/account/role changes, and midnight expiration are reused. No auth rule or
session lifetime changed. ADMIN-only account editing is hidden from STAFF; STAFF
continues to have the backend-authorized trucker detail access. TRUCKER cannot
request a management directory. No passwords or sensitive data were persisted by
this feature.

## 2. Report toolbars

- Shared-grid, Operations and Tracker selection actions are absent without a valid
  selection. Existing selection/checkbox state remains authoritative; hover does
  not select rows. Unsupported multi-row Edit remains disabled.
- Visible Clear Selection buttons were removed. Rows remain deselectable through
  their individual or page-header checkboxes.
- Existing role guards, physical-record checks, confirmation dialogs and deletion
  safeguards remain intact. Tracker whole-trip deletion remains ADMIN-only;
  authorized STAFF can edit a selected Tracker record.
- Tracker receives the existing Reports navigation control through `toolbarLeading`.
  It is the only control on the left. Search, exact-table viewers, selected-row
  actions, Prepare Sheet and Export occupy the right; Export is last. Search and
  export implementations were retained. There is no second navigation control.

## 3. Trip Details column

`report-action-columns.ts` registers one canonical `trip_details` action column for
Trips and Combined Report. It is appended at the far right by default and is not
forced to be pinned. Duplicate registrations are removed.

The column enters the same existing column array used by shared widths, resize
handles, drag ordering, visibility, column colors, cell text/background formatting,
automatic left/right pinning, Column Finder and header context menus. Existing
revision-based shared-design storage and Socket.IO transport are reused. Layout
changes survive refresh and synchronize between authorized users.

Each cell has an accessible eye/View Details link derived strictly from UUID
`trip_id` and optional `trip_stop_id`. Sibling-stop rows link to their common parent
with distinct stop context. Invalid identities show Unavailable. Unmodified clicks
use existing navigation callbacks; modified clicks retain normal link behavior.
Action clicks do not enter editing or toggle selection. The action has no editable
field mapping and is excluded from data sorting; exports remain based on business
columns. Existing three-dot column menus and visual-card actions were preserved.

## 4. Reports one-load behavior

The existing report-page caches, in-flight deduplication, targeted invalidation,
feature preloading and retained report panels already implement the needed behavior.
They were reused, not replaced. Toolbar selection/layout changes do not become data
query inputs. Hidden retained panels pause effects/presence while keeping table
state; visible panels resume authorized reconciliation. Opening Trip Details does
not invalidate report data. Active drafts and deferred resize reconciliation remain
unchanged.

## 5. Measurements

These are actual local fixture measurements, not production benchmarks. No timed
before-change browser baseline was captured; the before/after description above
comes from inspected code, not invented timing or request numbers.

| Check | Observed result |
|---|---|
| Initial one-page Admin directory | 2 HTTP requests: managed accounts + trucker page |
| Six category switches | 0 additional directory requests; 552 ms total in final run |
| Reopen populated Trucker Details | 0 requests |
| Return to Users | 0 directory requests |
| Intentional profile/driver invalidation | Open modal and list updated; removed account closed modal |
| 10 concurrent directory callers, two trucker pages | 3 total source requests: accounts + 2 pages |
| Operations return to cached page | 0 requests; fixture contains 102 records |
| Tracker return to cached page | 0 requests; fixture initial ready 1,236 ms, cached navigation 602 ms |
| Trip Details cached revisit | 0 requests; 7 resource reads on first fixture visit |
| Shared-grid remote draft preview | 87/80/103/80 ms in measured regression run; 0 typing/cancel writes |

Tracker navigation timings include fixture waits and are not pure render timings.
Explicit Realtime invalidation and stale data still permit necessary HTTP requests.
There is no claim of zero network requests.

## 6. Verification

- Frontend: **99/99 tests passed**, zero failed/skipped.
- Backend regression: **208/208 tests passed**, zero failed/skipped; no backend
  production source changed in this phase. Test processes used isolated configuration.
- Frontend and backend TypeScript checks and production builds passed.
- Targeted ESLint passed for new files and other changed source/test files. Four
  existing errors remain in Tracker/Dashboard: Tracker `no-control-regex` and
  `set-state-in-effect`; Dashboard two `set-state-in-effect` findings. All four
  were independently reproduced from Git HEAD through ESLint stdin; no new lint
  warnings remain in the changed Users implementation.
- Existing Vite chunk-size warning remains. No unrelated bundling refactor was done.
- `git diff --check` passed; Git reports existing LF/CRLF normalization warnings.

### 21 unique isolated browser fixtures passed

`users-one-load`, `users-cache`, `trip-details-column`, `tracker-trip-deletion`,
`operations-pagination`, `operations-table`, `report-wizard`, `retained-reports`,
`live-cell-drafts`, `live-tracker-drafts`, `live-operations-drafts`, `shared-design`,
`table-viewers`, `tracker-pagination`, `trip-time`, `loading-time`,
`trip-detail-cache`, `trip-route`, `admin-realtime`, `cell-presence-position`,
`formatting-icons`.

The new column fixture uses two isolated ADMIN/STAFF contexts and actual Socket.IO
with in-memory appearance storage. It verifies width, color, font, hide/restore,
ordering, left/right pinning, refresh, finder and exact parent/stop navigation in
Combined and Trips. Toolbar fixtures verify grouping, absent unselected actions,
STAFF edit/Admin deletion restrictions, page-scoped selection and pagination recovery.
Users tests cover directory deduplication, role/account/logout isolation, filters,
summary/detail caching, background reconciliation and account removal. Existing
fixtures cover live typing, save/cancel/failure, conflicting drafts, Realtime saves,
resize protection, presence, direct route refresh and loading/unloading stop isolation.

Initial failed fixture runs were corrected: the new fixture overlay had obscured
portal menus; its color and pinned-offset assertions were aligned with actual
supported controls/measured selection width. Older toolbar tests now assert absent
rather than disabled unselected actions. No safety assertions were removed. An
initial unit-test command omitted the documented JSX configuration; rerunning with
`TSX_TSCONFIG_PATH=tsconfig.app.json` passed all 99 tests.

## 7. Files changed in this phase

Frontend source:

- `src/pages/Admin/views/TruckersView.tsx`
- `src/pages/Admin/DashboardPage.tsx`
- `src/components/admin/TruckerDetailDrawer.tsx`
- `src/components/admin/ReportDataView.tsx`
- `src/components/admin/OperationsReportsView.tsx`
- `src/components/admin/TransmittalTrackerView.tsx`
- `src/components/admin/ReportsWorkspace.tsx`
- `src/services/user-management.service.ts`
- `src/services/trucker.service.ts`
- `src/services/admin-preload.service.ts`
- `src/services/realtime.service.ts`
- `src/services/report-action-columns.ts` (new)

Frontend tests:

- New: `users-directory.test.ts`, `report-action-columns.test.ts`,
  `users-one-load.browser.js`, `trip-details-column.browser.js`.
- Updated: `users-cache.browser.js`, `operations-pagination.browser.js`,
  `operations-table.browser.js`, `report-wizard.browser.js`,
  `tracker-trip-deletion.browser.js`.

Documentation: this report and `docs/tms-table-overhaul-progress.md`.
Other modified/untracked files belong to the preserved earlier worktree.

## 8. Limitations and manual acceptance

All browser checks in this phase used synthetic identities and isolated/mocked data;
actual Socket.IO was used where stated. They are not authenticated production
acceptance. No live account or operational record was edited to verify these UI
changes. A manual check with approved Admin/Staff sessions remains useful for real
data volumes and deployed transport behavior. Existing lint findings and build-size
warning remain documented above.

Directory page size is bounded, but the Users screen intentionally loads all
management directory pages for local category/filter switching; it does not fetch
all business/report history. Very large account directories may eventually need a
separate product decision about server-side directory search.

## 9. Supabase, configuration and safety

No new API, migration, schema, RLS, grant, Storage or Realtime publication change is
needed. Existing endpoints and generic shared-layout keys support the action column.
No Supabase operation was required or executed in this phase. No flags changed.
No live operational mutation, DR 333 change, Storage upload/deletion, GPS capture,
Directions/Gemini call, deployment, commit or push occurred.

No database approval or manual configuration step is required for this local
implementation. Resume from manual, non-destructive UI acceptance if desired;
retain the existing feature flags and authorization boundaries.
