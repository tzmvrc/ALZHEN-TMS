# Report read investigation — 2026-10-24

Supabase project: `hdmknewarynwpbrhfgai`. Investigation and verification were read-only.

Postgres logs show statement timeouts (`57014`) for the paginated `v_trip_master_csv` read with exact count. The development mount diagnostic is unrelated; React StrictMode can mount components twice.

Changes select the displayed and supporting identity/provenance columns explicitly, excluding unused computed search/filter output. Database filters can still reference those columns. Timeouts return an actionable 503 code, `REPORT_READ_TIMEOUT`. Failed reads share a ten-second cooldown across collection consumers, including realtime refreshes. Explicit Retry clears that cooldown. Inactive consumers no longer emit duplicate failure diagnostics. An invalidated request can rebase without waiting on its own promise.

Live verification using `backend/scripts/inspect_report_read.ts` returned 120 rows, total 120, in approximately 2.9 seconds. This is one observed read, not a latency guarantee. Targeted regression tests cover projection identities, timeout handling, failure deduplication, retry, session isolation and invalidation.

## Demo records

There are 30 saved trips with dispatch references `DEMO30-20261024-*` and remarks marker `[ALZHEN_DEMO30_V1]`, with associated stops, cargo and master data. `pg_stat_statements` records a direct SQL `DO $demo30$` seed block with two calls and a separate simulated-route alignment block. The marker is absent from repository runtime code. No recurring database cron schema or marker-bearing stored function was found. This identifies a direct SQL seed source but does not identify the operator or establish when either invocation occurred; statement statistics aggregate calls.

These are stored database records and therefore appear in both Master List and Database. They are distinct from the frontend's nonpersisted map-route fallback. No demo data was inserted, imported, altered or deleted during this investigation.

## Formula read follow-up

The separate `POST /api/reports/formulas/read` failure was reproduced against the same 120 live report rows. Its backend lookup put 100 composite physical identities into a Supabase GET `in` filter. The generated URL was 19,155 characters; Node reported `UND_ERR_HEADERS_OVERFLOW`. The formula table and server read permission were present.

Dependency lookups now batch by encoded filter length (6,000 characters) as well as row count. Tests inspect actual generated URLs for 500 composite identities, including identities of the maximum accepted length, and check that every requested row is queried exactly once. No missing-table fallback or empty-success error masking is used. The same live formula service call succeeds after the change.

Formula failures share a ten-second cooldown across background invalidations; Refresh formulas clears it immediately. The UI now identifies the calculated-cell failure and its recovery action instead of displaying the generic “Unable to complete this action” message. Browser verification covers the failure and recovery without any production writes. Backend TypeScript checking and the frontend Vite build pass.

## Optional-address save and report follow-up

A subsequent CSV import contained 56 product lines, 4 stops and one trip. Investigation found that saving automatically geocoded destinations and wrote admin location-review notifications, even when addresses were skipped. Confirmed trip address writes also ran before deduplication and could repeat once for every product at the same stop.

Saving now resolves customer/store identities without running address searches. Unconfirmed optional addresses require no location follow-up queries, writes or notifications. Explicitly confirmed trip addresses are saved once per distinct stop/address. The explicit Find address endpoint remains available.

Master List row reads no longer combine a wide nested view and its exact count in one PostgREST query. A short first page (or a nonempty short later page) provides an exact total directly. Full pages and empty later pages use a separate HEAD count with the same filters and scope. Other reports retain their existing count path. This reduces duplicated view work without changing pagination semantics. Targeted realtime trip reads share failure backoff; a failed targeted read no longer immediately starts a full-report refresh and another queued trip refresh.

Verification: 28 targeted unit tests, backend TypeScript, Vite build, the existing CSV navigation browser test, a complete mocked CSV Save with unconfirmed addresses, and the report timeout/retry browser test pass. No live trip data was created, changed or imported in this follow-up.

Live verification encountered a separate availability failure: even `SELECT 1` through Supabase's SQL API failed with `Connection terminated due to connection timeout`, and an independent one-row `trips` REST read timed out after ten seconds, including outside the workspace sandbox. The management status still reported `ACTIVE_HEALTHY`. The user restarted the database; recovery checks must confirm actual SQL/REST connectivity before claiming the live 503 is resolved. Supabase documents this connection error at https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout.

After the restart, SQL and REST checks still failed; the user also confirmed `SELECT 1` fails in the Supabase SQL Editor. Login then returned 500. Login handling now distinguishes Auth/provider transport or 5xx failures and profile database failures from invalid credentials, returns the bounded `AUTH_SERVICE_UNAVAILABLE` 503 message, and preserves that message in the login UI. Genuine invalid credentials still return 401. Authentication and permission checks remain in place. Isolated controller/API regression tests and the existing authentication tests pass.

Supabase's status page lists a Management API incident affecting Singapore: https://status.supabase.com/incidents/01M5J8ZQ04EZXAYF10Q75MGC1T. That is relevant context for dashboard/SQL API symptoms, but does not establish the cause of this project's separate Auth/REST unavailability. Database resource charts or provider support are needed while even trivial SQL cannot connect. Do not report the live outage as fixed merely because the application now returns a clearer 503.
