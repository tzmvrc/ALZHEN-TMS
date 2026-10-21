# Database, spreadsheet and safe-deletion implementation report

## Status and boundaries

> Historical report. The later authorized architecture pass installed the reviewed child-deletion contracts and inspected PostgreSQL directly. See [current implementation and verification](unified-trip-architecture-and-spreadsheet-repair.md). Original observations below remain as historical evidence.

Project inspected: `hdmknewarynwpbrhfgai`. No Supabase SQL, migration, grant, policy or publication change was executed. No production records or Storage objects were deleted. Existing unrelated worktree changes were preserved; nothing was committed, pushed or deployed.

Application changes and isolated checks are complete for the paths described below. **Database performance diagnosis is not complete:** the available connection exposes PostgREST, not PostgreSQL catalog/plan access, and intermittent upstream latency remains. New store-call/empty-stop deletion is **prepared and hidden pending database approval**, not operational.

The user confirmed there were no trips and explicitly authorized adding a sample through Add Trip/API. One sample was created through the existing authenticated `POST /api/trips` workflow:

- Dispatch: `PERF-SAMPLE-1792523445062`
- Trip: `7133bd18-9c53-4b13-91e3-c36d6ef30857`
- One stop and one cargo line; no driver/truck assignment, store call or completed-delivery history.
- Existing customer/store/warehouse references were reused. No existing operational record was altered. The sample remains; it was not automatically deleted.

## Findings by sheet

| Sheet | Source and confirmed issue | Change |
|---|---|---|
| Master List | `v_dispatch_monitoring`; initially no trips existed. After sample creation, a redundant `trip_reference` capability probe alone took 15,068 ms in one run. Repeated parent-trip and sequential enrichment reads added work. | Remove that display-path probe, reuse one parent metadata read, parallelize independent enrichment, retain incremental collection loading and virtualization. |
| Dispatch Monitoring | Same view; duplicated metadata/route enrichment. Page boundaries needed stable physical tie breakers. | Shared retrieval improvements and physical secondary ordering; explicit Previous/Next/page entry. |
| Dispatch Report | `v_dispatch_report`; repeated enrichment and intermittent slow upstream requests. | Shared retrieval improvements, deterministic physical ordering and accessible pagination. Long-tail latency remains observable. |
| Trip Booking | `v_trip_booking`; unnecessary repeated parent reads and source lookups already projected by the view. | Reuse parent metadata, skip redundant product lookups, stable physical ordering. |
| Store Calling | Preferred `vw_store_calling_tracker` returns 403/42501. Existing `v_store_calling` fallback works but has different destination/assignee field names. Search previously filtered only the current frontend page. No physical calls currently exist. | Preserve fallback; map source fields correctly; search/filter/sort before pagination, including assigned-profile matching and physical call scopes. Explicit genuine-empty and error/Retry states. |
| Transmittal Tracker | Derived eligible-stop projection plus flexible override cells, not an independent physical transmittal table. Sample's planned/pending stop is not eligible. Formula source resolution could previously trigger historical Tracker reads. | Keep paged eligible-stop reads, bind formula reads to requested physical stops, display genuine-empty/error/Retry states. No parent-trip deletion from Tracker. |

Formula metadata retrieval also previously read more than the requested dependency graph. It now reads the requested physical identities plus transitive dependencies in bounded batches. No saved overlay means no additional operational-source query. Ordinary report formula resolution batches parent IDs; Store Calling uses call IDs; Tracker uses stop IDs. Existing formula graph safety limits are explicit errors, not operational browsing limits.

## Live measurements and their limits

All timings below are observations, not performance guarantees. Direct Data API times include transport, PostgREST and database work; **they are not PostgreSQL execution times**. Service calls exclude browser rendering and HTTP authentication unless explicitly labelled HTTP. Different passes are not controlled benchmark equivalents.

| Sheet | Final direct Data API view read | Authenticated backend HTTP, earlier signed-in pass | First usable browser result, same live pass | Current records verified |
|---|---:|---:|---:|---|
| Master List | 444 ms, shared monitoring source | 1,098 ms | 3,326 ms | 1 sample row |
| Dispatch Monitoring | 444 ms | 908 ms | 1,408 ms | 1 sample row |
| Dispatch Report | 390 ms | 822 ms | 1,524 ms | 1 sample row |
| Trip Booking | 231 ms | 784 ms | 2,092 ms | 1 sample row |
| Store Calling | Fallback 112 ms; preferred 403 in 131 ms | 1,288 ms | 760 ms, genuine empty | 0 physical calls |
| Transmittal Tracker | 117 ms | 13,074 ms first request; repeats 869/505/564 ms | 995 ms, genuine empty | 0 eligible stops |

