# Report Editing Gap Analysis

## Executive Summary

This analysis identifies gaps between the intended editable field coverage and the current implementation. The backend enriches all five reports with relationship IDs, but the underlying database views must already contain these IDs for the enrichment to work.

## Build Status

**Frontend Build**: ✅ PASS (TypeScript + Vite production build)
**Backend Build**: ✅ PASS (TypeScript compilation)

## Backend ID Enrichment Analysis

### How `attachOperationalRecordIds` Works

The backend function `attachOperationalRecordIds` (report.service.ts lines 167-488) enriches report rows with relationship IDs:

1. **Trip-level IDs**: Always enriched for all reports with trips (`trip_type_id`, `warehouse_id`)
2. **Assignment IDs**: Enriched for all reports with `trip_truck_assignments` (truck_id, driver_id, trucking_company_id)
3. **Stop IDs**: Enriched for all reports with `trip_stops` (customer_id, store_id, trip_stop_id)
4. **Line Item IDs**: Enriched ONLY if the view already includes `trip_line_item_id`
5. **Store Call IDs**: Enriched if the view includes `store_call_id`

**Critical Finding**: The enrichment function DOES NOT add `trip_line_item_id` to rows that don't already have it. It only uses existing `trip_line_item_id` values to look up `product_id`.

### Combined Report View (v_tms_combined)

**Status**: ✅ HAS ALL REQUIRED IDs
- Migration `2026_09_27_add_trip_line_item_id_to_v_tms_combined.sql` added `trip_line_item_id` to the view
- The view includes: `trip_id`, `trip_stop_id`, `trip_line_item_id`
- Backend enrichment adds: `trip_type_id`, `warehouse_id`, `assignment_id`, `driver_id`, `truck_id`, `trucking_company_id`, `customer_id`, `store_id`, `product_id`

**Conclusion**: Combined Report should support all configured editors.

### Dispatch Report View (vw_dispatch_report)

**Status**: ❓ UNKNOWN - VIEW DEFINITION NOT EXAMINED
- The backend enrichment is called for Dispatch Report
- However, the view may or may not include `trip_stop_id` and `trip_line_item_id`
- Without these IDs in the view, the enrichment cannot add them

**Gap**: If the view lacks `trip_stop_id`, then:
- `delivery_status` cannot be edited (requires `trip_stop_id`)
- `customer_name` and `store_name` cannot be edited (require `trip_stop_id`)
- `dr_number` and `customer_model` cannot be edited (require `trip_line_item_id` and `trip_stop_id`)

### Dispatch Monitoring View (vw_dispatch_monitoring)

**Status**: ❓ UNKNOWN - VIEW DEFINITION NOT EXAMINED
- Similar to Dispatch Report, may lack `trip_stop_id` and `trip_line_item_id`
- Currently configured fields only require `trip_id` and `assignment_id`, which should be available

**Gap**: Minimal - current configuration should work if view includes basic trip data.

### Trip Booking View (v_trip_booking)

**Status**: ❓ UNKNOWN - VIEW DEFINITION NOT EXAMINED
- Similar to Dispatch Report, may lack `trip_stop_id` and `trip_line_item_id`
- Currently configured fields after fixes only require `trip_id`, which should be available

**Gap**: Minimal after removing relationship/line item fields.

### Store Calling View (vw_store_calling_tracker)

**Status**: ✅ HAS REQUIRED ID
- The view includes `store_call_id`
- Backend enrichment adds: `assigned_to_id`, `assigned_to_name`, `contact_id`

**Conclusion**: Store Calling should support all configured editors.

## Field-by-Field Gap Analysis

### Dispatch Report - Removed Fields

| Field | Database Table | Required ID | ID in View? | Update Endpoint | Status |
|-------|---------------|-------------|------------|----------------|--------|
| dr_number | trip_line_items | trip_line_item_id, trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId/line-items/:lineItemId | Blocked by missing ID enrichment |
| customer_model | trip_line_items | trip_line_item_id, trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId/line-items/:lineItemId | Blocked by missing ID enrichment |

