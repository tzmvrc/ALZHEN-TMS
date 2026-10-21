import type { ReportRow } from "./report.service";
export const PRODUCT_FIELDS = ["sp_reference", "ph_truck_reference", "dn_reference", "dr_number", "order_item_number", "sap_so_number", "so_number", "customer_po_number", "internal_po_number", "customer_model", "product_id", "quantity", "stock_quantity", "unit_cbm", "cbm", "so_approval_date", "item_status", "source_warehouse", "source_product_category", "source_province", "source_city", "remarks"];
const SAFE_PARENT_FIELDS = ["trip_id", "trip_stop_id", "dispatch_number", "trip_number", "trip_reference", "loading_date", "estimated_delivery_date", "customer_id", "customer_name", "store_id", "store_name", "ship_to", "trip_type", "trip_status", "warehouse_name"];
export function newProductDrafts(parent: ReportRow, count: number, anchor: string): ReportRow[] {
  if (!parent.trip_id || !parent.trip_stop_id) throw new Error("Select a trip and delivery stop before adding product rows.");
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error("Add 1–100 draft rows at a time. Save these before adding another batch.");
  const context = Object.fromEntries(SAFE_PARENT_FIELDS.filter(key => parent[key] != null).map(key => [key, parent[key]]));
  return Array.from({ length: count }, () => ({ ...context, trip_line_item_id: crypto.randomUUID(), _new_product_draft: true, _draft_anchor: anchor }));
}
export function productDraftValues(row: ReportRow) {
  return Object.fromEntries(PRODUCT_FIELDS.filter(key => row[key] != null && row[key] !== "").map(key => [key, row[key]]));
}
export function insertProductDrafts(rows: ReportRow[], drafts: ReportRow[], identity: (row: ReportRow) => string | null) {
  const inserted = new Set<ReportRow>();
  const result: ReportRow[] = [];
  for (const row of rows) {
    result.push(row);
    for (const draft of drafts) if (draft._draft_anchor === identity(row)) { result.push(draft); inserted.add(draft); }
  }
  // Filtering/pagination changes never discard unsaved drafts; keep unmatched anchors visible.
  return [...result, ...drafts.filter(row => !inserted.has(row))];
}