The actual signed-in browser switched back through all six cached sheets with **zero additional report GETs** (227–965 ms automation-observed tab switches). The live session later returned to Sign In on reload, so final authenticated HTTP/browser measurements could not be repeated without another login. No credentials were requested or exposed.

Service-layer comparison with the sample:

| Source | Before final changes | Final service pass | Successful upstream reads before → after |
|---|---:|---:|---:|
| Monitoring/Master | 15,744 ms | 781 ms | 10 → 7 |
| Dispatch | 451 ms | 21,679 ms | 9 → 7 |
| Booking | 461 ms | 424 ms | 8 → 6 |
| Store Calling | 276 ms | 182 ms | 2 → 2 |
| Tracker | 415 ms | 377 ms | 4 → 4 |

**Do not interpret this as a uniform latency improvement.** Dispatch had a 21.7-second outlier despite short successful fetch measurements; one comprehensive diagnostic attempt also timed out. Earlier diagnostic instrumentation recorded only successful fetches; it now records failures too. The evidence does not establish whether connection/retry delays, service load or database waits caused each outlier. It does establish redundant application reads and an unnecessary schema probe.

Report GETs now have request-local upstream timing and sanitized slow-read logs. Scoped database GET attempts have a configurable `REPORT_UPSTREAM_TIMEOUT_MS` (default 12,000; range 1,000–60,000). Cancellation uses AbortError so a timed-out attempt is not multiplied by the SDK's network retries. This is a per-upstream-attempt bound, not a total endpoint SLA or a database query optimization. Source mutations/RPCs and non-report traffic retain their existing behavior. Cached rows remain visible and an actionable Retry is available. Timeout/caller cancellation behavior was unit-tested; no post-change signed-in latency claim is made.

Artifacts:

- `report-performance-empty-baseline.json`: before sample creation.
- `report-performance-sample-before-final.json`: sample/probe baseline.
- `report-performance-live-readonly.json`: earlier complete schema/count/read pass.
- `report-service-latency-final-readonly.json`: final service-only pass, including the Dispatch outlier.
- `report-view-latency-final-readonly.json`: final bounded-concurrency direct view reads.
- Browser screenshots under `frontend/tests/artifacts/live-*.png` and `spreadsheet-consistency.png`.

### PostgreSQL diagnostics still required

PostgREST rejects EXPLAIN media types with `PGRST107`. No direct PostgreSQL connection or Supabase MCP database tool is available here. View SQL bodies, index plans, trigger definitions, locks and connection pressure could not be independently inspected through the available REST surface. No sequential scan, missing index or blocking transaction is claimed without evidence.

`backend/scripts/report-schema-readonly-diagnostics.sql` contains a read-only transaction with view/index/FK/trigger inspection, activity/lock summaries and non-ANALYZE EXPLAIN statements. It was **not executed**. Run it through an authorized read-only PostgreSQL connection before proposing index/view changes. No speculative index migration was prepared.

## Completeness, loading and Realtime

- Master List fetches a first bounded page, renders immediately, and loads more on demand. It has no arbitrary total collection cap. Existing virtualization limits mounted rows, not accessible records.
- Other report sheets retain server pagination and exact totals with Previous/Next/page entry. Tracker retains server pagination and page-size controls. Physical tie breakers prevent equal sort values from producing unstable static page boundaries.
- Store Calling search now reaches matching records outside the current page. Filters/search and source identity are preserved through fallback views.
- Failed reads show a concise error with Retry. Genuine empty datasets are labelled separately. Cached content remains during revalidation.
- Paging is blocked during active source/formula drafts and saves. Tracker's page-two accessible row label now matches its displayed pagination offset.
- Existing session-scoped caches, request deduplication, Supabase subscriptions, Socket.IO delivery and reconnect recovery remain in place. No new transport stream or polling was added.
- Child-delete commits remove exact physical rows and cached projections; session-scoped tombstones prevent stale responses restoring deleted rows. Store-call DELETE is handled directly, including underscore-prefixed physical aliases. Subsequent reconciliation is deferred around active drafts/dialogs.
- Partial child deletion clears only confirmed selections; failed targets stay selected and retries do not repeat confirmed successes.
- Existing authoritative exports are unchanged. Existing Tracker export bounds remain explicit; this work does not claim unlimited export size.
- Live verification covers the entire current tiny dataset. Large-data completeness is verified with **423 mocked physical records**, not claimed as a populated live-database performance test. Offset pagination during concurrent inserts/deletes may shift page boundaries and requires normal reconciliation.

## Spreadsheet UI

