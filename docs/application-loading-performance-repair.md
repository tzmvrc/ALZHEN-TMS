# Application loading and navigation repair

## Scope and safety

Safe-deletion work was postponed. Existing unrelated worktree changes were retained. No Supabase SQL, migrations, production account changes, operational writes, trip deletions, deployment, commits, or pushes were performed. Browser fixtures use synthetic accounts and intercepted APIs; the two-session collaboration test uses an isolated Socket.IO server on port 5199.

## Confirmed causes

1. Eager route/component imports made login load dashboard, reports, editors, and chart dependencies. Authentication skeletons alone imported the Recharts bundle through DashboardPrimitives.
2. Authentication restoration, Supabase INITIAL_SESSION, and StrictMode effects could overlap bootstrap requests. Resubscribing when the auth callback changed introduced additional initialization. A successful silent retry after an initial transient bootstrap failure could leave initial loading active.
3. Workspace initialization overlapped dashboard preloading and immediately swept every Master List history page. Separate width/design hydration requested the same underlying layout rows twice.
4. Overview awaited booking enrichment before exposing its usable snapshot, then used two detail queues for up to 100 trips (200 event/photo requests). It also had an independent periodic full refresh. Work could continue after navigation.
5. Every simultaneous protected API request independently fetched Supabase user, profile, and session authorization, multiplying identical remote reads during startup bursts.
6. Width polling duplicated the session change-feed recovery. StrictMode's abandoned mount could start an extra Realtime connection/snapshot attempt. Trip Issues invalidated its own in-flight cache during initial mounting.
7. Presentation-only blank rows lacked the normal row hover class; colored/background cells also needed a shared CSS-only hover rule that preserves selection outlines.

## Implementation

### Login, authentication, shell

- Lazy-load Admin/Driver portals and page-specific UI, custom sheets, Add Trip, charts and master-data pages. Keep navigation outside the page Suspense boundary.
- Add lightweight RouteLoading and TablePrimitives modules, preserving existing dashboard primitive exports for callers.
- Show the public login form while session restoration runs. Protected routes still wait for a validated profile and role.
- Coalesce concurrent refresh/bootstrap work, use stable auth subscription callbacks, reject stale responses with a session epoch, and release loading after successful silent recovery. Existing logout, midnight expiration, token refresh and role checks remain.
- Login preload establishes cache/session isolation only; it performs no operational warm-up.

### Snapshot-first data and caches

- Master List initially requests one 200-row network page. Subsequent pages are loaded on demand near the scroll boundary or through the accessible Load more rows control. There is no total-record cap; existing windowed rendering is retained.
- Preserve physical row identities, newer confirmed values, deletion tombstones, total counts and session isolation while appending pages. Concurrent next-page requests share one operation. A stale refresh revalidates only the already-loaded window.
- Fetch report column definitions and page data concurrently, retain valid cached content, and bound invalidation rebases rather than recursively retrying indefinitely.
- One workspace-owned background queue starts after a two-second yield and foreground readiness. It warms one inactive sheet snapshot at a time with a gap between jobs; each page may fetch its columns and rows concurrently. It does not mount hidden grids, sweep history or enumerate relationship catalogs. Leaving the workspace stops queued work. A read already started may finish and populate its authorized cache.
- Width hydration derives widths/revisions from the same canonical design read. Width writes and revision conflict handling are unchanged.
- Overview publishes essential trips/counts first, defers enrichment, then uses one paced queue with one network request at a time. Early detail and subsequent batches update the snapshot progressively. Navigation stops queued work; one already-started read may finish. Remove its independent 60-second full-reload timer while retaining shared Realtime recovery.
- Initial Trip Issues reads reuse their existing in-flight/cache entry. Issue changes refresh the main grid only when its issue filter needs reevaluation.
- API timeouts now combine caller cancellation with the timeout signal rather than overriding cancellation.

### Realtime and authorization

