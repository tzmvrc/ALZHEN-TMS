import assert from "node:assert/strict";
import test from "node:test";
import { EXCEL_COLUMN_KEYS, sourceOrderedColumns, TRIP_SOURCE_COLUMNS, SOURCE_LINE_COLUMNS } from "../src/config/trip-source-columns.js";
import { newProductDrafts, insertProductDrafts, productDraftValues } from "../../frontend/src/services/trip-row-drafts.js";
import { categoryHeaderStyle, FIELD_CATEGORIES } from "../../frontend/src/services/trip-column-categories.js";

test("default source columns match all 22 Cebu labels in adjacent order, followed by admin and driver fields", () => {
  const columns = sourceOrderedColumns([{ key: "customer_name", title: "Customer", type: "text" }, { key: "store_name", title: "Store", type: "text" }, { key: "dispatch_number", title: "Dispatch", type: "text" }, { key: "arrival_time", title: "Store Arrival", type: "date" }, ...TRIP_SOURCE_COLUMNS, ...SOURCE_LINE_COLUMNS], true);
  assert.deepEqual(columns.slice(0, 22).map(column => column.key), EXCEL_COLUMN_KEYS);
  assert.deepEqual(columns.slice(0, 22).map(column => column.title), ["SP", "PH TRUCK NAME", "DN", "DR", "Order Item No.", "Customer Name", "Ship To", "SAP SO No.", "SO NO.", "Customer PO", "PO NO.", "Product Category", "Province", "City", "Customer Model", "Qty", "stocks", "Warehouse", "CBM", "Total CBM", "SO Approval Date", "Item Status"]);
  assert.ok(columns.slice(0,22).every(column => column.fieldCategory === "EXCEL"));
  assert.equal(columns.find(column => column.key === "dispatch_number")?.fieldCategory, "ADMIN");
  assert.equal(columns.at(-1)?.fieldCategory, "DRIVER");
  assert.equal(FIELD_CATEGORIES.EXCEL.background, "#DBEAFE"); assert.equal(FIELD_CATEGORIES.ADMIN.background, "#F3E8FF"); assert.equal(FIELD_CATEGORIES.DRIVER.background, "#DCFCE7");
  const appearance = { ...categoryHeaderStyle("EXCEL"), backgroundColor: "#123456" };
  assert.equal(appearance.backgroundColor, "#123456", "explicit header formatting wins over category defaults");
});
test("new rows inherit only safe parent context, remain individually identifiable and appear below the anchor", () => {
  const parent = { trip_id: "trip", trip_stop_id: "stop", trip_line_item_id: "old-line", customer_name: "Customer", dr_number: "DO-NOT-COPY", customer_model: "DO-NOT-COPY", quantity: 42, assigned_cbm: 4 };
  const drafts = newProductDrafts(parent, 5, "old-line");
  assert.equal(drafts.length, 5); assert.equal(new Set(drafts.map(row => row.trip_line_item_id)).size, 5);
  for (const row of drafts) { assert.equal(row.trip_id, "trip"); assert.equal(row.trip_stop_id, "stop"); assert.equal(row.dr_number, undefined); assert.equal(row.customer_model, undefined); assert.deepEqual(productDraftValues(row), {}); }
  const sibling = { trip_line_item_id: "sibling" };
  const inserted = insertProductDrafts([parent, sibling], drafts, row => String(row.trip_line_item_id));
  assert.equal(inserted[0], parent); assert.equal(inserted[1], drafts[0]); assert.equal(inserted.at(-1), sibling);
  assert.equal(insertProductDrafts([], drafts, () => null).length, 5, "filter changes must not discard unsaved drafts");
  assert.throws(() => newProductDrafts({}, 1, ""), /trip and delivery stop/);
});

test("preview remains readable when import tables are missing and explicitly marks duplicate checks unavailable", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture"; process.env.SUPABASE_ANON_KEY = "fixture";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { previewTripImport } = await import("../src/services/trip-import.service.js");
  const original = supabaseAdmin.from;
  (supabaseAdmin as any).from = () => { const q: any = { select: () => q, eq: () => q, in: () => q, range: async () => ({ data: null, error: { code: "PGRST205" } }) }; return q; };
  try {
    const preview = await previewTripImport([{ name: "source.csv", rows: [{ line: 2, group: "Reviewed group", values: { customer_name: "Customer", ship_to: "Store", customer_model: "Product" } }] }]);
    assert.equal(preview.detected, 1); assert.equal(preview.setup_required, true); assert.equal(preview.duplicate_check_status, "unavailable"); assert.match(preview.setup_message!, /No trip data has been saved/);
  } finally { supabaseAdmin.from = original; }
});

test("Master List retains real product IDs and delivery fields before source-schema activation", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture"; process.env.SUPABASE_ANON_KEY = "fixture";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getReportData, getReportColumns } = await import("../src/services/report.service.js");
  const original = supabaseAdmin.from, queried: string[] = [];
  const trip = "123e4567-e89b-42d3-a456-426614174000", stop = "223e4567-e89b-42d3-a456-426614174000", line = "323e4567-e89b-42d3-a456-426614174000";
  (supabaseAdmin as any).from = (table: string) => {
    queried.push(table); let probe = false;
    const q: any = { select: () => q, eq: () => q, in: () => q, range: () => q, order: () => q, limit: (count: number) => { probe = count === 0; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        const data = table === "v_trip_booking" ? [{ _trip_id: trip, _trip_stop_id: stop, _trip_line_item_id: line, customer_model: "MANUALLY-ADDED" }]
          : table === "trips" ? [{ id: trip, dispatch_number: "EXISTING", trip_reference: "TRIP261021-1" }]
          : table === "trip_stops" ? [{ id: stop, trip_id: trip, arrival_time: "2026-10-21T01:00:00Z", quantity: 4, total_cbm: 0.4 }] : [];
        return Promise.resolve({ data: probe ? null : data, count: data.length, error: probe ? { code: "42703" } : null }).then(resolve);
      } }; return q;
  };
  try {
    const result = await getReportData("dispatch-monitoring", { source_lines: "true" });
    assert.equal(result.rows[0].trip_line_item_id, line); assert.equal(result.rows[0].customer_model, "MANUALLY-ADDED");
    assert.equal(result.rows[0].arrival_time, "2026-10-21T01:00:00Z"); assert.ok(queried.includes("v_trip_booking"));
    assert.deepEqual((await getReportColumns("dispatch-monitoring", true)).columns.slice(0,22).map(column => column.key), EXCEL_COLUMN_KEYS);
  } finally { supabaseAdmin.from = original; }
});
