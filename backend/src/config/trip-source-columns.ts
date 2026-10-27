import type { ReportColumnDefinition } from "../types/report.types.js";
export const TRIP_SOURCE_COLUMNS: ReportColumnDefinition[] = [
  { key: "sp_reference", title: "SP", type: "text" },
  { key: "ph_truck_reference", title: "PH TRUCK NAME", type: "text" },
  { key: "dn_reference", title: "DN", type: "text" },
  { key: "order_item_number", title: "Order Item No.", type: "text" },
  { key: "so_number", title: "SO NO.", type: "text" },
  { key: "stock_quantity", title: "stocks", type: "number" },
  { key: "unit_cbm", title: "CBM", type: "number" },
  { key: "so_approval_date", title: "SO Approval Date", type: "text" },
  { key: "item_status", title: "Item Status", type: "text" },
  { key: "source_warehouse", title: "Warehouse", type: "text" },
  { key: "source_product_category", title: "Product Category", type: "text" },
  { key: "source_province", title: "Province", type: "text" },
  { key: "source_city", title: "City", type: "text" },
];
export const SOURCE_REPORTS = ["combined", "dispatch", "trip-booking"];
export const TRIP_CARGO_COLUMNS: ReportColumnDefinition[] = [
  {key:"line_allocated_quantity",title:"Truck allocated quantity",type:"number",fieldCategory:"ADMIN"},
  {key:"line_allocated_cbm",title:"Truck allocated CBM",type:"number",fieldCategory:"ADMIN"},
  {key:"assignment_stop_progress",title:"Truck stop progress",type:"text",fieldCategory:"DRIVER"},
];
export const SOURCE_LINE_COLUMNS: ReportColumnDefinition[] = [
  { key: "dr_number", title: "DR", type: "text" }, { key: "sap_so_number", title: "SAP SO No.", type: "text" },
  { key: "customer_po_number", title: "Customer PO", type: "text" }, { key: "internal_po_number", title: "PO NO.", type: "text" },
  { key: "customer_model", title: "Customer Model", type: "text" }, { key: "quantity", title: "Qty", type: "number" },
  { key: "cbm", title: "Total CBM", type: "number" },
];
export const SOURCE_TITLES: Record<string, string> = {
  dr_number: "DR", customer_name: "Customer Name", store_name: "Ship To", ship_to: "Ship To",
  sap_so_number: "SAP SO No.", customer_po_number: "Customer PO", internal_po_number: "PO NO.",
  customer_model: "Customer Model", quantity: "Qty", cbm: "Total CBM",
  product_category: "Catalog category", category: "Catalog category", province: "Destination province", city: "Destination city",
};

export const EXCEL_COLUMN_KEYS = ["sp_reference", "ph_truck_reference", "dn_reference", "dr_number", "order_item_number", "customer_name", "store_name", "sap_so_number", "so_number", "customer_po_number", "internal_po_number", "source_product_category", "source_province", "source_city", "customer_model", "quantity", "stock_quantity", "source_warehouse", "unit_cbm", "cbm", "so_approval_date", "item_status"];
const ADMIN_KEYS = ["dispatch_number", "trip_number", "loading_date", "estimated_delivery_date", "plate_number", "driver_name", "trucking_company", "assigned_cbm", "line_allocated_quantity", "line_allocated_cbm", "warehouse_name", "trip_status"];
const DRIVER_KEYS = ["loading_start_at","loading_finished_at","pod_submitted_at","pod_received_at","delivery_completed_date","assignment_stop_progress", "warehouse_arrival_at", "warehouse_departure_time", "departure_from_warehouse_at", "arrival_time", "start_unloading_time", "finish_unloading_time", "departure_time", "delivery_status", "pod_ac_shipping_date", "signed_dr_upload_date", "driver_remarks", "backload_reason", "offload_reason"];
const adminTitles: Record<string, string> = { dispatch_number: "Dispatch Number", trip_number: "Trip Number", loading_date: "Loading Date", estimated_delivery_date: "Estimated Delivery Date", plate_number: "Assigned Truck / Plate Number", driver_name: "Assigned Driver", trucking_company: "Trucking Company", assigned_cbm: "Truck Allocation", warehouse_name: "Assigned Warehouse", trip_status: "Trip Status" };
export function sourceOrderedColumns(columns: ReportColumnDefinition[], master: boolean) {
  const byKey = new Map(columns.map(column => [column.key, column]));
  if (master) {
    // Ensure all 22 source headers are visible even while source-schema setup is pending.
    for (const column of [...TRIP_SOURCE_COLUMNS, ...SOURCE_LINE_COLUMNS]) if (!byKey.has(column.key)) byKey.set(column.key, column);
  }
  const category = (key: string): "EXCEL" | "ADMIN" | "DRIVER" => EXCEL_COLUMN_KEYS.includes(key) || key === "ship_to" ? "EXCEL" : DRIVER_KEYS.includes(key) || /^(backload|offload|pod_|driver_remarks|receipt)/.test(key) ? "DRIVER" : "ADMIN";
  const keys = master ? [...EXCEL_COLUMN_KEYS, ...ADMIN_KEYS, ...byKey.keys()].filter((key, index, all) => byKey.has(key) && all.indexOf(key) === index) : [...byKey.keys()];
  if (master) keys.sort((left, right) => ["EXCEL", "ADMIN", "DRIVER"].indexOf(category(left)) - ["EXCEL", "ADMIN", "DRIVER"].indexOf(category(right)));
  return keys.map(key => ({ ...byKey.get(key)!, title: SOURCE_TITLES[key] ?? (master ? adminTitles[key] : undefined) ?? byKey.get(key)!.title, fieldCategory: category(key) }));
}
