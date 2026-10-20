# Phase 4.2 - Convoy trip planning (corrected confirmed layout)

## Evidence and scope

Read-only inspection used ALZHEN Supabase project `hdmknewarynwpbrhfgai`, matching MCP configuration and both application URL references. Inspected live columns, assignment indexes/constraints/triggers, report view definitions, POD/operations/tracking foreign keys, and the existing assignment, report, tracker, trucker, tracking and Trip Details source paths. No convoy schema, assignment data, convoy UI or convoy migration was implemented. This is a documentation-only planning correction: the flat truck-at-stop layout below supersedes the earlier expandable-parent recommendation. Remaining business rules and any database work still require review before implementation.

## Current schema findings

- `trip_truck_assignments` already has a physical UUID primary key and `trip_id`, `truck_id`, `driver_id`, `trucking_company_id`, `assignment_type`, `assigned_at`, `unassigned_at`, remarks, timestamps and collaboration revision.
- No unique constraint or unique index restricts one assignment per trip or one truck per trip. Live assignment indexes are the primary key plus ordinary trip/truck indexes. Multiple assignments are structurally possible today.
- `assignment_type` is text with no enum/check restricting PRIMARY/SECONDARY. The existing service normalizes input to uppercase. PRIMARY is actively used by reports; SECONDARY can be represented, but end-to-end convoy semantics are not implemented.
- Assignment triggers maintain timestamps, collaboration revisions and admin change signals; none enforces a unique primary assignment.
- The current inspection had zero trips/stops/assignments/PODs, so there were no live convoy examples from which to infer business rules. This is the current phase baseline, not evidence of a deletion performed by this task.
- Trips has no authoritative truck/driver fields on the parent; assignments hold those relationships. Stops are independently keyed and uniquely sequenced per trip. Line items have trip and optional stop identity.
- Trucks/drivers/trucking companies remain shared master entities with existing foreign keys. They must never be copied or deleted to implement convoy membership.

## Existing one-truck assumptions

`v_dispatch_monitoring`, `v_tms_combined` and `v_dispatch_report` use a `unique_active_primary_assignments` CTE. They expose one active PRIMARY only if exactly one exists. Multiple active PRIMARY assignments produce no selected primary, rather than arbitrarily selecting a driver or multiplying every stop/line item by assignment count. SECONDARY trucks are omitted from this summary.

Store Calling identity enrichment similarly uses the unique active primary assignment. Transmittal row construction explicitly suppresses ambiguous primary assignments. Operations report construction has a primary-by-trip mapping. These paths require a coordinated convoy-aware projection at the confirmed truck-at-stop grain. Joining all assignments, stops and line items indiscriminately would multiply unrelated quantities and reports.

The assignment list API already returns an array and physically identified create/update endpoints exist. `.single()` on insert/update RETURNING or `.maybeSingle()` filtered by assignment ID is safe; those are not proof of a single assignment per trip. Report edit target selection and primary summaries are the relevant constraints to audit when adding convoy editing. Trip Details already consumes assignment-related updates; its assignment UI must present all active members and assignment history explicitly.

Trucker services load all driver-owned assignment rows, but the dashboard derives a current/active assignment and truck. Operations authorization checks the current driver's active assignment to the trip, not an arbitrary plate label. Allowing multiple convoy drivers to access a parent trip must not automatically authorize them to modify another member's truck-specific records.

## Confirmed Trips spreadsheet layout

Keep Trips as a normal spreadsheet. Display **one standard row per truck assignment at each applicable physical stop**, repeating shared trip and stop information. Do not introduce expandable parent rows, assignment subrows, member subgrids or nested truck lists in Trips.

One trip with two trucks and two applicable stops displays four rows:

| Physical trip | Physical stop | Physical assignment | Dispatch | Truck | Driver |
| --- | --- | --- | --- | --- | --- |
| Trip T | Stop S1 | Assignment A | DSP-001 | ABC-1234 | Driver A |
| Trip T | Stop S1 | Assignment B | DSP-001 | XYZ-5678 | Driver B |
| Trip T | Stop S2 | Assignment A | DSP-001 | ABC-1234 | Driver A |
| Trip T | Stop S2 | Assignment B | DSP-001 | XYZ-5678 | Driver B |

Both trucks may appear at both stops. These are four presentation rows over **one trip, two stops and two assignments**, not four independent deliveries. Keep Driver, Plate Number and Dispatch Number as separate columns, with the existing aliases and shared formatting infrastructure. The earlier Options B/C (multiple trucks inside one cell or an expandable parent row) are not the approved Trips design.

Opening any of these rows must navigate to the same `/trips/<trip_id>` Trip Details page. Preserve the selected stop context where supported, and optionally pass assignment context without changing the parent trip identity. Trip Details must show all assigned trucks, their drivers and trucking companies, plus assignment history where applicable. It is the shared trip page, not a separate trip per convoy member.

