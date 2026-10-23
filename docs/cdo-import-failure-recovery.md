# CDO request 2: allocation and partial import recovery

## Scope and evidence

Only source inspection, code edits, and read-only Supabase REST GET requests were performed. No tests, builds, TypeScript checks, lint, browser sessions, servers, SQL execution, or migrations were run. No database records were modified during this work.

The available local file is `Downloads/drive-download-20261022T125441Z-1-001/CDO trip request 2.csv`. The named `CDO trip request 2(2).csv` was not present in Downloads. The available file and the saved batch contain the reported 37 rows, 19 headers, and TAC-06CWI/UB2 source values. The user's supplied arithmetic findings are the reference: all source quantity/unit-CBM products match, no identical source rows, and total cargo 37.7556 CBM. No application import was run to verify these changes.

Read-only inspection identified batch `1734212e-264c-4bd8-80d2-968b3f9c74fa`, with 37 source rows, 14 historical skips, 22 failures, and one imported product. Its earlier history is batch `9466c325-7ceb-421a-bbcd-2a9c53ecd840`. The current batch already has trip `cfedac1b-aad3-4f3d-a882-faee3ce8ee12` and product line `909308fb-299d-4f11-a537-25f3f5dda03d` for CSV row 37, MAC-TAC-06CWM/F, Qty 3, CBM 0.213. Those identities must be reused, not replaced.

## Confirmed causes

1. **The 14 history skips are not live duplicates.** Their ledger rows say `status=imported`, but all 14 have `line_item_id=null`. Their historical product records are absent. The preview trusted the status alone, and `import_trip_source_rows_v2` skipped every imported ledger entry without checking whether its product still existed. Recovery also treated skipped acknowledgements with null product IDs as completed. This excluded real source lines from cargo planning and made a 30-CBM truck appear sufficient for the remaining subset. The inspection does not establish when or why the historical products became absent.
2. **All 22 failures report missing master matches.** The saved target has `allow_create=false`. Exact catalog inspection also found no TAC-06CWI/UB2 product and missing exact customer names. The generic resolver error did not identify whether a customer, store, warehouse, or product failed. After a partial save, the frontend locked customer/store identity controls along with source edits, and there was no per-source product selection. Changing the already-saved target to enable creation would violate the immutable batch target guard. The fix provides explicit existing-record choices without changing that target.
3. **TAC-06CWI/UB2 source values are correct.** CSV row 2 and both saved source previews contain Qty 4 and Total CBM 0.40400000. The earlier saved plan had no allocation for that line. `validateCargo` checked row sums before overall capacity and therefore reported the first unallocated product, TAC-06CWI/UB2, after suggestion failed to produce a complete proposal. The latest saved plan contains the correct 4 / 0.40400000 allocation; there is no evidence that its source quantity was converted to 1 or corrupted by parsing.
4. **The split form could produce inconsistent proposals.** Split appended an empty 0/0 entry and could select a truck already holding that source line. Quantity and CBM inputs changed independently. These entries correctly failed validation, but the UI gave little information about source versus allocated totals. Source/truck changes could also hide the actual error behind a generic stale-proposal notice.
5. **Grouping was initially by filename.** All three PH references were in one saved import group. PH references remained on product lines but were not shown as separate source groups in the cargo planner. A source reference is not a truck plate and must never create a physical truck.

## Review of the 14 historical skips

These are distinct source-row identities from the earlier batch, each with an absent product reference. Shared DR or SO numbers were not the cause: both the source fingerprint and the existing-cargo comparison include the product model.

| Original CSV row | Product model | History finding |
| --- | --- | --- |
| 5 | 75P7L | Imported flag, null product ID |
| 6 | 75P7L | Imported flag, null product ID |
| 7 | TRF-118PH | Imported flag, null product ID |
| 10 | 75P7L | Imported flag, null product ID |
| 25 | TRF-118PH | Imported flag, null product ID |
| 26 | TRF-118PH | Imported flag, null product ID |
| 27 | TRF-118PH | Imported flag, null product ID |
| 28 | TRF-118PH | Imported flag, null product ID |
| 29 | TRF-118PH | Imported flag, null product ID |
| 30 | TWT-80Z2 | Imported flag, null product ID |
| 31 | TAC-12CWI/UB2 | Imported flag, null product ID |
| 34 | TAC-12CWI/UB2 | Imported flag, null product ID |
| 35 | TAC-36CFV/FH-OD | Imported flag, null product ID |
| 36 | TAC-36CFV/FH-ID | Imported flag, null product ID |

CSV row 37 is the one live imported product. The 22 recorded failures are rows 2–4, 8–9, 11–24, 32–33, and 38. Source rows are not renumbered or collapsed during recovery.

## Allocation and grouping changes

