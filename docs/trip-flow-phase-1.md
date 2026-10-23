# Trip flow redesign — Phase 1

## Scope and root causes

This phase adds the shared UI foundation and fixes the handoff of trip details from New trip to CSV import. It does not implement later layout, map, store-editing, or assignment-board phases.

`AddTripForm` retains `tripTypeId`, `newTripType`, `status`, `loadingDate`, `etaDate`, `remarks`, and `warehouseId` in local state. Its early return renders `BulkTripImport` as a child: the parent component remains mounted, so returning does not inherently erase those values. The actual bug was that the child received only `initialTarget`, whose type had no trip metadata, and the importer had no fields to display or persist it. Dates were collected separately by the cargo planner.

The parent also kept its global Escape handler active while CSV import was open. That handler could close the entire form and bypass the importer's existing close/draft-save workflow. It is now suspended while the importer is active. The importer retains its existing explicit close/back controls and persistence behavior.

## Shared components

Added under `frontend/src/components/admin/shared/`:

- `SectionCard.tsx`: section/header/actions/body layout.
- `StatChip.tsx`: labeled numeric/text summary with tabular values.
- `StatusChip.tsx`: typed success/warning/danger/info/neutral tones, always with icon and text.
- `CapacityBar.tsx`: accessible, display-only capacity meter with explicit unknown/full/over-capacity labels. Exact cargo arithmetic remains in the existing cargo service.
- `EmptyState.tsx`: typed icon, explanation, and optional action slot.
- `StoreRail.tsx`: responsive store selection rail with controlled callbacks.
- `TruckCard.tsx`: truck section with shared capacity presentation and action/content slots.
- `CargoBoard.tsx`: responsive presentational board columns; it does not move or assign cargo.
- `ReviewChecklist.tsx`: controlled or read-only review rows; it does not introduce validation rules.
- `styles.ts` and `index.ts`: shared focus, control/action styles and exports.

The manual form and importer now share section/stat styling; both flows also use shared capacity/empty-state UI through `TripCargoPlanner`. The rail, truck card, board, and checklist are typed foundations for the later phases. Existing assignment and store controls were not replaced with new behavior in this phase. No dependency was added.

## Trip details and deliberate behavior changes

- `AddTripForm` passes all seven fields through the optional `initialTripDetails` prop. Returning through the importer's Back/Close flow keeps the original parent form state and current manual step. Import-specific edits remain scoped to import groups; different groups are not silently collapsed into one parent form value.
- Import step 3 has a trip-details card for each group: generated trip number (read-only), existing or new trip type, status, loading date, estimated delivery date, origin warehouse, and remarks.
- Estimated delivery has `min=loading_date`; frontend group validation and backend calendar/date-order validation also protect the request.
- Apply to all groups copies the chosen details to editable new-trip groups. It excludes append-to-existing-trip targets and respects the existing locked/busy/saving controls.
- Dates entered here synchronize into `plan.schedule`. Changing dates resets the cargo plan's confirmation and unreserved acknowledgement, without replacing placements or changing `cargoSignature`/`validateCargo`.
- The cargo planner accepts an optional managed-schedule mode. In that mode it shows dates read-only with an Edit trip dates link; the existing availability, conflict, unreserved-assignment and confirmation controls remain active.
- Step 4 has a compact read-only summary for each group.
- No number is reserved or invented during preview. Before creation, the field says Generated on save. Actual references returned by the new RPC are shown once saved; existing trip references are loaded read-only through the existing cached detail service when needed. Those reads are deduplicated by selected trip ID and do not rerun merely when changing wizard steps.
- Appending to a saved trip uses its read-only details. It does not send replacement trip metadata or overwrite the saved trip. Failure to load existing details is shown as a warning; unknown status is shown as unchanged rather than guessed from the new-form defaults.
- Global default `trip_details` and per-group `target.trip_details` are included in draft persistence. Old drafts may omit both. Reopening a locked old draft does not inject new fields into its immutable target; its existing cargo schedule remains available through the legacy planner path. Previously uncaptured metadata cannot be reconstructed automatically.

Duplicate/history handling, explicit missing-source recovery, row resolutions, source identities, locations, retries, cargo signatures, confirmations, onBlur/key-remount store inputs, and sealed plan rules remain in their existing paths. `ImportStoreCards` and its input behavior were not edited in this phase.

## Types and API contract

Shared definition: `packages/trip-import/trip-details.d.ts` (defaults/status choices in `trip-details.js`). It is re-exported from `frontend/src/services/trip-import.service.ts`.

```ts
type TripDetails = {
  trip_type_id: string | null;
  trip_type_name: string | null;
  status: string;
  loading_date: string | null;
  estimated_delivery_date: string | null;
  remarks: string | null;
  origin_warehouse_id: string | null;
};
```

