// Server allowlist derived from existing editable-report mappings; tested against them.
export const DRAFT_REPORT_FIELDS:Record<string,Record<string,readonly string[]>>={
  "combined": {
    "trips": [
      "added_to_report",
      "dispatch_number",
      "estimated_delivery_date",
      "lbc_tracking_number",
      "letter_status",
      "loading_date",
      "pod_ac_shipping_date",
      "remarks",
      "signed_dr_upload_date",
      "status",
      "subcon_rate_manual",
      "tms_date",
      "tms_done_by",
      "transaction_number",
      "transmittal_date",
      "trip_number",
      "trip_type_id",
      "truck_allocated_by",
      "warehouse_id"
    ],
    "trip_stops": [
      "arrival_time",
      "customer_id",
      "delivery_status",
      "departure_time",
      "dispatch_number",
      "dr_number",
      "finish_unloading_time",
      "quantity",
      "remarks",
      "start_unloading_time",
      "stop_sequence",
      "store_id",
      "total_cbm",
      "transaction_number"
    ],
    "loading_reports": [
      "loading_finished_at",
      "loading_start_at"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id",
      "trucking_company_id"
    ],
    "trip_line_items": [
      "cbm",
      "customer_model",
      "customer_po_number",
      "dr_number",
      "internal_po_number",
      "product_id",
      "quantity",
      "remarks",
      "sap_so_number"
    ]
  },
  "dispatch-monitoring": {
    "trips": [
      "added_to_report",
      "dispatch_number",
      "lbc_tracking_number",
      "letter_status",
      "loading_date",
      "pod_ac_shipping_date",
      "remarks",
      "signed_dr_upload_date",
      "status",
      "subcon_rate_manual",
      "tms_date",
      "tms_done_by",
      "transaction_number",
      "transmittal_date",
      "trip_number",
      "truck_allocated_by",
      "warehouse_id"
    ],
    "trip_stops": [
      "arrival_time",
      "customer_id",
      "delivery_status",
      "departure_time",
      "dispatch_number",
      "dr_number",
      "finish_unloading_time",
      "quantity",
      "start_unloading_time",
      "stop_sequence",
      "store_id",
      "total_cbm",
      "transaction_number"
    ],
    "loading_reports": [
      "loading_finished_at",
      "loading_start_at"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id",
      "trucking_company_id"
    ]
  },
  "dispatch": {
    "trips": [
      "added_to_report",
      "dispatch_number",
      "estimated_delivery_date",
      "lbc_tracking_number",
      "letter_status",
      "loading_date",
      "pod_ac_shipping_date",
      "remarks",
      "signed_dr_upload_date",
      "subcon_rate_manual",
      "tms_date",
      "tms_done_by",
      "transaction_number",
      "transmittal_date",
      "trip_number",
      "warehouse_id"
    ],
    "trip_stops": [
      "arrival_time",
      "customer_id",
      "delivery_status",
      "departure_time",
      "dispatch_number",
      "finish_unloading_time",
      "start_unloading_time",
      "store_id",
      "transaction_number"
    ],
    "loading_reports": [
      "loading_finished_at",
      "loading_start_at"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id",
      "trucking_company_id"
    ],
    "trip_line_items": [
      "cbm",
      "customer_model",
      "customer_po_number",
      "dr_number",
      "internal_po_number",
      "product_id",
      "quantity",
      "sap_so_number"
    ]
  },
  "trip-booking": {
    "trips": [
      "added_to_report",
      "dispatch_number",
      "estimated_delivery_date",
      "lbc_tracking_number",
      "letter_status",
      "loading_date",
      "pod_ac_shipping_date",
      "remarks",
      "signed_dr_upload_date",
      "status",
      "subcon_rate_manual",
      "tms_date",
      "tms_done_by",
      "transaction_number",
      "transmittal_date",
      "trip_number",
      "trip_type_id",
      "truck_allocated_by",
      "warehouse_id"
    ],
    "trip_stops": [
      "customer_id",
      "delivery_status",
      "dispatch_number",
      "stop_sequence",
      "store_id",
      "transaction_number"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id",
      "trucking_company_id"
    ],
    "trip_line_items": [
      "cbm",
      "customer_model",
      "customer_po_number",
      "dr_number",
      "internal_po_number",
      "product_id",
      "quantity",
      "sap_so_number"
    ],
    "billings": [
      "invoice_number"
    ]
  },
  "store-calling": {
    "trips": [
      "dispatch_number"
    ],
    "trip_stops": [
      "customer_id",
      "dispatch_number",
      "store_id"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id"
    ],
    "store_calls": [
      "assigned_to",
      "confirmation_status",
      "contact_id",
      "contact_number",
      "date_assigned",
      "date_of_contact",
      "status"
    ]
  },
  "trips": {
    "trips": [
      "added_to_report",
      "dispatch_number",
      "estimated_delivery_date",
      "lbc_tracking_number",
      "letter_status",
      "loading_date",
      "pod_ac_shipping_date",
      "remarks",
      "signed_dr_upload_date",
      "status",
      "subcon_rate_manual",
      "tms_date",
      "tms_done_by",
      "transaction_number",
      "transmittal_date",
      "trip_number",
      "trip_type_id",
      "truck_allocated_by",
      "warehouse_id"
    ],
    "trip_stops": [
      "arrival_time",
      "customer_id",
      "delivery_status",
      "departure_time",
      "dispatch_number",
      "dr_number",
      "finish_unloading_time",
      "quantity",
      "remarks",
      "start_unloading_time",
      "stop_sequence",
      "store_id",
      "total_cbm",
      "transaction_number"
    ],
    "trip_line_items": [
      "cbm",
      "customer_model",
      "customer_po_number",
      "dr_number",
      "internal_po_number",
      "product_id",
      "quantity",
      "remarks",
      "sap_so_number"
    ],
    "trip_truck_assignments": [
      "driver_id",
      "truck_id",
      "trucking_company_id"
    ],
    "billings": [
      "invoice_number"
    ],
    "store_calls": [
      "assigned_to",
      "confirmation_status",
      "contact_id",
      "contact_number",
      "date_assigned",
      "date_of_contact",
      "status"
    ],
    "loading_reports": [
      "loading_finished_at",
      "loading_start_at"
    ]
  },
  "operations": {
    "trips": [
      "remarks",
      "dispatch_number"
    ],
    "trip_stops": [
      "remarks",
      "dispatch_number",
      "finish_unloading_time"
    ],
    "offloads": [
      "comments",
      "reason",
      "number_of_boxes",
      "reported_at",
      "item.quantity",
      "item.total_cbm"
    ],
    "backloads": [
      "comments",
      "reason",
      "number_of_boxes"
    ],
    "offload_items": [
      "quantity",
      "total_cbm"
    ],
    "loading_reports": [
      "warehouse_arrival_at",
      "loading_start_at",
      "loading_finished_at"
    ]
  },
  "transmittal-tracker": {
    "trip_stops": [
      "dr_number"
    ]
  }
};
for (const report of ["trips", "combined", "dispatch", "trip-booking", "dispatch-monitoring"]) {
  const fields = DRAFT_REPORT_FIELDS[report] ??= {};
  fields.trip_line_items = [...(fields.trip_line_items ?? []), "dr_number", "sap_so_number", "customer_po_number", "internal_po_number", "customer_model", "quantity", "cbm", "sp_reference", "ph_truck_reference", "dn_reference", "order_item_number", "so_number", "stock_quantity", "unit_cbm", "so_approval_date", "item_status", "source_warehouse", "source_product_category", "source_province", "source_city"];
}