- Suggestions check total required versus selected physical-truck capacity before building allocations. Validation reports an overall capacity shortfall before blaming an unallocated source line. Capacity, per-line quantity/CBM totals, proportions, whole-unit splits, duplicate placements, driver identity, and server capacity triggers remain enabled.
- Quantity edits calculate proportional CBM with exact integer arithmetic. Non-terminating decimal splits are rejected rather than rounded. Manually edited CBM still has to pass the proportionality and original-total checks.
- Split moves one whole unit to a different selected truck and subtracts it from the original allocation, conserving the source quantity and CBM. It does not create another source product row. A duplicate source/truck placement and a split with fewer than two whole units are rejected.
- Errors and row details include the original filename/CSV row, model, DR, PH reference, expected quantity/CBM, allocated quantity/CBM, and actual reason. A stale-proposal notice no longer hides the underlying validation failure.
- New uploads initialize separate editable groups for the three PH references. The existing partially saved batch retains its immutable original import group and trip; the cargo planner displays its three PH source groups and physical truck distribution without silently moving already saved products into new trips.
- Expected source groups are PHTRUCK202606220205 (29 rows, 33.6772 CBM), PHTRUCK202606220206 (7 rows, 3.7084 CBM), and PHTRUCK202606220221 (1 row, 0.3700 CBM). A single 30-CBM truck cannot carry the first group; it needs at least 3.6772 additional CBM of capacity. The existing combined batch needs capacity for its full 37.7556 CBM once the missing history is included. Additional physical trucks and their drivers must be selected explicitly.

## Safe partial-save recovery

- Mutable live history is returned separately from the frozen signed source preview. Reopening a batch no longer rewrites source identities, values, group destinations, or document hashes merely to refresh history.
- Imported history counts as a duplicate only if a live product exists. Missing historical products remain in cargo demand and show individual recovery checkboxes. Recovery approval is tied to the history import timestamp, so an approval cannot silently recreate a product deleted again after a later successful import.
- Existing customer/store matches can be selected after a partial save while raw source fields remain locked. A new per-source product selector supports explicit existing product relationships without renaming the original model identifier or creating placeholder masters.
- Failed and missing-history rows remain pending; a skipped response without a product ID cannot complete a source row. Summary counts include unresolved historical rows and previously recorded failures, including failures whose ledger entry belongs to the older batch.
- Retrying keeps the same batch, group target, existing trip, and already saved product. Acknowledgements/history are reloaded if an API acknowledgement is interrupted. Existing successful allocations remain sealed; incomplete plans can be corrected and confirmed.
- The server checks that every valid source row in the saved group has a live imported product before cargo finalization. Cargo is finalized only after the pending product rows succeed.
- Same-batch idempotent skips count as retained saved products rather than newly detected duplicates. Live imports from a different batch remain skipped; missing historical products require explicit review.

## Files changed

| File | Change |
| --- | --- |
| `frontend/src/services/cargo-planning.ts` | Exact split arithmetic, source context, PH/DR grouping, capacity diagnostics |
| `frontend/src/components/admin/TripCargoPlanner.tsx` | Coupled quantity/CBM edits, conserving split control, PH group display |
| `frontend/src/components/admin/tripImportFiles.ts` | Initialize new source groups by PH reference |
| `frontend/src/components/admin/BulkTripImport.tsx` | Live-history state, row resolutions, pending/complete handling, acknowledgement recovery |
| `frontend/src/components/admin/ImportSourceRecovery.tsx` | Per-source recovery approval and explicit existing product choices |
| `frontend/src/components/admin/ImportStoreCards.tsx` | Separate source editing locks from identity review controls |
| `frontend/src/services/trip-import.service.ts` | History, per-row resolution and recovery API types |
| `backend/src/services/trip-import-history.service.ts` | Bulk ledger/live-product inspection |
| `backend/src/services/trip-import.service.ts` | Live duplicate detection, recovery guards, opt-in recovery RPC, row errors |
| `backend/src/services/trip-import-recovery.service.ts` | Refresh mutable history and correct completion/failure accounting |
| `backend/src/services/trip-location.service.ts` | CSV row context on customer/store resolution failures |
| `backend/src/services/trip-workflow.service.ts` | Block finalization while valid source rows remain unsaved |
| `backend/migrations/proposals/2026_10_22_proposed_csv_import_recovery.sql` | Approval-only function changes described below |
| `docs/cdo-import-failure-recovery.md` | Investigation evidence, changes, and remaining requirements |

## Database approval still required

The proposal file has **not** been executed. It makes two function changes:

1. Add `import_trip_source_rows_v3` with the existing RPC argument shape. Under the existing import advisory lock, it skips only live products, accepts explicit active product IDs, and permits restoring a missing source only after explicit timestamp-bound approval and matching document/fingerprint identity. Recovery keeps the previous ledger values in nested provenance. Every row still uses a subtransaction, and the original duplicate checks, relationships, source values, and creation policy remain enforced. No existing live product is overwritten or deleted.
2. Replace `apply_trip_cargo_plan_v1` only to add filename/CSV row, product, expected and allocated totals to allocation exceptions. All original validation and capacity-trigger behavior remains.

No tables, columns, views, policies, or existing import functions are deleted. Applying the proposal itself does not repair or recreate any historical data. Actual recovery requires the user to reopen the existing batch, review each missing product, resolve unmatched master identities, add sufficient physical-truck capacity, confirm the distribution, and explicitly save. Missing real master data must be matched or maintained through the existing master-data workflow; it is not fabricated automatically.

Until that SQL is approved and applied, the application reports that advanced recovery needs the database update and preserves the existing batch. Normal imports without advanced recovery continue to use the existing RPC. The batch was not retried or completed during this code-only task.
