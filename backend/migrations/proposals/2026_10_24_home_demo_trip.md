# Home demonstration trip - applied

The exact executable seed is [2026_10_24_home_demo_trip.sql](2026_10_24_home_demo_trip.sql). It was approved and executed on 2026-10-24 (Philippine time). No schema changes were made.

The existing trip APIs and schema were inspected. The reviewed SQL seed was used because creating a fictional driver through Users would normally create an authentication account, and tracking-session creation requires a real driver's consent. Neither is needed for a labeled dashboard demonstration. The seed uses existing physical tables and leaves normal relationship and convoy guards enabled.

## Scenario

- Dispatch: `DEMO-HOME-20261024`, database status `IN_PROGRESS`.
- Fictional customer and carrier; a `DEMO-1024` Wing Van with 45 CBM capacity and a fictional driver without an auth account.
- Valenzuela warehouse → North EDSA receiving point (completed) → Ermita receiving point (pending).
- Four cargo lines: 10 refrigerators, 20 televisions, 8 refrigerators, 12 washing machines. Total: **50 units / 21.60 CBM**, fully allocated to the truck.
- Coordinates reuse the existing Mapbox-generated Metro Manila fixture. The sites are clearly named as fictional demo receiving points, not affiliated with the nearby malls.
- Five explicitly labeled demonstration events, including one static `DEMO_SIMULATED_GPS` street-coordinate sample after the first stop. No GPS is collected from a device.

## Exact insert scope

| Existing table | New rows |
|---|---:|
| customers | 1 |
| trucking_companies | 1 |
| trucks | 1 |
| drivers | 1 |
| warehouses | 1 |
| customer_stores | 2 |
| products | 3 |
| trip_types | 1 |
| trips | 1 |
| trip_truck_assignments | 1 |
| trip_stops | 2 |
| trip_line_items | 4 |
| trip_assignment_stops | 2 |
| trip_cargo_allocations | 4 |
| trip_events | 5 |
| **Total** | **30** |

Normal existing audit/Realtime triggers may emit their usual change signals. Existing operational rows are not updated. Creator fields remain null rather than attributing simulated work to a real staff member. There are no new `auth.users`, `profiles`, `trip_tracking_locations`, consent/session, billing, invoice, or POD records.

Every record uses the reserved UUID prefix `d0241024-0000-4000-8000-` and belongs to `[ALZHEN_HOME_DEMO_V1]`; child ownership follows the physical trip/assignment IDs. Rerunning fails closed rather than modifying an existing record. Use the existing whole-trip deletion workflow and relationship protections when removing the demo later, followed by deletion of its isolated master records. Do not disable history or foreign-key guards.

## Road activation after approval

The local backend configuration has `PLANNED_ROUTES_ENABLED=true`; the existing development watcher was reloaded. Use **Calculate demo road route** to request refresh subject to the existing hourly guards. Its existing server-side Mapbox Directions token must be configured; do not expose it in frontend code.

That deliberate action calls the existing authorized `/tracking/roads/:assignment/planned` API. It saves real Mapbox geometry to the existing `trip_route_cache` using the existing context fingerprints, leases, provider budget and one-hour refresh guards. The seed does not insert guessed geometry or a forged fingerprint. Page reads do not invoke Directions. No tracking worker or hourly policy is changed; `TRACKING_ENABLED` can remain false.

The static demo position comes only from the tagged event on the exact demo trip and assignment, is labeled **Demo / Simulated GPS**, never replaces an available real driver fix, and never enters the live tracking feed. If routing is unavailable, the interface reports that state and does not draw a straight-line substitute.

## Frontend email example

One separate frontend-only email request is added to the existing shared request store and shown under **Incoming Trip Requests**. Its `Pending` workflow value is displayed as **Pending Review**. Review, approve, decline and messages use the existing local sample workflow; they do not create trips, send email, or connect n8n. No database approval is needed for this preview.

No automated tests, builds, schema migrations, commits, pushes or deployments were performed. SQL insertion, local planned-route activation, authenticated Mapbox generation and Playwright visual inspection were authorized and completed.

## Execution and verification

- Coordinate reviewer: authenticated Admin Marc Aspa, `8eaf7847-e806-493d-8338-ac0412153245`; only the three new fictional location rows reference this reviewer. Coordinates were checked against the existing Mapbox road fixture.
- Inserted exactly 30 demo records across all 15 listed existing tables. The transaction rejects an occupied demo namespace or dispatch; it never updates/upserts existing rows.
- The existing reference trigger generated `TRIP261023-1` from the trip's loading date; dispatch remains `DEMO-HOME-20261024`.
- Authenticated planned-route API returned UPDATED: 881 road geometry points, 27,107.756 metres, 4,318.596 seconds. Saved at 2026-10-24 02:12:24 PHT, expires 03:12:24 PHT. A second calculation left the calculation/expiry unchanged, confirming hourly reuse.
- Route cache adds one derived record beyond the 30 seed records. Normal application audit/change signals remain enabled.
- Desktop visual inspection confirmed warehouse, amber simulated truck, completed North EDSA stop, pending Ermita stop, road geometry, active-trip/truck totals and 1/2 delivery progress. Email Review opens the existing request dialog with the demo disclaimer and Pending Review status.
- Live driver tracking was not enabled; the GPS sample remains static. No automatic scheduler was added: cache refresh uses the existing deliberate calculation action and hourly guards.
- Activation applies to this local backend. A separately hosted backend would need the same environment setting and existing server-side Mapbox token; nothing was deployed.

## Safe removal procedure (not executed)

1. In Trips / Master List, identify **only** dispatch `DEMO-HOME-20261024`, physical trip ID `d0241024-0000-4000-8000-000000000100`. Use the existing Admin **Delete Entire Trip** preview/confirmation workflow. Do not delete by name wildcard or bypass guards.
2. The authenticated impact preview on 2026-10-24 had no blockers and showed exactly: 2 stops, 4 line items, 1 truck assignment, 2 assignment-stop links, 4 cargo allocations, 5 events, 1 cached route; zero images, tracking locations, billing or other operational dependencies. Re-run preview immediately before deletion; stop if new unrelated references appear.
3. Confirm deletion through that workflow, then verify the trip, its children and assignment cache are absent. Keep normal deletion audit history. This document grants no instruction to execute cleanup now.
4. Delete isolated master records through existing protected Database/Users actions, checking exact IDs and fresh references first: driver suffix004 (do not deactivate/delete an Admin account), truck003, stores011/012, products021/022/023, warehouse005, trip type006, customer001, carrier002. All IDs have prefix `d0241024-0000-4000-8000-`. Delete dependants before parents. If a master type has no supported deletion UI, request a reviewed exact-ID cleanup transaction; never disable foreign keys or delete unrelated records.
5. The frontend email request is separate: remove its mock-store inclusion in `requestsStore.ts` and Home preview when retiring the demonstration. No email-request database records exist.

Mobile verification at 390px confirmed no horizontal page overflow, all four map markers, cached route details and the demo email preview. Switching to Requests and back can emit existing Recharts zero-size warnings while hidden charts are measured; the visible charts render and no page errors were reported after reload. No unrelated chart lifecycle changes were made.
