# Cached road-routing checkpoint — October 17, 2026

**Follow-up:** planned generation/cache separation and the disabled warehouse pin
editor are now prepared and tested locally. See `planned-route-approval.md` for the
exact unapplied SQL/checksum, compatibility, test evidence and approval boundaries.
The historical cache limitations below describe the currently applied live schema.

## Scope and safety

The Admin/Staff dashboard and Trip Details now default to **Road routes**, using
Mapbox GL JS. **Recorded events** preserves the existing Leaflet view; its dashed
warehouse/store connections are explicitly labelled schematic, not road routes.
Neither the new map nor its read API requests Directions or collects GPS.
`TRACKING_ENABLED=false` and `POD_PDF_ENABLED=false` remain unchanged.
No migrations, SQL execution, operational writes, receipt changes, token changes,
deployment changes, paid requests or live GPS acceptance occurred.

## Data path and permissions

`GET /api/tracking/roads?trip_ids=<comma-separated physical UUIDs>` uses existing
JWT/app-session middleware and requires ADMIN or STAFF. TRUCKER is denied.
Maximum 50 distinct trips; bounded batched reads cover trips, stops, assignments,
warehouses, stores, trucks, drivers, current tracking locations and route caches.
Archived transactions and retired assignments are excluded. Assignment and driver
profile must both match a saved location; optional controlled-test scope applies.
No browser SELECT grant or publication is added.

For existing cache rows, the existing service-only `tracking_route_context_v1`
RPC is called read-only (`p_lock=false`), at concurrency two. Its current context
and ordered destinations are checked against the saved destination fingerprint.
A changed context withholds old geometry. This is bounded per cached assignment;
the API is not intended as an unlimited historical export.

Client reads reuse token-scoped request deduplication/cache, retain valid content
on refresh failure and discard late responses after logout or changing trip sets.
Refresh is 15 seconds, with targeted collaboration/assignment/location signals.
The page renders at most 50 trips; additional trips require another selection.

## What renders

- One GeoJSON source and line layer contain independently identified route features.
- Each route has a stable palette color; selecting a trip emphasizes its line.
- Warehouse (W), numbered stop and last authorized truck (T) markers are reused.
- Planned mode orders warehouse and all active stops by `stop_sequence`, then stop
  identity for ties. Remaining mode uses the authorized saved truck position and
  excludes COMPLETED, DELIVERED and CANCELLED stops. Deliveries are never optimized.
- Duplicate physical stop IDs, invalid coordinates and missing origins/destinations
  withhold geometry and show a reason; no straight-line substitute is generated.
- A valid geometry is rendered vertex-for-vertex. It is never regenerated from
  warehouse/stop points. Longitude precedes latitude in GeoJSON and GL coordinates.
- Selection/mode/context changes fit road bounds. Ordinary GPS marker movement
  neither replaces road data nor refits the viewport.
- Details include dispatch, driver, plate, warehouse, next undelivered stop,
  remaining count, road distance/duration when available, location time/accuracy,
  calculation time and stale/unavailable/error status. Timestamps use Manila time.
- Map WebGL/resource failures retain readable route details. Layers, sources,
  markers and listeners are cleaned up on unmount; removed trips lose their pins.

## Important production data and cache limitations

Read-only SDK inspection of the configured project found:

| Existing source | Rows | Usable coordinate pairs |
| --- | ---: | ---: |
| warehouses | 7 | 1 |
| customer_stores | 8 | 8 |
| trips / stops / assignments | 6 / 7 / 6 | n/a |
| trip_tracking_locations / trip_route_cache | 0 / 0 | n/a |

Warehouse/store latitude and longitude columns already exist. **No coordinate
schema migration is necessary.** Six warehouse locations require separately
authorized verification/data entry; none was silently geocoded or changed.

