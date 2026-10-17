# Planned routes — proposal and local readiness

## Exact proposal requiring approval

`backend/migrations/2026_11_05_proposed_planned_routes.sql`

SHA-256: `41EF6DD91F9E21C4319C5F352F04C2FC35719107B04F2252EFE9FC6A00D83890`

**Applied after exact user approval:** migration `20261017124148` (`planned_routes`)
on project `hdmknewarynwpbrhfgai`. Disk checksum matched the value above; Supabase MCP
confirmed success and history contains exactly one entry. Eleven columns/two RPCs
and restricted ACLs verified. Existing six tracking RPC definitions, original cache
constraints/ACL/RLS/publications and data fingerprints across 30 tables were unchanged.
Read-only planned/remaining context smoke checks passed for all six assignments;
existing feed returned zero locations. Cache/GPS tables remain empty.
TRACKING_ENABLED=false, POD_PDF_ENABLED=false; PLANNED_ROUTES_ENABLED is unset and
defaults false. No route generation, GPS writes, coordinate updates, provider calls,
Storage changes, deployment, commit or push. Local fixture evidence below remains
distinct from this live read-only schema verification. **Do not reapply this file.**

## Inspection and compatibility

Supabase MCP initially required reauthentication. After the user reconnected,
read-only schema/catalog checks succeeded and matched the existing migration files:

- `trip_route_cache` has an assignment primary key/FK, one remaining-route geometry,
  fingerprint, calculation/next-routine timestamps, lease/retry/revision metadata,
  distance/duration and shared usage counters.
- Existing assignment/context/write RPCs are SECURITY DEFINER, execute only for
  the database owner/service role; no PUBLIC/anon/authenticated RPC execution.
- The cache has RLS enabled, no browser SELECT grants, and neither private tracking
  table is published to `supabase_realtime`. These boundaries remain unchanged.
- Warehouse/store coordinate columns already exist. Seven warehouses, one valid
  coordinate pair: **six require explicit location verification**, not a migration.
- Trip association remains through the existing assignment FK. No duplicate location,
  tracking, route table or independently editable trip identity is introduced.

## Purpose and affected objects

Adds 11 `planned_*` columns to **existing** `public.trip_route_cache`: fingerprint,
geometry, calculation/expiry, distance/duration, lease token/expiry, retry/error and
revision. Existing rows retain all existing remaining values; new planned fields
are NULL except revision default zero. Existing PK, FK, RLS and grants are untouched.

Adds only these service-only RPCs:

```text
planned_route_context_v1(uuid, boolean)
planned_route_write_v1(uuid, uuid, text, uuid, text, text, bigint,
                      jsonb, double precision, double precision, text)
```

The context resolves warehouse + every non-archived stop in `stop_sequence`, then
physical ID order. It reads no GPS. Planned eligibility does not require an active
location session or a driver profile; an active physical assignment is required.
Trips with no assignment remain explicit unavailable cases; no synthetic assignment
is created. Completed/cancelled trips cannot generate new planned routes.

The write RPC verifies actor ADMIN/STAFF and locks/rechecks assignment, parent trip,
stops, stores and warehouse before lease/finalization. One planned revision/token
controls concurrent work; expiry is one hour. Geometry is bounded to 20,000 vertices,
1 MiB and valid longitude/latitude pairs. Destination/warehouse context changes
reject a stale finish. A failed refresh retains the last good planned geometry.

The two variants share the **existing advisory lock and request counters** (30
company-wide claims/minute), so adding planned routing does not double the budget.
Shared request counters may change during future planned generation; remaining
geometry, fingerprint, lease and revision do not. A planned-only cache row uses a
64-zero remaining fingerprint placeholder with NULL remaining geometry, preserving
the existing required column and legacy RPC behavior. It never represents a real
remaining route. Existing remaining RPC definitions are not replaced.

No new publication, direct browser policy, SELECT grant, Storage change, trigger,
index, coordinate backfill or operational update is proposed. Existing service-role
table INSERT/UPDATE privileges already cover the new columns.

## Application readiness (disabled)

- `POST /api/tracking/roads/:assignmentId/planned`: existing JWT/app-session and
  ADMIN/STAFF authorization; actor is server-derived. Disabled requests return 503
  **before any cache/context/provider operation**. TRUCKER receives 403.
- `PLANNED_ROUTES_ENABLED` defaults false/unset; example template sets false.
  Do not enable merely because this SQL is approved. Provider use and activation
  require separate explicit authorization. GPS/PDF flags remain false.
- The service resolves exact warehouse/stops, validates missing/bad coordinates,
  sorts deterministically and coalesces concurrent requests. Ten trip fixtures
  retain independent caches. Valid caches are reused; expiry/context change permits
  refresh, transient failures preserve geometry/backoff. No GPS repository is used.
- Maximum 24 delivery stops + warehouse (25 coordinates). Larger trips get an
  explicit `PLANNED_WAYPOINT_LIMIT` error **before claiming or provider use**. Nothing
  is silently omitted or reordered. Multi-request segmentation is not implemented.
  Limit reference: https://docs.mapbox.com/api/navigation/directions/