## Stable row identity and editing scope

The canonical Trips convoy row identity must include physical `trip_id`, `trip_stop_id` and `assignment_id`. Do not use dispatch text, plate text, stop sequence or displayed row index as identity. If an existing view intentionally has a finer grain, include its additional physical record ID rather than allowing duplicate identities. Missing-stop/unassigned-trip cases need explicit tagged identities; never substitute another stop or assignment.

| Field scope | Authoritative edit target | Expected propagation |
| --- | --- | --- |
| Trip-level | Physical `trip_id` | All rows for that same trip |
| Stop-level | Physical `trip_stop_id`, checked against its trip | All convoy rows representing that same stop |
| Assignment-level | Physical `assignment_id`, checked against its trip | Rows for that assignment only; other assignments remain unchanged |
| Truck-and-stop-specific | A dedicated physical assignment/stop record with same-trip validation | That assignment at that stop only |
| Line-item/report/POD-specific | Its exact physical source record and parent relationships | Only rows presenting that same source record |

The repeated values are projections of shared records. A trip-level edit intentionally appears on other rows of the same trip; a stop-level edit intentionally appears on both trucks' rows for that stop. This is not a reason to perform multiple source writes. A truck-and-stop-specific value cannot be saved against the shared stop or assignment alone when that would change other members/stops.

Keep collaboration cell identities aligned with physical edit scope. Two displayed cells editing the same trip/stop field must reconcile to that shared source cell, whereas assignment fields and truck-at-stop-specific fields must remain isolated. Preserve existing version/conflict handling, live drafts and unrelated unsaved edits.

### Formula reference implications

Future formula adapters must distinguish `(trip_id, trip_stop_id, assignment_id)` convoy rows, even when dispatch and stop text are identical. Bind presentation overlays/references to those physical row identities and stable column keys. Sorting, filtering, pagination, shared aliases and column reordering must not rebind a formula to another convoy member. Source-field references can point to the same shared trip/stop value while remaining distinguishable as presentation cells on separate convoy rows.

Do not migrate existing formula bindings by matching row positions or dispatch numbers. Audit bindings that lack assignment identity; retain unambiguous existing physical bindings and require an explicit resolution strategy for ambiguous historical references before changing the row projection. Never clone a saved formula onto newly introduced assignment rows without a defined user-approved copy rule.

## Multi-stop behavior and data integrity

The confirmed spreadsheet may display the assignment-by-applicable-stop combinations. Three trucks attending two stops therefore produce six visible rows, while the database still holds one trip, three assignments and two physical stops. Do not create six independent delivery records, six PODs or copied line items merely to produce this view.

If responsibilities differ by truck, an assignment-to-stop applicability/responsibility junction may be needed after business review, with physical IDs and database enforcement that both belong to the same trip. It represents participation, not another delivery. Both trucks attending both stops is explicitly supported; do not arbitrarily exclude a secondary truck or infer applicability from PRIMARY alone.

Do not duplicate PODs, line-item quantities, billing, demurrage, Offload/Backload or other operational reports. Repeated rows may display shared source information, but totals, report counts and source exports must aggregate distinct authoritative records at their true grain. A shared stop's quantity displayed for two trucks is not twice the delivered quantity. If quantities are allocated by truck, use separately validated allocations with totals bounded by the original physical item/stop quantity.

If truck-specific progress, PODs, demurrage or incidents are required, define their own physical record scope before adding editors. Existing shared trip lifecycle and stop delivery status remain authoritative unless separately approved responsibility-progress rules are introduced.

## Trip Details assignment workflow and APIs

Plan authorized **add, edit and remove/end assignment controls** in the shared Trip Details page. Display every assigned truck with its driver and trucking company, rather than only the lead assignment. Reuse the existing array-based assignment list, physical assignment CRUD, collaboration revisions and role middleware. All convoy spreadsheet rows must open this same page.

- Add: choose the actual truck, driver and trucking company through existing relationship selectors; never create a duplicate parent trip.
- Edit: target the selected `assignment_id`, not the first assignment or a dispatch-number match. Preserve existing driver relationships unless intentionally changed; require explicit selection when ambiguous.
- Remove/end: affect only that assignment and its approved applicability records. Preserve history, ownership, retention and dependent-record protections; define when ending is required instead of physical removal. Never call whole-trip deletion to remove a convoy member.
- Authorization: preserve existing Admin/Staff boundaries and backend validation. Trucker access to the parent trip must not grant permission to manage other members' assignments.
- Reconciliation: update all repeated rows for the affected physical assignment without rewriting other assignments or discarding unrelated drafts.