The current atomic cache stores **one remaining-route variant per assignment**.
The read API labels it `remaining`; it never relabels it as a planned route.
Both modes render and are tested with isolated mode-specific cache fixtures.
Production planned geometry generation/storage is **not complete**: a future
approved extension of the existing cache/RPC must distinguish planned and remaining
fingerprints, leases and metadata. Do not overwrite the remaining cache with a
planned variant or create a duplicate location table. No proposed SQL is applied.
With zero saved routes/positions, current production displays truthful unavailable
states and available warehouse/stops, rather than invented road lines.

## Coordinate management implementation plan (writes disabled)

1. Extend existing Admin/Staff warehouse/store forms, using existing record IDs and
   coordinate fields. Display current coordinates read-only before offering a draft.
2. A map pin drag/click changes a **local draft** only. Explicit latitude/longitude
   labels and bounds checks prevent order reversal (latitude ±90, longitude ±180).
3. Show existing versus proposed pin and require explicit verification/Save. Do not
   auto-geocode or replace existing coordinates on opening the form.
4. After separate write authorization, reuse protected master-data update APIs and
   concurrency checks. Invalidate only routes containing that warehouse/store.
5. Preserve stop order and provenance; coordinate verification does not edit trips,
   stops, receipts, DR numbers or delivery milestones.

## Cache reuse and live-acceptance prerequisites

The existing worker retains hourly refresh, context revision/leases, shared request
budget, retry backoff and retained last-good geometry after provider failure.
GPS coordinates are excluded from the destination fingerprint: pins move frequently,
routes do not. This checkpoint does not start that worker or relax its activation.

Before live road acceptance: verify missing warehouse coordinates, approve a safe
trip/assignment, resolve planned-cache storage if that mode is needed, separately
configure/verify backend Directions credentials and authorize provider usage.
The existing backend Directions token was previously found identical to the public
rendering token; no credentials were copied or printed. Do not treat a public map
render token as proof of approved backend routing authorization.
Phone GPS also needs explicit consent and a trusted HTTPS context; LAN HTTP is not
equivalent to phone localhost. Follow `mapbox-gps-controlled-test.md` before any
scoped activation. Keep both flags false until separately authorized.

## Evidence

- Backend full isolated suite **159/159** (serial); frontend **79/79**.
- Backend/frontend TypeScript and builds pass; targeted changed TS/TSX lint passes.
  Git staged/unstaged whitespace checks pass (existing CRLF notices remain).
- New backend tests cover role denial, bounded physical IDs, coordinates, archived
  filtering, exact assignment/profile locations, ordered sibling stops and cache
  context. HTTP tests deny TRUCKER and invalid trip input.
- New unit tests cover planned without GPS, one/multiple stops, remaining/completed
  stops, duplicate IDs, missing coordinates, stale/error cache, changed inputs,
  source reuse, independent highlighting and cleanup.
- Actual GL browser fixture: **10 road features, 10 warehouses, 20 numbered stops,
  10 trucks**, planned rendering without GPS, remaining completion filtering,
  bounds fit, stable viewport/geometry on pin updates, trip switching and cleanup.
  **0 external requests, 0 Directions requests, 0 GPS writes.**
- Existing tracking-map, tracking-realtime, tracking-controls and Trip Details
  route/direct-refresh browser regressions also pass with isolated fixtures.
- Fixture geometry is decoded from Mapbox's published Directions road-step example
  (Kopenicker Strasse / Engeldamm), with provenance in
  `frontend/tests/fixtures/road-geometry.json`. It is not a fresh provider response
  or proof of road accuracy for an ALZHEN trip.
- GL code is lazy loaded. Its new production chunk is approximately **1.88 MB
  minified / 524 KB gzip**; Vite's existing >500 KB warning remains. Live rendering
  latency and current route accuracy have not been measured or claimed.

No live GPS/provider or authenticated operational mutation is part of acceptance
evidence. Next checkpoint: mode-aware planned-cache proposal and coordinate approval,
then explicit controlled live routing/GPS acceptance. Do not activate automatically.