- Preserve the existing session signal feed, Socket.IO transport, confirmed-row reconciliation, cache invalidation, reconnect snapshots and draft protection.
- Defer initial change-feed startup to a cancellable task so StrictMode probe cleanup cannot start a discarded connection.
- Remove the independent per-layout width poll; focus, socket layout events and shared change-feed recovery still reconcile missed changes. The existing low-frequency recovery snapshot remains; this is not a guaranteed-delivery stream.
- Backend coalesces simultaneous live Auth/profile/session reads only while their promises are pending. It never caches completed permission decisions. Session keys include role, identity and a hash of the session ID; token keys are hashed. Every later request checks the live sources again, including expiry. The pending map is bounded and failures are not retained.
- No backend startup, security, deletion, worker or feature flags were changed. The startup log means the HTTP listener bound normally. `workers:1` and no Redis/shared confirmation is the intended local single-worker mode. Tracking tasks start after binding and are independently gated; they are not awaited by HTTP startup.

### Blank cells

Presentation rows now share report row styling. A lightweight CSS inset hover applies to real and visual-only cells, excluding selected cells and disabled hover surfaces. No React mousemove state or placeholder text is introduced. Existing editing permissions, virtual identity and active borders are retained.

## Measurements

Local Vite development server, Chromium via Playwright, same controlled fixture before/after. These are individual samples, not production percentiles. Authentication/database responses are synthetic unless explicitly noted. Decoded resources are development resources, not compressed production transfer sizes.

| Measurement | Before | After |
| --- | ---: | ---: |
| Login form with a simulated 2-second session read | 3,772 ms | 833 ms |
| Login resources | 192 | 40 |
| Login decoded resource bytes | 24,865,809 | 11,937,571 |
| Login sampled JS heap | 50,758,433 | 27,402,503 |
| Auth bootstrap requests under StrictMode | 3 | 1 |
| Auth session reads in restoration fixture | 9 | 1 |
| Restoration fixture wall time (including module loads) | 872 ms | 804 ms |
| Initial Master collection network pages (10-page synthetic dataset) | 10 | 1 |
| Initial collection completion | 538 ms | 57.5 ms |
| Width + design simultaneous hydration reads | 2 (code path) | 1 (asserted) |

Additional after-repair observations:

- Actual unmocked unauthenticated `/login`: 650 ms, zero API requests, no browser errors.
- Actual application route `/trips` with isolated Auth/REST: shell 1,536 ms; first rows 2,006 ms; one bootstrap; two live/peak mock Supabase channels across all six sheets (signal feed and notifications).
- Warm-up fixture: first usable sheet uses one report read; background warm-up totals five report-page reads (Master and Dispatch Monitoring use distinct limits) plus Tracker. Visiting all six afterward makes zero additional report reads. First visits to preloaded but unmounted sheets still spend 192?614 ms mounting/rendering in this sample; already-active Master tab 35 ms.
- Retained 220-row six-sheet fixture: zero report reads on repeat switching, 40 windowed real rows mounted, scroll position 300 restored exactly, filters and selection preserved, no selection leaking across sheets. Ten cell clicks issued zero API requests. Pointer-to-next-frame samples were 0.8?17.1 ms. Playwright click/wait-based warm switching was 219?896 ms; this includes automation waits and does not establish sub-frame sheet rendering.
- Overview with 100 synthetic trips: essential snapshot 1,496 ms, zero detail reads before it appeared. After navigation hid Overview, detail requests remained at 12 after an additional second, instead of continuing through 200 requests.
- Actual backend `/api/health`, 20 sequential local requests: median 1.85 ms, minimum 1.38 ms, maximum 50.62 ms (first connection). No before-repair health baseline was captured.
- Real isolated Socket.IO remote draft samples: 82?112 ms; typing/cancel made zero persistence requests.
- 5,000-cell fixture: 100 drafts to paint in 36.8 ms, zero owner-wide/unrelated cell rerenders during typing, zero API requests.

## Verification performed