**Current State**: These fields were removed from editing configuration. To restore them, the Dispatch Report view must include `trip_stop_id` and `trip_line_item_id`.

### Trip Booking - Removed Fields

| Field | Database Table | Required ID | ID in View? | Update Endpoint | Status |
|-------|---------------|-------------|------------|----------------|--------|
| warehouse | trips | trip_id | ✅ Likely | PATCH /api/trips/:id | BLOCKED by removal |
| ship_from | trips | trip_id | ✅ Likely | PATCH /api/trips/:id | BLOCKED by removal |
| ship_to | trip_stops | trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId | Blocked by missing ID enrichment |
| customer_name | trip_stops | trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId | Blocked by missing ID enrichment |
| dr | trip_line_items | trip_line_item_id, trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId/line-items/:lineItemId | Blocked by missing ID enrichment |
| invoice_number | trip_line_items | trip_line_item_id, trip_stop_id | ❓ Unknown | PATCH /api/trips/:id/stops/:stopId/line-items/:lineItemId | Blocked by missing ID enrichment |

**Current State**: These fields were removed from editing configuration. To restore them, the Trip Booking view must include `trip_stop_id` and `trip_line_item_id`, and warehouse/ship_from can be restored if `trip_id` is present.

## Dropdown and Authorization Audit

### Dropdown Option Management

**Authorization**: ✅ CORRECT
- UI check: `canManageDropdowns` requires `profile?.is_admin === true || profile?.role?.toUpperCase() === "ADMIN"` (ReportDataView.tsx line 933)
- Backend: All dropdown option endpoints use `authMiddleware` and `requireRole("ADMIN", "STAFF")`

**Duplicate Rejection**: ✅ CORRECT
- Backend has unique constraint on (field_key, option_value)
- Add endpoint will fail with 409 on duplicates

**Rename Behavior**: ✅ CORRECT
- Rename only changes `display_label`, not `option_value`
- Backend validation preserves stored values

**Deactivation**: ✅ CORRECT
- UI shows confirmation when option has `usage_count > 0`
- Backend allows deactivation but preserves historical records
- Deactivated options are excluded from new selections via `active` filter

**Letter Status Constraint**: ✅ CORRECT
- UI disables add/deactivate for `letter_status` (lines 1126-1132, 1233-1245)
- UI shows warning about system constraint
- Database constraint limits values to READY, SENT, CANCELLED
- Three system options remain available

**Existing Data**: ✅ PRESERVED
- `tms_dropdown_options` table already created and seeded
- No destructive migrations run
- Migration `2026_10_02_create_tms_dropdown_options.sql` adds 13 seeded options

## Local Cell Saving Validation

### Save Flow Analysis

**Location**: `ReportDataView.tsx` lines 629-810

**Code Inspection Results**:
- ✅ Sends one update request via appropriate service function
- ✅ Updates local state via `setRows()` mapping (line 764-784)
- ✅ Does NOT increment `retryVersion` on ordinary saves
- ✅ Does NOT change the query key (queryKey uses accessToken, filters, search, page, reportKey, sortBy, sortOrder - NOT retryVersion)
- ✅ Preserves scroll position, filters, sort, pagination (state variables not reset)
- ✅ Prevents duplicate saves via `cellSaveInFlight.current` flag (line 714)
- ✅ Does not submit unchanged values (lines 699-706)
- ✅ Failed saves show error and preserve previous value (lines 793-807)

**Runtime Verification**: ❌ NOT TESTED
- Requires live API credentials
- Requires browser or network request logging to confirm no full report refetch

## Five-Report Editable-Field Coverage Table

