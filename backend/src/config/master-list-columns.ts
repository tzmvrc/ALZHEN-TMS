import type { ReportColumnDefinition } from "../types/report.types.js";

/** CSV order, with Page No. omitted and the eight incident fields summarized
 * into three visible columns. The original fields remain in the read projection. */
export const MASTER_LIST_COLUMNS: ReportColumnDefinition[] = [
  { key: "dispatch_number", title: "Dispatch no.", type: "text" },
  { key: "added_to_report", title: "Added to report?", type: "boolean" },
  { key: "remarks", title: "Comments", type: "text" },
  { key: "trip_type", title: "Trip type", type: "text" },
  { key: "letter_status", title: "Letter status", type: "text" },
  { key: "plate_number", title: "Plate no.", type: "text" },
  { key: "trucking_company", title: "Trucker GC Name", type: "text" },
  { key: "trip_number", title: "Trip no.", type: "text" },
  { key: "request_received_at", title: "Email date", type: "date" },
  { key: "added_by_name", title: "Added by", type: "text" },
  { key: "warehouse_code", title: "WH CODE", type: "text" },
  { key: "warehouse_name", title: "Ship From", type: "text" },
  { key: "store_name", title: "Ship To", type: "text" },
  { key: "customer_name", title: "Customer Name", type: "text" },
  { key: "dr_number", title: "DR", type: "text" },
  { key: "sap_so_number", title: "SAP SO No.", type: "text" },
  { key: "customer_po_number", title: "Customer PO", type: "text" },
  { key: "internal_po_number", title: "PO NO.", type: "text" },
  { key: "source_product_category", title: "Product Category", type: "text" },
  { key: "customer_model", title: "Customer Model", type: "text" },
  { key: "quantity", title: "Qty", type: "number" },
  { key: "cbm", title: "Total CBM", type: "number" },
  { key: "source_province", title: "Province", type: "text" },
  { key: "source_city", title: "City", type: "text" },
  { key: "incident_report", title: "Incident Report", type: "text" },
  { key: "incident_boxes", title: "No. of Box", type: "text" },
  { key: "incident_details", title: "Details", type: "text" },
  { key: "delivery_status", title: "Delivery status", type: "text" },
  { key: "delivery_completed_date", title: "Delivery completed date", type: "date" },
  { key: "pod_status", title: "POD status", type: "text" },
  { key: "signed_dr_upload_date", title: "Signed DR uploading date to Google Drive", type: "date" },
  { key: "transmittal_date", title: "Transmittal date", type: "date" },
  { key: "tms_date", title: "TMS date", type: "date" },
  { key: "tms_done_by_name", title: "TMS done by", type: "text" },
  { key: "pod_ac_shipping_date", title: "POD/AC shipping date", type: "date" },
  { key: "lbc_tracking_number", title: "LBC tracking no.", type: "text" },
  { key: "pod_remarks", title: "POD comments", type: "text" },
  { key: "invoice_number", title: "Invoice no.", type: "text" },
];

/** Read from Master List!A1:AR1 in the original 2026 Trip Booking Details.xlsx.
 * Direct fills override the Master_List table's TableStyleLight9/accent1 header.
 * Fill IDs 19 and 20 have the same RGB and therefore belong to ONE navy group.
 * Pastels retain the source groups, with distinct cyan, mint-teal, and blue-navy
 * shades. Assignments never depend on a field's responsibility or name prefix.
 */
const MASTER_HEADER_GROUPS = {
  CYAN: { group: "source-cyan", label: "Cyan · Incident / Backload", sourceColor: "#0B77A0", background: "#E7F6FC", color: "#24384A" },
  TEAL: { group: "source-teal", label: "Teal · Booking / Geography", sourceColor: "#156082", background: "#E7F5F1", color: "#24384A" },
  PURPLE: { group: "source-purple", label: "Purple · Warehouse / Order / Cargo", sourceColor: "#78206E", background: "#F1ECFA", color: "#24384A" },
  ORANGE: { group: "source-orange", label: "Orange · Offload", sourceColor: "#C04F15", background: "#FFF2E7", color: "#24384A" },
  NAVY: { group: "source-navy", label: "Navy · Delivery / POD / Billing", sourceColor: "#002060", background: "#EAF0FA", color: "#24384A" },
} as const;
const MASTER_HEADER_ASSIGNMENTS: Record<string, keyof typeof MASTER_HEADER_GROUPS> = {
  // B1:K1 (table-style accent1; cell fill 0 does not mean a white header).
  dispatch_number: "TEAL", added_to_report: "TEAL", remarks: "TEAL", trip_type: "TEAL",
  letter_status: "TEAL", plate_number: "TEAL", trucking_company: "TEAL", trip_number: "TEAL",
  request_received_at: "TEAL", added_by_name: "TEAL",
  // L1:W1 (direct fill 8).
  warehouse_code: "PURPLE", warehouse_name: "PURPLE", store_name: "PURPLE", customer_name: "PURPLE",
  dr_number: "PURPLE", sap_so_number: "PURPLE", customer_po_number: "PURPLE", internal_po_number: "PURPLE",
  source_product_category: "PURPLE", customer_model: "PURPLE", quantity: "PURPLE", cbm: "PURPLE",
  // X1:Y1 have the same inherited header color as B1:K1.
  source_province: "TEAL", source_city: "TEAL",
  // The source incident/backload/offload groups share one restrained header style.
  incident_report: "CYAN", incident_boxes: "CYAN", incident_details: "CYAN",
  // AH1:AJ1 use fill 19; AK1:AR1 use fill 20. Both resolve to #002060.
  delivery_status: "NAVY", delivery_completed_date: "NAVY", pod_status: "NAVY",
  signed_dr_upload_date: "NAVY", transmittal_date: "NAVY", tms_date: "NAVY", tms_done_by_name: "NAVY",
  pod_ac_shipping_date: "NAVY", lbc_tracking_number: "NAVY", pod_remarks: "NAVY", invoice_number: "NAVY",
};
for (const column of MASTER_LIST_COLUMNS) column.sourceHeader = MASTER_HEADER_GROUPS[MASTER_HEADER_ASSIGNMENTS[column.key]];

export const MASTER_RELATED_FIELDS = ["page_no", "incident_date", "ir_status", "ir_submitted_date", "backload_reason", "backload_number_of_boxes", "backload_comments", "offload_number_of_boxes", "offload_reason", "pod_status", "pod_remarks", "invoice_number", "created_by"];