New optional fields/props:

- `BulkTripImport.initialTripDetails?: TripDetails`.
- `ImportTarget.trip_details?: TripDetails`.
- `ImportRecoveryDraft.trip_details?: TripDetails` (global defaults); per-group values are in `targets`.
- `ImportOutcome.trip_reference?: string`.
- `TripCargoPlanner.scheduleManaged?: boolean` and `onEditSchedule?: () => void`.

`GET /trips/import/location` is registered inline in `backend/src/routes/trip.routes.ts` and calls `parseDestination` / `resolveTripDestination`. Its contract and handler were not changed.

`POST /trips/import/commit` routes to `backend/src/controllers/trip-import.controller.ts`, then `commitTripImport` in `backend/src/services/trip-import.service.ts`. It now validates optional trip metadata, active status, UUIDs, calendar dates, matching origin IDs, and selected warehouse availability. It never normalizes/mutates the saved target during validation. Draft writes validate the optional global and per-group metadata without requiring it on legacy drafts; a temporarily reversed date range is retained for correction, while committing still rejects it.

When `target.trip_details` is absent, existing RPC selection remains unchanged. When present, the backend selects:

- `import_trip_source_rows_with_details_v1` for source trip-request rows.
- `import_trip_master_rows_with_details_v1` for operational Master List imports.

Both retain the existing arguments: `p_batch`, `p_creator`, `p_group`, `p_target`, `p_rows`, `p_verified`, `p_locations`. Missing RPCs produce `IMPORT_TRIP_DETAILS_SETUP_REQUIRED` and preserve the draft/earlier saved chunks; the backend does not silently fall back to a function that drops the trip fields.

## Database work requiring approval

Prepared only: `backend/migrations/proposals/2026_10_23_proposed_import_trip_details.sql`. **Not executed.**

It adds the two versioned RPCs above. The source function preserves the previously prepared source-recovery logic, idempotency locks, explicit product matching, missing-history approval/version checks, per-row subtransactions, and duplicate guards. It writes these existing trip columns during first successful creation:

| Target detail | Existing storage |
| --- | --- |
| `trip_type_id` | `trips.trip_type_id`, validating active `trip_types` |
| `trip_type_name` without an ID | Match an active existing name or explicitly create that trip type using the existing relationship pattern |
| `status` | `trips.status` |
| `loading_date` | `trips.loading_date` |
| `estimated_delivery_date` | `trips.estimated_delivery_date` |
| `remarks` | `trips.remarks`; blank retains the existing source-import description |
| `origin_warehouse_id` | `trips.warehouse_id`; existing per-line source warehouse mappings stay separate |

Dates are present in the initial trip insert so existing generated-reference and schedule triggers see the correct loading date. Subsequent chunks/retries reuse the group target and trip; they do not update those fields again. Existing-trip append metadata is rejected rather than silently overwriting an existing record. The Master List RPC retains the existing operational-field and conflict handling while delegating its source creation to the details-aware source RPC.

There are no new tables, columns, views, policies, backfills or deletions, and no existing function is replaced. The source RPC needs the existing source/workflow/recovery schema; the Master List RPC additionally needs its existing proposed Master List dependencies. Legacy drafts using explicit source recovery without trip metadata still need the earlier recovery RPC proposal if it has not been applied.

## Other files changed

Frontend: `AddTripForm.tsx`, `BulkTripImport.tsx`, `ImportTripDetailsCard.tsx` (new), `TripCargoPlanner.tsx`, and `services/trip-import.service.ts`.

Backend: `services/import-trip-details.logic.ts` (new), `trip-import.logic.ts`, `trip-import.service.ts`, `trip-import-warehouse.service.ts`, and `trip-import-recovery.service.ts`. The recovery service retains optional generated-reference fields in stored acknowledgements.

## Verification and Not verified

The only checks run were static TypeScript checks using each project's installed compiler with `--noEmit`. The baseline already had:

- Frontend: `UserActivityHistory.tsx:17`, unknown is not assignable to ReactNode.
- Backend: `report.service.ts:817`, Supabase select ParserError is not assignable to the report-row array type.

The phase's introduced backend validator type error was corrected. Final checks report only the two baseline errors above; they were left unchanged because they are outside this phase.

**Not verified:** browser layout, mobile rendering, keyboard/focus interactions, actual draft reopen/back navigation, live imports, Realtime behavior, schedules, SQL syntax/execution, migration dependencies, and actual generated references. Those need the user's manual review after database approval where applicable. No tests were run or edited, and no browser automation, screenshots, lint, builds, dependency installs, servers, SQL execution, or database changes were performed.