- Shared `ReportRowActionButton`: Pencil/Trash use the same 32px circular container, 16px icon, pointer cursor, focus/hover/disabled behavior and accessible tooltip/label.
- Shared headers default to bold (700), horizontal and left-aligned. Explicit saved normal-weight formatting remains authoritative.
- Report toolbar filter icon and its exclusive panel were removed; underlying search/filter/sort support and existing status chips remain.
- Tracker has a Reset icon/action with an explicit override-reset label, not a misleading Delete icon for a generated projection.

## Safe deletion contracts

| Sheet/entity | Current behavior | Physical identity and scope |
|---|---|---|
| Master List | Existing Admin whole-trip workflow preserved, session authorization and confirmation, no password reentry. | Explicit parent `trip_id`, deduplicated; supported maximum unchanged. |
| Monitoring / Dispatch / Booking cargo rows | Existing child-only endpoint preserved. | Exact trip + stop + `trip_line_item_id`; never a trip fallback. |
| Store Calling | New application endpoint prepared; **hidden until approved RPC exists**. | `DELETE /api/store-calls/:id`, expected physical collaboration version; only that call. |
| Dependency-free stops | New separate contract prepared; **hidden until approved RPC exists**. | `DELETE /api/trips/:id/stops/:stopId/record-only`; exact stop/trip/version. Even the final stop must preserve its parent. Stops with children/attachments/Tracker references are blocked. |
| Tracker | Reset saved transmittal-only overrides through the existing authorized/versioned flexible-cell API. | Selected `trip_stop_id` → allowed saved override cells only. Never source DR number, trip, stop, POD or attachments. |
| Incident/backload/offload/generated projections | No generic destructive fallback added. | Existing dedicated operational workflows remain; unrelated record IDs cannot be substituted. |

Backend role checks require authenticated Admin/Staff for the new narrow child endpoints; truckers are rejected. Whole-trip deletion remains Admin-only. The backend reuses the live profile already validated within the same request instead of performing a duplicate profile read; it does not cache completed authorization decisions across requests.

New child API calls have bounded, deduplicated target lists and expected-version checks. They never invoke the legacy stop-deletion route whose final-stop behavior can remove its parent. New proposed RPCs combine audit insertion and physical deletion in the same relational transaction and reject incoming foreign-key dependencies rather than following CASCADE. Existing retention triggers remain active. No Storage cleanup is authorized by these child contracts.

Tracker Reset is a **per-cell, versioned operation**, not a new atomic batch RPC. Confirmed fields stay reset if another field fails; failed rows remain selected, only remaining fields are retried, and audit warnings are reported separately. Null restores source fallback; an empty string would incorrectly preserve an intentional blank. Source DR overrides are explicitly excluded because their existing save mapping changes authoritative stop data.

### SQL awaiting approval and further database validation

1. `backend/migrations/2026_10_21_proposed_narrow_record_deletion.sql`
   - Adds service-only `delete_store_call_record_v1(uuid,uuid,bigint)` and `delete_empty_trip_stop_v1(uuid,uuid,uuid,bigint)` plus a private dependency-check helper.
   - Does not delete records when installed. Actual deletes happen only after future authorized application confirmation.
   - Locks physical records, checks expected versions and actor role, blocks dependencies, records audit evidence, and preserves parent trips.
   - Empty-stop scope conservatively blocks trip images, report receipts, pending receipt reservations, relevant Storage namespaces and existing Tracker STOP bindings; it deletes no files.
   - **Not installed and not executed against disposable PostgreSQL.** Mock/static tests are not SQL execution validation. Review installed constraints/triggers and polymorphic references before applying. In particular, `flex_rows` uses a polymorphic source ID without an FK; concurrent source-row creation needs validation against its existing locking/trigger behavior. Do not authorize application use until that dependency/concurrency review and disposable SQL tests pass.
2. `backend/migrations/2026_10_21_proposed_store_call_view_grant.sql`
   - Optional `GRANT SELECT ON public.vw_store_calling_tracker TO service_role` only.
   - No anon/authenticated grant. Requires owner/security/dependency review. Existing fallback remains usable without it.

No new RLS policy/publication or Storage policy is applied or requested by the application code. Existing Realtime mechanisms are reused. New SQL-dependent deletion cannot be described as live-verified until approval, installation, and isolated relational tests occur.

## Verification actually performed

