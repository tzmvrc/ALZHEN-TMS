import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTransactionNumber } from "../src/services/transaction-values.logic.js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`;
const tripId = id(1), actor = { id: id(2), role: "ADMIN" }, tableId = id(3), columnId = id(4);

test("transaction quantities distinguish blank and zero and validate decimal precision", () => {
  assert.equal(normalizeTransactionNumber(null, "quantity"), null);
  assert.equal(normalizeTransactionNumber("", "total_cbm"), null);
  assert.equal(normalizeTransactionNumber(0, "quantity"), 0);
  assert.equal(normalizeTransactionNumber("12.125", "quantity"), 12.125);
  assert.equal(normalizeTransactionNumber("1.123456", "total_cbm"), 1.123456);
  assert.equal(normalizeTransactionNumber("00012.120", "quantity"), 12.12);
  assert.throws(() => normalizeTransactionNumber("999999999999999.999", "quantity"), /precision/);
  for (const value of [-1, Infinity, NaN, "abc", {}, "1.1234"]) assert.throws(() => normalizeTransactionNumber(value, "quantity"));
});

test("actual transaction services scope archives, reference CAS and DR writes to the selected stop", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/transaction.service.js");
  const { updateTrackerCell } = await import("../src/services/transmittal-tracker.service.js");
  const stops = [1, 2, 3].map((n) => ({ id: id(10 + n), trip_id: tripId, archived_at: null as string | null, dr_number: `DR-${n}`, dr_version: 0 }));
  const tables: Record<string, any[]> = {
    trips: [{ id: tripId, archived_at: null }], trip_stops: stops,
    offloads: [{ id: id(50), trip_id: tripId, trip_stop_id: stops[1].id }], pod_records: [{ id: id(51), trip_id: tripId, trip_stop_id: stops[1].id }],
    flex_tables: [{ id: tableId, name: "Transmittal Tracker (System)", table_kind: "CUSTOM", archived_at: null, settings: { system_key: "alzhen_transmittal_tracker_v1" } }],
    flex_columns: [{ id: columnId, table_id: tableId, binding_scope: "STOP", is_archived: false, value_type: "TEXT", settings: { system_key: "transmittal_ref" } }],
    flex_rows: stops.map((stop, n) => ({ id: id(20 + n), table_id: tableId, row_kind: "SOURCE", source_entity_type: "STOP", source_entity_id: stop.id, archived_at: null })),
    flex_cells: stops.map((_, n) => ({ id: id(30 + n), row_id: id(20 + n), column_id: columnId, value: `REF-${n + 1}`, version: 1 })),
    flex_table_permissions: [], flex_audit_events: [],
  };
  const original = supabaseAdmin.from;
  const writes: Array<{ table: string; filters: Array<[string, unknown]>; payload: any }> = [];
  let failWrite = false;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let operation = "read", payload: any;
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, or: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      update: (value: unknown) => { operation = "update"; payload = value; return chain; },
      insert: (value: unknown) => { operation = "insert"; payload = value; return chain; },
      maybeSingle: async () => execute(true), single: async () => execute(true),
      then: (resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) => Promise.resolve(execute(false)).then(resolve, reject),
    };
    function execute(single: boolean) {
      const rows = tables[table] ?? (tables[table] = []);
      const matching = rows.filter((row) => filters.every(([key, value]) => (key.includes("->>") ? row.settings?.[key.split("->>")[1]] : row[key]) === value));
      if (operation !== "read") {
        writes.push({ table, filters: [...filters], payload: { ...payload } });
        if (failWrite) { failWrite = false; return { data: null, error: { message: "simulated write failure" } }; }
        if (operation === "insert") rows.push({ id: id(100 + writes.length), ...payload });
        else for (const row of matching) { if (table === "trip_stops" && "dr_number" in payload) row.dr_version++; Object.assign(row, payload); }
      }
      return { data: single ? matching[0] ?? null : matching, error: null };
    }
    return chain;
  };
  try {
    await service.setTransactionArchive(actor, tripId, stops[1].id, true);
    assert.equal(stops[0].archived_at, null); assert.ok(stops[1].archived_at); assert.equal(stops[2].archived_at, null);
    assert.deepEqual(writes[0].filters, [["id", stops[1].id], ["trip_id", tripId]]);
    assert.equal(tables.offloads.length, 1); assert.equal(tables.pod_records.length, 1); assert.equal(tables.flex_rows.length, 3);
    let before = writes.length;
    await assert.rejects(service.setTransactionArchive(actor, id(99), stops[1].id, true), /does not belong/);
    await assert.rejects(service.setTransactionArchive({ ...actor, role: "TRUCKER" }, tripId, stops[1].id, true), /Only ADMIN or STAFF/);
    await assert.rejects(service.setTransactionArchive(actor, tripId, null, true), /exact delivery transaction/);
    assert.equal(writes.length, before);
    await service.setTransactionArchive(actor, tripId, stops[1].id, false);
    assert.ok(stops.every((stop) => stop.archived_at === null));
    await service.updateTransactionReference(actor, tripId, stops[1].id, { value: "EDITED-2", expected_version: 1 });
    assert.deepEqual(tables.flex_cells.map((cell) => cell.value), ["REF-1", "EDITED-2", "REF-3"]);
    const write = writes.find((entry) => entry.table === "flex_cells")!;
    assert.deepEqual(write.filters, [["id", id(31)], ["version", 1]]);
    before = writes.length;
    await assert.rejects(service.updateTransactionReference(actor, id(99), stops[0].id, { value: "WRONG", expected_version: 1 }), /does not belong/);
    await assert.rejects(service.updateTransactionReference(actor, tripId, stops[1].id, { value: "STALE", expected_version: 1 }), /changed since/);
    await assert.rejects(service.updateTransactionReference({ ...actor, role: "STAFF" }, tripId, stops[0].id, { value: "DENIED", expected_version: 1 }), /permission/);
    assert.equal(writes.length, before, "wrong parent, stale reference and unauthorized actor perform no writes");
    await updateTrackerCell(actor, stops[1].id, "delivery_receipt_no_override", { value: "NEW-DR-2", expected_version: 0 });
    assert.deepEqual(stops.map((stop) => stop.dr_number), ["DR-1", "NEW-DR-2", "DR-3"]);
    await assert.rejects(updateTrackerCell(actor, stops[1].id, "delivery_receipt_no_override", { value: "STALE", expected_version: 0 }), /changed/);
    failWrite = true;
    await assert.rejects(service.setTransactionArchive(actor, tripId, stops[0].id, true), /Unable to archive/);
    assert.equal(stops[0].archived_at, null);
  } finally { (supabaseAdmin as any).from = original; }
});