- Frontend `tsc -b --pretty false`: passed.
- Backend `tsc --noEmit --pretty false`: passed.
- Twenty targeted frontend tests passed: incremental collections, concurrent page/cache recovery, session isolation, change-feed deduplication, preload caches, shared design persistence and width revisions. The existing formula assertion module was also invoked.
- Three targeted backend tests passed: socket authentication plus pending-read coalescing, fresh later authorization, rejection recovery and session-ID isolation.
- Playwright startup fixture: real AuthProvider under StrictMode; one bootstrap; transient initial 503 recovers on the second attempt; login does not wait for restoration; no startup page errors.
- Playwright actual application startup: six sheets initialize; blank-cell hover and active borders pass in every sheet; channel count remains two, with no production writes.
- Playwright background preload: active-first loading, bounded warm-up and no report reads when visiting warmed sheets.
- Playwright Overview: snapshot before enrichment, navigation stops queued details.
- Playwright six-sheet consistency fixture: cached retention, local selection, scrolling, headers and checkbox alignment pass with no runtime errors or production writes. Existing action rendering was inspected only; deletion implementation was not extended.
- Playwright formula fixture: two contexts; expression/result rendering, reference picking, source edits and recalculation, Escape, preserved drafts after refresh failure and one Enter/blur commit pass.
- Playwright real Socket.IO fixture: two contexts; live drafts, same-cell isolation, conflict feedback, failed-save draft retention, reconnect, token refresh, browser refresh and logout cleanup pass.
- Playwright 5,000-cell draft render fixture: passed.
- Existing Vite 5173 and backend 5000 listeners were healthy. Backend watch reloaded current middleware code; no extra application listener was started. The temporary 5199 collaboration test server was stopped after verification.

## Files changed for this repair

Frontend:

- `src/App.tsx`
- `src/components/ProtectedRoute.tsx`, `PublicRoute.tsx`, `RouteLoading.tsx`
- `src/context/AuthContext.tsx`
- `src/pages/Admin/DashboardPage.tsx`
- `src/pages/Admin/views/ResourceView.tsx`, `OverviewView.tsx`, `FlexibleTablesView.tsx`
- `src/components/admin/DashboardPrimitives.tsx`, `TablePrimitives.tsx`, `FlexibleTableSectionTabs.tsx`
- `src/components/admin/ReportsWorkspace.tsx`, `useWorkspacePreload.ts`
- `src/components/admin/ReportDataView.tsx`, `TransmittalTrackerView.tsx`, `TripIssues.tsx`
- `src/components/admin/SpreadsheetPresentation.tsx`, `useSharedTableWidths.tsx`
- `src/index.css`
- `src/services/admin-preload.service.ts`, `api.service.ts`, `report.service.ts`, `realtime.service.ts`, `shared-table-design.ts`, `shared-table-widths.ts`
- `tests/incremental-report.test.ts`, `startup-performance.browser.js`, `application-startup.browser.js`, `workspace-preload.browser.js`, `overview-startup.browser.js`
- Screenshots in `tests/artifacts/`.

Backend:

- `src/middleware/auth.middleware.ts`
- `src/utils/concurrent-read.ts`
- `tests/concurrent-auth.test.ts`

This document records this repair's changes, not every previously modified file in the existing worktree.

## Limits and follow-up

Live production authentication, report-query latency and end-to-end Supabase delivery were not measured using a real account. Synthetic tests establish application sequencing and request correctness, not production database timings. No SQL/index/RLS changes are proposed based on these measurements. Development dependency modules remain large; the lazy boundaries keep them off login but first feature visits still load their dependencies. Initial navigation and cached sheet mounting can still cost hundreds of milliseconds; this repair does not claim zero-cost rendering. Master List retains requested pages in session memory and virtualizes DOM rows; explicitly browsing all history can eventually accumulate that data. Shared recovery may revalidate the already-loaded collection window; it does not sweep unseen history. Existing source-aware targeted row reconciliation is retained where safe; topic-only changes still require snapshot recovery. Formula permission and missing-reference errors remain genuine errors, not suppressed startup failures.

Supabase changes required: **none**. Safe-deletion work remains postponed.