- Frontend TypeScript `tsc -b --pretty false`: passed, including final partial-selection/deferred-reconciliation edits.
- Backend TypeScript `tsc --noEmit --pretty false`: passed, including scoped timeout/timing integration.
- Backend targeted tests: **23 passed**, covering live-auth promise deduplication/session isolation, timeout/cancellation, physical deletion RPC targeting/authorization/conflicts/missing-RPC failure, report scopes, fallback search, stop editing, Tracker pagination and routes/references. Expected mocked failed-write logging is part of the passing regression.
- Frontend targeted tests: **16 passed**, covering incremental loading, cache hydration/session isolation/stale-response rejection, exact deletion scopes/partial failures, Tracker reset and header defaults.
- Playwright `spreadsheet-consistency.browser.js`: six sheets; circular actions, horizontal bold headers, no filter icons, Tracker checkbox centering through 70px row resize; cached report GETs zero; scroll 300→300 and selection/search retained; 40 mounted real rows with a larger fixture. Rapid cell selection did not issue API requests. Automation-observed warm switches were 286–936 ms in the final pass; frame samples were mostly 16–17 ms, not proof of production latency.
- Playwright `spreadsheet-pagination-recovery.browser.js`: all 423 Master rows accessible, last/previous pages on four reports, global Store Calling search, exact-child confirmation, read failure + Retry recovery, Tracker page two and Reset confirmation.
- Playwright `spreadsheet-row-actions.browser.js`: exact cargo child endpoint, Admin/Staff/Trucker action scope, partial failure/retry-only-failed, Store Calling source editing, capability-enabled mocked call deletion with expected version and retained failed selection. No real DELETE requests.
- Playwright `unified-workspace.browser.js`: two independent mocked contexts; saved formula update, references, Escape, source-save recalculation, preserved draft after failed refresh, single Enter commit.
- Playwright `live-cell-drafts.browser.js`: two contexts with real isolated Socket.IO transport, mocked authentication/persistence; no writes while typing/cancelling, independent drafts, conflict notice, failed-save draft retention, reconnect/token refresh/logout cleanup. Remote preview samples: **108, 93, 87, 94 ms**. No production Realtime save/delete was initiated.
- Playwright `live-cell-draft-performance.browser.js`: 5,000 mounted fixture cells, 100 draft updates to paint **33.6 ms**, no full-owner/unrelated typing rerenders or API requests.
- Authenticated live read-only six-sheet browser run: actual sample rows on four sheets and genuine empties on the other two, no page errors; cached revisit caused no report GETs. Screenshots captured. The later session returned to Sign In; no final authenticated rerun is claimed.
- Final direct Data API checks succeeded as recorded above. The backend `/api/health` returned 200. Frontend 5173/backend 5000 listeners remain running. Temporary isolated Socket fixture 5199 was stopped after verifying its command line. Git has no unmerged index entries.

No destructive production tests, full-system suite, deployment, commit or push occurred.

## Files changed for this task

Backend:

- `src/services/report.service.ts`, `trip-route.service.ts`, `transmittal-tracker.service.ts`, `spreadsheet-formula.service.ts`
- `src/services/record-deletion.service.ts` (new)
- `src/middleware/auth.middleware.ts`, `role.middleware.ts`
- `src/config/supabase.ts`, `src/app.ts`, `src/utils/report-read-timing.ts` (new)
- `src/routes/store-call.routes.ts`, `trip.routes.ts`
- Proposed SQL files and read-only scripts listed above; `scripts/report-performance-readonly.ts`, `scripts/report-view-latency-readonly.ts`
- `tests/narrow-record-deletion.test.ts`, `report-source-scope.test.ts`, `report-read-timing.test.ts` (new)

Frontend:

- `src/components/admin/ReportDataView.tsx`, `ReportSpreadsheetShared.tsx`, `ReportSpreadsheetUtils.ts`, `TransmittalTrackerView.tsx`
- `src/components/admin/PhysicalRecordDeletionDialog.tsx`, `TrackerResetDialog.tsx` (new)
- `src/services/report-row-actions.ts`, `report.service.ts`, `transmittal-tracker.service.ts`
- `tests/narrow-record-deletion.test.ts`, `report-row-actions.test.tsx`, `spreadsheet-consistency.browser.js`, `spreadsheet-pagination-recovery.browser.js`, `spreadsheet-row-actions.browser.js`, `live-report-readonly.browser.js`
- This document, diagnostic JSON and browser screenshots.

Other modified/untracked worktree files predate this task and were not reverted or claimed as newly implemented here.

## Remaining limitations

- Root cause of intermittent upstream long-tail latency is unresolved. Fast direct view reads on one sample are not proof of large-history database performance. PostgreSQL plan/lock/index/trigger diagnostics still require a direct read-only connection.
- The preferred Store Calling view permission mismatch remains until reviewed SQL is approved; fallback works.
- Store-call/stop-only deletion is prepared but unavailable until reviewed SQL and dependency/concurrency tests pass. No complete child-cleanup or cross-system atomicity claim is made.
- Only one planned sample exists; actual completed Tracker and Store Calling data could not be live-verified. Their populated/pagination/error cases use isolated fixtures.
- Very broad search may generate large ID filters; source query plans and server-side alternatives should be evaluated using real history before changing schema.
- Historical Tracker export limits, existing cargo deletion/audit contracts, and unrelated operational workflows were preserved, not redesigned.
