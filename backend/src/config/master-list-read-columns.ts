import { MASTER_LIST_COLUMNS } from "./master-list-columns.js";
import { TRIP_SOURCE_COLUMNS, TRIP_CARGO_COLUMNS } from "./trip-source-columns.js";

/** Do not SELECT *: nested views also expose expensive search/filter expressions.
 * Keep displayed values, source provenance and every physical edit/delete identity.
 * SQL filters and ordering can still use columns outside this projection. */
export const MASTER_LIST_READ_COLUMNS = [...new Set([
  ...MASTER_LIST_COLUMNS.map(column => column.key).filter(key => !["incident_report", "incident_boxes", "incident_details"].includes(key)),
  // Keep the old physical fields available for detailed exports and legacy rows.
  "incident_date", "backload_reason", "backload_number_of_boxes", "ir_status", "ir_submitted_date",
  "backload_comments", "offload_number_of_boxes", "offload_reason",
  ...TRIP_SOURCE_COLUMNS.map(column => column.key),
  ...TRIP_CARGO_COLUMNS.map(column => column.key),
  "trip_id", "_trip_id", "_trip_stop_id", "_trip_line_item_id", "_assignment_id", "_product_id",
  "_trip_type_id", "_warehouse_id", "_customer_id", "_store_id", "_truck_id", "_driver_id", "_trucking_company_id", "_cargo_allocation_id",
  "loading_date", "driver_name", "trip_status", "stop_sequence", "transaction_number", "created_by", "page_no",
  "arrival_time", "start_unloading_time", "finish_unloading_time", "departure_time", "warehouse_departure_time",
  "truck_allocated_by", "truck_allocated_by_name", "subcon_rate_manual", "tms_done_by",
  "transaction_dr_number", "transaction_quantity", "transaction_total_cbm", "transaction_archived_at",
  "transmittal_ref", "transmittal_ref_version", "issue_report_type", "issue_reason", "stop_dispatch_reference",
  "trip_total_cbm", "assigned_cbm", "remaining_unassigned_cbm", "truck_capacity_cbm", "capacity_utilization",
])].join(",");
