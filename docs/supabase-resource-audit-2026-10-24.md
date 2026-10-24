# Supabase resource audit — October 24, 2026

## Conclusion and limits

Confirmed avoidable application traffic was fixed: fleet-wide route-context fan-out, polling a hidden Home map, fixed-frequency empty maintenance claims, and rapid legacy table-channel recovery. These are workload contributors. **The evidence does not establish them as the cause of the reported 1.95 GB memory commitment, swap increase or every HTTP 522.** No measured RAM/swap reduction is claimed.

User-reported incident: 19:40–20:25 Philippine time (11:40–12:25 UTC), with detailed metrics approximately 19:55–20:22. Free plan, Singapore; Nano is suspected but not independently verified. Reported gateway/Auth/PostgREST/Storage entry counts describe a 60-minute window; 2.38 GB Logs Ingest describes a billing-cycle total. Entry counts are not byte-volume attribution.

The available Supabase MCP tools expose SQL diagnostics, not historical host-memory/swap graphs, provider incident logs, compute settings, health advisories or ingestion by service. PostgreSQL and its current statement statistics began at **11:54:19 UTC / 19:54:19 Philippine time**, during the incident. Therefore current snapshots do not cover its onset. This task did not restart Supabase.

## Read-only evidence

At 12:33–12:35 UTC:

* `pg_database_size`: 28,904,595 bytes; public tables plus indexes: 11,239,424 bytes; public heap: 2,777,088 bytes. These differ in scope/time from the reported approximately 42 MB and do not measure host RAM or swap.
* 19 database backends in the database-level snapshot; the connection census included five idle PostgREST connections and normal Auth, Storage, Realtime and monitoring connections. A later census had 17 client backends; another had 19. No idle-in-transaction sessions or blocked long transactions were observed. The configured maximum is 60. This is **not evidence of connection exhaustion or a leak**.
* Shared buffers: 224 MiB; `work_mem`: 2,184 KiB, maintenance memory: 32 MiB. Work memory applies per eligible query operation, not a reserved fixed allocation per database record. These settings alone cannot explain the historical host peak.
* Database counters: 1,825 blocks read, approximately 14.28 million cache hits, zero temporary files/bytes and zero deadlocks. Later reads were 1,853, still zero temporary files. These are counters since the current statistics epoch, not a reconstruction of the earlier incident or total host disk I/O.
* Both replication slots were active with approximately 296 bytes retained at sampling. No current WAL backlog was evident.
* `cron.job` and `cron.job_run_details` do not exist in this project. The two maintenance claims are scheduled by Node timers, not pg_cron. A provider launcher process name by itself does not prove an application cron job exists.
* Existing partial pending-job indexes are present on both queues. There is no confirmed missing queue index requiring a migration.

Statement statistics from that epoch:

| Read shape | Calls at sample | Total execution | Mean | Physical block reads |
|---|---:|---:|---:|---:|
| `claim_user_maintenance_v1` | 299 | 5.31 s | 17.75 ms | 7 |
| `claim_master_image_cleanup_v1` | 300 | 5.95 s | 19.82 ms | 7 |
| `planned_route_context_v1` | 1,582 at a later sample | 15.85 s | about 10 ms | 1 |
| Realtime `list_changes` | 4,724 at that sample | 65.57 s | about 14 ms | 25 |

The queues sampled had one DONE user job and 113 COMPLETE image jobs, with no pending work. The claim RPCs contributed unnecessary request/log traffic but little measured disk activity, no temporary spill and almost no WAL. Their stats' `rows` count represents the PostgREST wrapper result, not a count of processed jobs.

Other expensive statements included schema-tool extension enumeration (12 calls, 19.42 s), timezone enumeration (6 calls, 6.90 s), and relationship metadata discovery (6 calls, 4.73 s). Two Master List reads consumed 4.47 s in total. These support reducing repeated reads and unnecessary introspection; they do not prove an operational-table index is missing. Heavy analysis/load fixtures remain local. Do not repeatedly enumerate schemas or run production stress tests while investigating memory pressure.

## Implemented code fixes

### Durable workers

`createAdaptiveWorker` replaces each fixed 15-second interval with one completion-driven timer. Successful work retains a 15-second cadence. Empty claims back off through 30, 60 and 120 seconds, with jitter. Failures back off to five minutes; one failure log is emitted per five-minute period plus a recovery message. Work is never permanently disabled. One instance of each worker is started per Node process.

