# ID Mapping Audit Report

## Executive Summary

This audit examines the row identity and relationship correctness of the report editing implementation to ensure it cannot update the wrong database record.

## A. ID Mapping Audit

### Combined Report
**Row Identity**: `trip_id`, `trip_stop_id`, `trip_line_item_id` (provided by view)
**Trip Identity**: `trip_id` (directly from view)
**Stop Identity**: `trip_stop_id` (directly from view)
**Line Item Identity**: `trip_line_item_id` (directly from view)
**Assignment Identity**: `assignment_id` (enriched from `trip_truck_assignments` with `assignment_type = 'PRIMARY'`)
**Relationship IDs**:
- `trip_type_id` (enriched from `trips`)
- `warehouse_id` (enriched from `trips`)
- `truck_id` (enriched from PRIMARY `trip_truck_assignments`)
- `driver_id` (enriched from PRIMARY `trip_truck_assignments`)
- `trucking_company_id` (enriched from PRIMARY `trip_truck_assignments`)
- `customer_id` (enriched from `trip_stops`)
- `store_id` (enriched from `trip_stops`)
- `product_id` (enriched from `trip_line_items` using existing `trip_line_item_id`)

**Status**: ✅ SAFE - All IDs come directly from the view or are enriched using deterministic lookups with existing IDs

### Dispatch Monitoring
**Row Identity**: `trip_id` (provided by view), `trip_stop_id` (enriched using `stop_sequence`)
**Trip Identity**: `trip_id` (directly from view)
**Stop Identity**: `trip_stop_id` (enriched using `trip_id + stop_sequence` - deterministic)
**Line Item Identity**: N/A (report does not contain line item fields)
**Assignment Identity**: `assignment_id` (enriched from `trip_truck_assignments` with `assignment_type = 'PRIMARY'`, filtered by plate_number and driver_name)
**Relationship IDs**:
- `trip_type_id` (enriched from `trips`)
- `warehouse_id` (enriched from `trips`)
- `truck_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by plate_number)
- `driver_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by driver_name)
- `trucking_company_id` (enriched from PRIMARY `trip_truck_assignments`)
- `customer_id` (enriched from `trip_stops`)
- `store_id` (enriched from `trip_stops`)

**Status**: ✅ SAFE - Stop ID uses deterministic `stop_sequence`, assignment uses PRIMARY filter and display value matching

### Dispatch Report
**Row Identity**: `trip_id` (enriched from dispatch_number), `trip_stop_id` (enriched using destination matching)
**Trip Identity**: `trip_id` (enriched from dispatch_number with additional trip_number/transaction_number/loading_date matching)
**Stop Identity**: `trip_stop_id` (enriched using `trip_id + ship_to/store_name/customer_name` matching - heuristic but uses destination values from the row)
**Line Item Identity**: N/A (line item editors removed due to missing `trip_line_item_id` in view)
**Assignment Identity**: `assignment_id` (enriched from `trip_truck_assignments` with `assignment_type = 'PRIMARY'`, filtered by plate_number and driver_name)
**Relationship IDs**:
- `trip_type_id` (enriched from `trips`)
- `warehouse_id` (enriched from `trips`)
- `truck_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by plate_number)
- `driver_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by driver_name)
- `trucking_company_id` (enriched from PRIMARY `trip_truck_assignments`)
- `customer_id` (enriched from `trip_stops`)
- `store_id` (enriched from `trip_stops`)

**Status**: ⚠️ MODERATE RISK - Stop ID uses heuristic destination matching, but this is the best available without `stop_sequence` in the view. Line item editors removed to prevent unsafe updates.