If one lead is required, switching it should be atomic without a transient ambiguous-primary state. After data review and approval, consider a partial unique active-primary index and an active `(trip_id,truck_id)` uniqueness rule. These are possible safeguards, not a restriction to one truck per trip. Define overlapping driver/truck availability rules before adding stronger scheduling constraints.

## Reporting, selection, pagination and billing

Trips must use the confirmed flat truck-at-stop projection. Review Combined Report, Dispatch Monitoring, Dispatch Report and Tracker separately for the required convoy display and export grain; do not assume their current primary-only views already expose every truck. Where those reports adopt convoy rows, use the same physical identity/edit-scope rules. Existing authoritative report/export contracts must not silently multiply quantities, charges or report records.

Trips pagination/counts should describe actual displayed convoy rows, with trip counts distinguished where necessary. Search/filter/sort must retain correct assignment and stop associations. Checkbox row selection may select several rows of one trip; whole-trip preview/deletion must continue deduplicating physical `trip_id` values and enforce the existing 20-unique-trip limit, Admin password, audit and retention protections.

Billing, receivables/payables, demurrage and subcontract rates still require a decision about trip-level versus assignment-level charges. A second convoy presentation row is not a second billable delivery. Source totals must deduplicate by physical financial/quantity record; do not sum repeated display values as independent transactions. Existing record-only operational deletion must remain separate from entire-trip deletion.

## GPS / Mapbox impact

`trip_tracking_locations` already references `assignment_id` and profile/session identity. `trip_route_cache` is keyed by assignment and contains both planned and remaining geometry metadata. Runtime repository calls route/location RPCs with physical assignment IDs. Reuse these tables; no duplicate current-location table is needed.

Render one authorized pin and per-assignment route/remaining-stop context for each active member. Shared planned destinations can be reused only when fingerprints/stop responsibilities match. Marker updates must not recalculate routes. Inspect installed tracking RPC authorization for any primary-only assumptions before enabling convoy. GPS, planned routing and paid providers remain disabled/uninvoked in this phase.

## POD and operational records

`pod_records` currently references trip and stop, not assignment/truck. `driver_trip_updates` includes trip and driver but no explicit stop/assignment. Offload, Backload and demurrage records refer to trip/optional stop and creators/snapshots, not an authoritative convoy assignment. Existing data must remain valid and must not be guessed into an assignment.

If per-truck PODs or incidents are required, propose nullable `assignment_id` references with same-trip validation and explicitly defined uniqueness. Historical unknown assignment stays NULL. Preserve private attachment ownership and cleanup journals. A truck-specific POD must be scoped to its assignment/responsibility so it cannot overwrite another truck's POD. Clarify whether one shared DR can have multiple member PODs. Keep original creator attribution immutable.

## Proposed additive database work - not executed or created as migrations

1. Optional validated assignment-type vocabulary and active lead/member uniqueness indexes after a compatibility/data audit.
2. Optional assignment-stop responsibility junction with same-trip integrity and appropriate authorization.
3. Optional member progress and item-allocation records if the business requires them.
4. Optional nullable assignment links on POD/operational records; no invented historical backfill.
5. A compatible flat Trips truck-at-applicable-stop projection with stable composite identities and correct displayed-row pagination; separately reviewed report/export projections that preserve authoritative source totals and contracts.
6. Existing tracking RPC amendments only if read-only audit proves a primary-only restriction.
7. Review existing assignment read policy (`authenticated users can read trip truck assignments`) before member-specific privacy changes. Do not broaden access; a separate approved security migration may need to narrow it.

No convoy SQL file was created or applied. The formula-only migration from this phase does not change any of these objects.

## Business decisions needed before implementation

- Is one lead/PRIMARY required, and can leadership change after dispatch?
- When only some trucks attend a stop, how is applicability explicitly assigned, and how do assignment start/end times affect it? Both trucks attending both stops and the four-row example are already confirmed.
- Are quantities split by truck, and which quantity constraints apply?
- Is completion per trip/stop or per member responsibility?
- Are PODs and DRs shared, per truck, or both?
- Are demurrage, subcontract costs and billing per truck or per dispatch?
- What can each convoy driver see/edit about other members?
- Can a driver change trucks mid-trip and how should history be represented?
- Which other reports and exports need truck-at-stop rows versus deduplicated authoritative source records, and how should repeated quantities be labelled?
- How should cancellation/reassignment affect responsibilities, GPS consent and route cache eligibility?

The normal spreadsheet layout and truck-at-stop row grain are confirmed and are not open design questions. Remaining decisions cover participation, progress, record scope, financial allocation, permissions and history. No runtime convoy acceptance was attempted. Review those decisions before implementing convoy UI or executing any convoy schema changes.