At steady idle, the two workers together are expected to drop from about **11,520 to 1,440 claims/day per backend process (87.5%)**, excluding startup, explicit retries and wakeups. This is scheduling arithmetic, not a measured full-day production reduction. Multiple deployed processes each have their own poller; SQL leases continue to prevent duplicate job ownership. Current diagnostics cannot establish how many remote deployments may also call this project.

Claim requests have a 10-second deadline and explicit SDK retry opt-out. User job work has a 15-second deadline, image job work 60 seconds, acknowledgements 5 seconds. Deadlines preserve caller cancellation and are normalized to AbortError so the SDK does not repeat a timed-out background GET. A timed-out claim may have committed; durable leases recover it. Acknowledgements retain attempt/state guards, and retry schedules/ownership checks remain intact.

Existing SQL claims already use `FOR UPDATE SKIP LOCKED`, claim at most five jobs and lease user/image work for two/ten minutes. The original SDK does **not** automatically retry POST claims; installed PostgREST retries idempotent GET/HEAD requests for 503/520 or network failures, not HTTP 522. Therefore an automatic SDK POST retry loop was not the cause of repeated claim requests.

Confirmed deactivations, picture changes and queued audit reconciliation wake the user worker promptly instead of waiting for its idle timer. Jobs enqueued outside this process can wait up to the idle interval. Immediate single/bulk image cleanup and explicit Retry remain available; the periodic worker continues recovering failures.

### Fleet reads

Previously, every map read fetched all road geometries and revalidated every cached assignment through separate context RPCs, even though fleet overview hides routes. The 15-second timer also ran while Home was retained behind another tab. With 33 cached routes this could add 33 context calls to a single fleet read; assignments with both cache modes could add two calls each.

Fleet overview now requests `context_assignment=none`: it retains all truck positions/stops/metadata but neither reads geometry nor invokes context RPCs. Selecting a truck fetches the selected assignment's geometry and preserves its exact existing context verification. Other callers retain the previous default behavior. No stale-context acceptance, hourly-cache bypass or extra Mapbox generation was introduced.

The Home active flag pauses the retained map's timer and event listener. Hidden browser tabs also skip reads. Visible polling remains as recovery; errors back off to two minutes, and bursts of Realtime invalidations are coalesced. Returning to Home refreshes through the normal cache path.

### Connections and Realtime

The application uses two shared backend Supabase HTTP clients and one frontend singleton. Password confirmation creates a short-lived HTTP/Auth client with persistence and auto-refresh disabled; it does not create a PostgreSQL pool. Redis clients are separate from PostgreSQL. No per-request direct `pg`/Postgres pool construction was found. The local listener census showed one API and one Vite server, with a watcher/supervisor process tree; those parent/child processes are not multiple API listeners.

Existing table subscriptions are shared and reference-counted. The backend and frontend both consume some invalidation signals for relay/recovery; that redundancy is intentional and was not removed without evidence of a leak. Legacy CLOSED-channel recovery now uses jittered exponential backoff up to approximately 30 seconds instead of repeatedly replacing channels after 500 ms. Its warnings are rate-limited and omit raw error objects. Necessary subscriptions, fallback refresh and reconnect reconciliation remain enabled.

The backend collaboration-version probe is now single-flight, bounded at ten seconds and explicitly avoids SDK retries, preventing indefinitely stalled probes from overlapping once per minute. Authentication/session revalidation intervals and role checks remain unchanged.

## Verification

* Backend and frontend builds pass (existing frontend bundle advisories remain).
* All 17 targeted tests pass. They cover adaptive polling/wake/stop/single-flight/error recovery, RPC/Auth/Storage deadlines, the installed SDK's cancellation/retry behavior, actual owned-image worker processing and failed cleanup retention, road assembly/authorization, report cancellation, Socket.IO authorization/deduplication, and operational cleanup. Storage and maintenance mutation tests use isolated mocks, never operational objects.
* Authenticated Playwright: overview returned 41 current assignment rows with **zero route caches**, preserving 28 GPS markers. Selecting one truck returned **one route cache**. Both responses were HTTP 200. Back to All Trucks returned to overview.
* While Master List was active, a 32-second observation recorded **zero Home road reads** and 50 mounted table rows. This exceeds two previous 15-second polling intervals.
* New Admin-only `GET /api/health/workers` returns per-process counters and next delay, never job payloads or credentials. Its first runtime sample showed both workers alive, one poll each, zero jobs/errors and next idle delays approximately 28–32 seconds. At 12:59:08 UTC, the same process (started 12:54:50) showed four polls per worker, zero jobs/errors, and next idle delays approximately 124–131 seconds including jitter. This confirms idle backoff in the running backend, not just a unit fixture. It is not a Supabase host-memory endpoint.