### Trip Booking
**Row Identity**: `trip_id` (enriched from dispatch_number), `trip_stop_id` (enriched using destination matching)
**Trip Identity**: `trip_id` (enriched from dispatch_number with additional trip_number/transaction_number/loading_date matching)
**Stop Identity**: `trip_stop_id` (enriched using `trip_id + ship_to/store_name/customer_name` matching - heuristic but uses destination values from the row)
**Line Item Identity**: N/A (line item editors removed due to missing `trip_line_item_id` in view)
**Assignment Identity**: `assignment_id` (enriched from `trip_truck_assignments` with `assignment_type = 'PRIMARY'`, filtered by plate_number and driver_name)
**Relationship IDs**:
- `trip_type_id` (enriched from `trips`)
- `warehouse_id` (enriched from `trips`)
- `truck_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by plate_number)
- `driver_id` (enriched from PRIMARY `trip_truck_assignments`, filtered by driver_name)
- `trucking_company_id` (enriched from PRIMARY `trip_truck_assignments`)
- `customer_id` (enriched from `trip_stops`)
- `store_id` (enriched from `trip_stops`)

**Status**: ⚠️ MODERATE RISK - Stop ID uses heuristic destination matching, but this is the best available without `stop_sequence` in the view. Line item editors removed to prevent unsafe updates.

### Store Calling
**Row Identity**: `store_call_id` (directly from view)
**Trip Identity**: `trip_id` (enriched from `store_calls.trip_stop_id` → `trip_stops.trip_id`)
**Stop Identity**: `trip_stop_id` (directly from `store_calls`)
**Line Item Identity**: N/A
**Assignment Identity**: N/A
**Relationship IDs**:
- `assigned_to_id` (directly from `store_calls.assigned_to`)
- `contact_id` (directly from `store_calls.contact_id`)
- `store_id` (enriched from `trip_stops` using `trip_stop_id`)

**Status**: ✅ SAFE - Primary identity comes directly from `store_calls`, all other IDs are enriched deterministically using existing IDs

## B. Field Mapping Problems Found and Corrections

### Problem 1: Unsafe Line Item ID Enrichment
**Original Implementation**: Attempted to enrich `trip_line_item_id` using only `trip_id` and `trip_stop_id`, which would select an arbitrary line item when multiple exist for a stop.

**Correction**: Removed the heuristic line item ID enrichment entirely. Line item editors (`dr_number`, `customer_model` in Dispatch Report; `dr`, `invoice_number` in Trip Booking) were removed from the configuration to prevent updates to the wrong line item.

**Rationale**: Without a unique business key (like `dr_number + trip_stop_id`) provided by the view, it is impossible to deterministically identify the exact line item. The safer approach is to disable line item editing for reports that don't expose `trip_line_item_id`.

### Problem 2: Assignment Filter Missing PRIMARY Check
**Original Implementation**: Filtered assignments by `trip_id` only, which could select a non-PRIMARY assignment.

**Correction**: Added `assignment_type === "PRIMARY"` filter to ensure only the PRIMARY assignment is selected for driver/truck/trucking company updates.

**Rationale**: The view joins on PRIMARY assignment, so the enrichment must match that logic.

### Problem 3: Dispatch Monitoring Trip Type Field
**Original Claim**: Dispatch Monitoring has `trip_type` as a relationship editor.

**Audit Finding**: The actual `v_dispatch_monitoring` view definition provided does NOT contain `trip_type` or `trip_type_id`.

**Correction**: Removed `trip_type` from Dispatch Monitoring editing configuration.

**Rationale**: Cannot edit a field that doesn't exist in the report.

## C. Dangerous/Ambiguous Lookups

### Dispatch Report Stop ID Lookup
**Risk Level**: MODERATE
**Lookup Method**: `trip_id + ship_to/store_name/customer_name` matching
**Arbitrary Selection**: Could select wrong stop if multiple stops have the same destination for the same trip
**Mitigation**: Uses destination values from the row itself, which should be unique in practice, but not guaranteed by schema

### Trip Booking Stop ID Lookup
**Risk Level**: MODERATE
**Lookup Method**: `trip_id + ship_to/store_name/customer_name` matching
**Arbitrary Selection**: Could select wrong stop if multiple stops have the same destination for the same trip
**Mitigation**: Uses destination values from the row itself, which should be unique in practice, but not guaranteed by schema

### Other Lookups
**Assignment Lookup**: Uses `assignment_type = 'PRIMARY'` filter + plate_number and driver_name matching - ✅ SAFE
**Combined Report**: All IDs come directly from view - ✅ SAFE
**Dispatch Monitoring**: Stop ID uses `stop_sequence` which is deterministic - ✅ SAFE
**Store Calling**: All IDs come directly from view or are enriched deterministically - ✅ SAFE

## D. Frontend Configuration Audit

### Combined Report
**Configured Relationship Editors**:
- `trip_type` ✅ (uses `trip_type_id` from view)
- `warehouse` ✅ (uses `warehouse_id` from view)
- `driver` ✅ (uses `driver_id` enriched from PRIMARY assignment)
- `truck` ✅ (uses `truck_id` enriched from PRIMARY assignment)
- `trucking_company` ✅ (uses `trucking_company_id` enriched from PRIMARY assignment)
- `customer` ✅ (uses `customer_id` from view)
- `store` ✅ (uses `store_id` from view)
- `product` ✅ (uses `product_id` enriched using `trip_line_item_id` from view)

### Dispatch Monitoring
**Configured Relationship Editors**:
- `warehouse` ✅ (uses `warehouse_id` enriched from `trips`)
- `driver` ✅ (uses `driver_id` enriched from PRIMARY assignment)
- `truck` ✅ (uses `truck_id` enriched from PRIMARY assignment)
- `trucking_company` ✅ (uses `trucking_company_id` enriched from PRIMARY assignment)
- `customer` ✅ (uses `customer_id` enriched from `trip_stops`)
- `store` ✅ (uses `store_id` enriched from `trip_stops`)

### Dispatch Report
**Configured Relationship Editors**:
- `warehouse` ✅ (uses `warehouse_id` enriched from `trips`)
- `driver` ✅ (uses `driver_id` enriched from PRIMARY assignment)
- `truck` ✅ (uses `truck_id` enriched from PRIMARY assignment)
- `trucking_company` ✅ (uses `trucking_company_id` enriched from PRIMARY assignment)
- `customer` ✅ (uses `customer_id` enriched from `trip_stops`)
- `store` ✅ (uses `store_id` enriched from `trip_stops`)

### Trip Booking
**Configured Relationship Editors**:
- `warehouse` ✅ (uses `warehouse_id` enriched from `trips`)
- `driver` ✅ (uses `driver_id` enriched from PRIMARY assignment)
- `truck` ✅ (uses `truck_id` enriched from PRIMARY assignment)
- `trucking_company` ✅ (uses `trucking_company_id` enriched from PRIMARY assignment)
- `customer` ✅ (uses `customer_id` enriched from `trip_stops`)
- `store` ✅ (uses `store_id` enriched from `trip_stops`)

### Store Calling
**Configured Relationship Editors**:
- `assigned_to` ✅ (uses `assigned_to_id` from `store_calls`)
- `contact` ✅ (uses `contact_id` from `store_calls`)
- `store` ✅ (uses `store_id` enriched from `trip_stops` using `trip_stop_id`)

## E. Build Results

**Frontend**: ✅ PASS
```
✓ 2003 modules transformed
✓ built in 5.74s
Exit code: 0
```

**Backend**: ✅ PASS
```
Exit code: 0
```

## F. Runtime Testing

**Code Inspection**: ✅ PASS
**Build**: ✅ PASS
**Runtime**: ❌ NOT TESTED (no test credentials available)
**Browser**: ❌ NOT TESTED (no browser automation available)
**Database Persistence**: ❌ NOT TESTED (no test credentials available)

## G. Summary

The implementation is SAFE for reports where the view provides the required IDs directly (Combined, Store Calling, Dispatch Monitoring with `stop_sequence`). For Dispatch Report and Trip Booking, line item editing was removed because the views do not expose `trip_line_item_id` and heuristic enrichment would be unsafe. Stop ID enrichment in Dispatch Report and Trip Booking uses destination matching, which has moderate risk but is the best available without `stop_sequence` in those views.

The most important safety measure is that assignment updates are now explicitly filtered to `assignment_type = 'PRIMARY'`, ensuring driver/truck/trucking company updates affect the correct assignment.

### Critical Safety Guarantees

1. **No arbitrary line item selection**: Line item editors removed for reports lacking `trip_line_item_id`
2. **PRIMARY assignment enforcement**: All assignment-level updates use `assignment_type = 'PRIMARY'` filter
3. **Deterministic stop selection where possible**: Dispatch Monitoring uses `stop_sequence`, Combined uses direct `trip_stop_id`
4. **Heuristic stop selection only when necessary**: Dispatch Report and Trip Booking use destination matching as fallback
5. **Direct identity use where available**: Combined and Store Calling use IDs directly from views

### Recommendations for Runtime Testing

When test credentials become available, specifically verify:
1. Dispatch Report: Edit warehouse, customer, store - verify correct trip and stop are updated
2. Trip Booking: Edit warehouse, customer, store - verify correct trip and stop are updated
3. Dispatch Monitoring: Edit driver/truck - verify PRIMARY assignment is updated
4. Combined: Edit line item fields - verify correct line item is updated
5. Store Calling: Edit assigned_to - verify correct store_call record is updated