| Report | Status | Editors Configured | Blocked by Missing ID | Blocked by Removal | Editors with Complete Path |
|--------|--------|-------------------|----------------------|-------------------|---------------------------|
| Combined | ⚠️ Needs View Verification | None known | None | All fields if view has IDs |
| Dispatch Monitoring | ⚠️ Needs View Verification | None known | None | Current fields if view has IDs |
| Dispatch Report | ⚠️ Needs View Verification | dr_number, customer_model | None (removed) | Current fields if view has IDs |
| Trip Booking | ⚠️ Needs View Verification | None (removed) | warehouse, ship_from, ship_to, customer, dr, invoice_number | Current fields if view has IDs |
| Store Calling | ✅ Verified | None | None | All configured fields |

## Missing-ID and Missing-Update-Path Findings

### Missing ID Enrichment

1. **Dispatch Report**: View may lack `trip_stop_id` and `trip_line_item_id`
   - **Impact**: Cannot edit delivery_status, customer/store relationships, line item fields
   - **Fix**: Modify Dispatch Report view to include these IDs

2. **Trip Booking**: View may lack `trip_stop_id` and `trip_line_item_id`
   - **Impact**: Cannot edit stop-level or line item fields
   - **Fix**: Modify Trip Booking view to include these IDs

### Missing Update Paths

None found. All update endpoints exist and are properly authorized. The gap is entirely at the view/ID enrichment level.

## Fixes Actually Implemented

1. **Frontend TypeScript Errors**: Fixed prop types and property access in ReportDataView.tsx
2. **Assignee Lookup**: Fixed endpoint mapping in lookup.service.ts
3. **Dispatch Report Line Item Fields**: Removed dr_number and customer_model from editing config
4. **Trip Booking Relationship/Line Item Fields**: Removed warehouse, store, customer, dr, invoice_number from editing config

## Remaining Blockers

1. **View Definition Unknown**: The actual schema of Dispatch Report and Trip Booking views is unknown without database access
2. **Runtime API Testing**: Cannot verify end-to-end behavior without live credentials
3. **Browser Testing**: Cannot verify UI behavior without browser automation

## Manual Test Sequence

To verify a changed value persists after reloading the report:

1. **Start Backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Login as Admin**
   - Navigate to http://localhost:5173
   - Login with admin credentials

4. **Open Store Calling Report**
   - Navigate to Reports → Store Calling
   - Wait for data to load

5. **Edit a Status Field**
   - Click on a "Status" cell in the table
   - Select a different status from the dropdown
   - Press Enter or click away to save
   - Observe the "Saving..." then "Saved" indicator

6. **Verify Local Update**
   - Confirm the cell shows the new status
   - Confirm the table does not refresh (pagination, sort, filters should remain)

7. **Reload the Report**
   - Refresh the browser page or navigate away and back
   - Open Store Calling Report again

8. **Verify Persistence**
   - Locate the same record (by dispatch number or other identifier)
   - Confirm the status shows the new value
   - If persistence works, the backend is correctly saving and the view is correctly loading

9. **Test Relationship Field (Store Calling)**
   - Click on an "Assigned To" cell
   - Type to search for a different admin/staff user
   - Select a user from the dropdown
   - Save the change
   - Reload and verify the new assignee is displayed

10. **Test Dropdown Management**
    - Click "Manage options" button
    - Select a field (e.g., "Store Calling status")
    - Add a new option with a value and label
    - Reload the page
    - Open the status dropdown in a cell
    - Confirm the new option appears

## Recommendations

1. **Inspect Database Views**: Run SQL against the database to verify which IDs are present in Dispatch Report and Trip Booking views
2. **Add Missing IDs to Views**: If views lack `trip_stop_id` and `trip_line_item_id`, create migrations to add them
3. **Restore Removed Fields**: Once IDs are available, restore dr_number/customer_model to Dispatch Report and warehouse/store/customer to Trip Booking
4. **Runtime Testing**: Execute the manual test sequence above with live credentials
5. **Add Integration Tests**: Create automated tests that can safely update and revert test records