- Reuses the existing Directions adapter's bounded concurrency, queue, timeout,
  response size/geometry validation and local budget; SQL provides multi-instance
  shared budgeting. Backend credentials remain server-side.
- The protected road read API returns separate `plannedCache` and `cache` variants.
  New columns/RPCs are accessed only when the new flag is enabled, preserving
  compatibility with the current live schema. GPS marker updates do not reroute.
- Successful future finalization emits the existing management-only tracking
  invalidation signal, after persistence. Cached reads remain token-isolated.

## Warehouse editor — safe local preview

Road routes → **Warehouse coordinates** reads the existing paginated management API.
Lists existing/missing locations; displays saved latitude/longitude and a local draft.
Clicking the map places a Draft pin; numeric edits validate bounds and clearly show
GeoJSON's `[longitude, latitude]` order before saving. Empty coordinates are never
converted to `(0,0)` or guessed. The existing W pin is retained for comparison.

**Save coordinates (approval required) is disabled. There is no save API call in
this component.** Drafts are account-scoped and disappear when the editor unmounts;
opening it does not alter warehouse fields. It cannot change trip/store/receipt data.
Coordinate persistence should later reuse the existing protected warehouse API,
update only latitude/longitude after verification and invalidate affected routes.

## Verification before any approved application

1. Verify exact file SHA-256 and connected project/backend configuration again.
2. Read-only: verify cache column/constraint/grant/RLS contracts, exact existing RPC
   signatures, and absence of proposed columns/functions or conflicting names.
3. Save schema definitions and an existing cache snapshot privately for recovery.
4. Apply only the approved file transactionally; three-second lock timeout fails
   safely rather than waiting indefinitely. Stop on any error; no corrective SQL
   without approval.
5. Read-only verification: eleven planned columns, two functions, restricted execute
   ACLs/SECURITY DEFINER/search_path, unchanged original RPC definitions, PK/FK/RLS,
   original remaining cache values/row count and no publication/browser grant changes.
6. Keep every generation/tracking flag disabled until separate provider/coordinate
   acceptance scope is authorized. Do not generate routes as a schema test.

## Recovery and rollback

Preferred immediate rollback: `PLANNED_ROUTES_ENABLED=false`, restart backend and
retain planned data. The old API/RPCs continue using original columns. No GPS/PDF
flag needs enabling. Do not delete cache rows: they may contain remaining routes.

If a later schema removal is approved, first disable planned callers/workers, export
the planned data, and verify no consumer depends on the new objects. In one reviewed
transaction drop only the two exact functions above, then the eleven columns listed
below (no CASCADE). Existing remaining columns/functions and all cache rows remain:

```text
planned_fingerprint, planned_geometry, planned_calculated_at, planned_expires_at,
planned_distance_meters, planned_duration_seconds, planned_lease_token,
planned_lease_expires_at, planned_retry_after, planned_error, planned_revision
```

Do not run schema removal without approval/backup. The proposal contains no cleanup
of existing route rows. Existing inactive-assignment pruning is unchanged and can
remove both variants according to its original remaining-cache timestamps; this
does not establish a separate seven-day planned-history retention promise.

## Test evidence and limitations

- Backend full suite **164/164**, frontend **81/81**, TypeScript/builds and targeted
  lint pass. Existing Vite large-chunk warning remains.
- New disposable PostgreSQL 18 database: compile against existing tracking migrations;
  verify missing origin/stop, >24 stops, order/context invalidation, expiry, actor/RPC
  ACLs, unchanged existing six RPC definitions, RLS, shared budget, remaining cache
  preservation, retained geometry on failure, and **zero GPS rows**.
- Two independent psql connections race for one planned lease: **1 success, 1 denied**.
- Actual GL browser fixture: ten route features, planned without GPS, separate markers,
  stable road source/viewport during pin movement, selection, stop completion and cleanup.
- Warehouse browser fixture: STAFF access, one mocked warehouse read, existing/missing
  coordinates, numeric validation, map pin selection, unchanged source records,
  disabled save, cleanup; **zero mutations and zero external requests**.
- All provider responses are fixtures. No live routing accuracy, billing/token
  authorization, warehouse save or GPS acceptance is claimed.

Local SQL reproduction uses a **fresh disposable database** in a verified owned
loopback-only cluster (never Supabase): tracking-schema.sql → original base/atomic
tracking migrations → planned-routes-schema.sql → proposed planned migration →
planned-routes-check.sql. The concurrency fixture accepts the new database name
(`planned_route_*`) and exact verified cluster directory, uses port 55443 and checks
`SHOW data_directory` before its synthetic operations. Do not rerun on an existing
fixture database or an operational database. Retain files for diagnosis, stop cluster.

Next approvals: this exact SQL; then verified coordinate edits for designated
warehouses; then backend token/provider budget and explicit planned-route activation
for a safe test assignment. **None is inferred from the others.**
