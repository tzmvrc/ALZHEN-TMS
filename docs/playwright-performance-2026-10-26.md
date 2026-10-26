# Playwright performance investigation — 2026-10-26

## Scope and method

Read-only Playwright inspection against the running app and Supabase project. One authenticated admin session; no operational rows were edited, imported, or deleted. Scrolling probes used fixed steps and waits; `actionMs` is click completion, while `observationMs` includes the stated wait and pending API reads. The production probe used a locally served Vite build against the same backend. The reproducible navigation probe is `frontend/scripts/table-performance-probe.js`; its detailed observations are in `performance-browser-navigation-2026-10-26.json`.

The live fixture had roughly 30 trips, 120 product lines, 60 stops, and 45 trucks. These measurements cannot establish performance at 10,000+ rows.

## Confirmed causes and fixes

| Area | Browser evidence | Change |
| --- | --- | --- |
| Trips / reports grid | Before: ~28,155 DOM nodes, maximum long task 1,102 ms, and five reads during a 12-step vertical scroll. CPU profile showed React element creation dominating. | Move virtual row state to a child so scrolling does not render the entire report; reduce overscan; bucket formula reads by stable 80-row pages; mount expensive cell content near the horizontal viewport while retaining physical cells for selection/pinning. |
| Repeated navigation | Before: Trips clicks 821–854 ms across three repeats. | Stabilize Dashboard navigation callbacks and resource components, keep valid report snapshots and shared design context stable. After: 355–390 ms for warm Trips clicks. |
| Database Trucks | Opening 30 trucks issued 32 requests, including one image request per row. | Batch visible truck image metadata/signing through an authenticated GET endpoint; preserve existing upload/delete, cache invalidation, and individual image API. After: three requests (design, rows, one image batch). |
| Reports / Operations | Workspaces and rows performed work while inactive; source had eager fetches and repeated formatting. | Retain only active workspaces, use the same virtual row child in report, database, tracker, operations, and flexible tables; reuse date/number formatters. Operations with 61 events had 21 mounted rows and no requests or long tasks during a 12-step scroll. |
| CSV preview | Large files parsed on the main thread. | Worker parsing above 256 KiB and bounded preview pages. A synthetic 5,000-row, 797 KiB file parsed into a 50-row preview in ~0.5 s before the probe's 800 ms wait; maximum long task 143 ms. The import/save endpoint was not invoked. |
| Master List full-page reads | A full page performed a second, serial `v_trip_master_csv` request for its exact count. Combining rows and count later caused more database timeouts. | Read rows separately, scope default pages to the leading trip IDs, and count the one-to-one source view for unfiltered pages. Keep a positive Master List schema result for five minutes. |

## Before and after browser observations

| Interaction | Before | After |
| --- | --- | --- |
| Trips vertical scroll, same 12 steps plus 0.6 s wait | 11.35 s elapsed; max long task 1,102 ms; five API requests; ~28,155 DOM nodes | 1.9–2.0 s elapsed; max long task 102–163 ms; zero API requests; ~6,552 DOM nodes in development. Warm production runs: 1.86–1.89 s, max long task 55–66 ms, zero requests. |
| Trips horizontal scroll, 10 steps plus 0.5 s wait | 2.33 s; max long task 322 ms | Warm production: 1.78 s twice; max long task 63/50 ms; zero requests; 4,694 DOM nodes. |
| Operations populated scroll | Previously unmeasured | 1.89 s including 1.8 s programmed wait; zero long tasks, zero requests, 21 mounted rows. |
| Database Trucks load | 32 requests for 30 trucks | 3 requests, including one ~2.2 KiB image batch; no image errors. |
| Three canceled live cell edits | Previously unmeasured | Editor opened in 187–202 ms; typed text then Escape restored the original value each time; no save request. |
| Broad Master List search | `DEMO30` took 5.47 s in one real browser run; one subsequent attempt timed out. | The combined row/count sample was 2.33, 2.17, and 1.51 s for `DEMO30`, `DEMO`, and `TRIP`, but it regressed reliability and was reverted. These are small samples, not an SLO. |

All six Trips/report tabs, six Database tabs, two Users tabs, and the populated Operations report were opened. The master data tables returned bounded pages. The navigation probe observed Trips, Database, and Users DOM counts remain around 23,000 after repeated switching; this is not a memory leak proof. Some tab observations had an earlier request still in flight, so their `observationMs` values are not isolated cold-load benchmarks.

## Remaining backend bottleneck

Master List uses `v_trip_master_csv`, a deeply nested view. Supabase gateway logs over this investigation showed 90 reads in 30 minutes, average origin time ~2.03 s, maximum 11.07 s, and one HTTP 500 caused by PostgreSQL statement timeout (`57014`). A Playwright search for `DEMO30` took 5.47 s once; another broad search timed out. Combining rows and the exact count removed the second serial view request but later increased timeouts, so it was reverted. A narrow `DEMO30-002` search returned four rows in roughly 1.1–1.45 s. An intermittent slow request remains possible.

`EXPLAIN (ANALYZE, BUFFERS)` on the current small fixture gave ~0.2–0.8 s planning and ~0.04–0.26 s execution for simplified queries, but the real PostgREST request ranged from ~1 to 11 s. Its plan touches ~26,000 cached buffers for 120 rows and repeatedly expands nested joins and status flags. Existing indexes cover the principal trip/stop/line foreign keys; adding an arbitrary index would not fix the measured timeout. No view rewrite or speculative index migration was applied. Search at much larger volume remains unverified and is the highest-priority backend limitation.

Authentication contributed roughly 0.3–0.8 s per report request. Its fresh identity/profile/session checks were retained to preserve access control. Other limits: Vite still warns about large Mapbox and ExcelJS chunks; no large dataset or controlled multi-user realtime load was available. No new database migration was applied in this Playwright pass. The two additive indexes/RPC migrations described in `system-wide-performance-2026-10-26.md` were part of the earlier pass.

The positive Master List schema check now refreshes every five minutes instead of every minute. A schema installed while the backend stays running may therefore take up to five minutes to be detected; restarting the backend clears this process-local check. No operational records are cached by it.