For regression reproduction from `backend`:

```powershell
node --import tsx --test tests/adaptive-worker.test.ts tests/maintenance-workers.test.ts tests/supabase-request-scope.test.ts tests/report-read-timing.test.ts tests/road-routing-read.test.ts tests/collaboration-socket.test.ts tests/collaboration-auth.test.ts tests/offload-cleanup.test.ts tests/report-source-scope.test.ts tests/auth-upstream-unavailable.test.ts
```

## How to verify resource reductions

1. Roll these application changes through the normal deployment process for **every** backend instance and frontend deployment. No deployment was performed by this task. Avoid editing/restarting dev workers during measurement because startup resets idle backoff. Check the Admin-only worker endpoint at two timestamps; compare poll/error/job deltas and instance start times. At steady idle, expect about 0.5 claims/minute per worker, with jitter.
2. Use `backend/scripts/diagnostics/supabase-resource-audit.sql` for occasional timestamped read-only snapshots. Compare `pg_stat_statements` call/time/block deltas over equal 10–30-minute windows with equivalent users and activity. Never reset counters to manufacture a comparison. Account for other clients, deployments, SQL Editor, Studio and MCP tooling.
3. In Supabase Database Health/Reports, record verified compute size, memory-used/commitment definitions, swap usage **and swap-in/out rate**, disk IOPS/throughput and disk-I/O credit balance. Compare a quiet baseline and ordinary operation over several hours. Swap allocation can remain elevated after pressure subsides; sustained swapping rate matters. A 99% I/O budget means burst credits recovered, not that the original memory cause is resolved.
4. In Logs, filter the incident's exact UTC range and separate API gateway, Auth, PostgREST, Realtime, Storage and PostgreSQL entries. Request ingestion **bytes by source**, not just visible row counts. Group 522s by path/time and correlate with host memory/swap, OOM/recovery/startup messages and provider service status. Avoid exporting authorization headers, provider tokens, full Mapbox URLs or email/record payloads.
5. Compare *new* ingest growth over matching periods; the existing billing-cycle 2.38 GB total will not drop retroactively. Reducing Node console output is not equivalent to reducing Supabase gateway ingestion. Fewer successful/failed upstream requests can reduce platform logs, but byte savings must be measured there.

## Approval and unresolved hypotheses

No Supabase schema/function/index/RLS changes, data deletion, statistics resets or instance restart were executed. No new index is justified by the confirmed queue findings. Do not reduce connection limits, edit memory settings, remove replication slots or disable Realtime as an unmeasured remedy.

If host pressure persists after rollout and a quiet baseline, investigate insufficient verified compute, provider-service memory use, expensive query planning/concurrency, OOM/recovery, or a provider/network incident with Supabase support. A 522 is an origin connection timeout and is not proof that application SQL caused it. Compute changes, database configuration tuning or view/RPC/index changes require a separate evidence-backed proposal and approval.

References: [Supabase high RAM usage](https://supabase.com/kb/troubleshooting/exhaust-ram), [high Disk I/O](https://supabase.com/kb/troubleshooting/exhaust-disk-io), [observability reports](https://supabase.com/docs/guides/observability/reports), [Logs usage](https://supabase.com/docs/guides/platform/manage-your-usage/logs), [Cloudflare 522](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/).

## Files changed for this task

Backend: `src/utils/{adaptive-worker,supabase-request-scope,report-read-timing}.ts`; `src/services/{user-maintenance,master-image-cleanup,user-workspace,account-picture,user-activity,road-routing-read}.service.ts`; `src/services/collaboration-server.ts`; `src/routes/{tracking.routes,health}.ts`.

Frontend: `src/components/admin/{RoadRoutingPanel,LiveTripMap}.tsx`, `src/components/admin/home/HomeCommandCenter.tsx`, `src/services/{road-routing,realtime.service}.ts`.

Verification: new `backend/tests/{adaptive-worker,maintenance-workers,supabase-request-scope}.test.ts`; updated `road-routing-read.test.ts`; read-only diagnostic SQL above; this report. Prior worktree changes remain preserved. No commit, push or deployment was performed.
