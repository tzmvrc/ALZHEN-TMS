import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
test("DR lookup uses bounded stable transaction rows, server search and archive exclusion", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { searchOffloadTransactions } = await import("../src/services/operations-report.service.js");
  const original = supabaseAdmin.from;
  const calls: unknown[] = [];
  let fail = false;
  (supabaseAdmin as any).from = (table: string) => {
    calls.push(table);
    const chain: any = { select: () => chain, is: (key: string, value: unknown) => { calls.push(["is", key, value]); return chain; }, not: () => chain, neq: () => chain, order: (key: string) => { calls.push(["order", key]); return chain; }, range: (from: number, to: number) => { calls.push(["range", from, to]); return chain; }, or: (filter: string) => { calls.push(["search", filter]); return chain; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: fail ? null : [
      { _trip_id: "trip", _trip_stop_id: "stop-one", transaction_dr_number: "DR-1", transaction_quantity: 0, transaction_total_cbm: null, warehouse_name: "Warehouse", store_name: "One" },
      { _trip_id: "trip", _trip_stop_id: "stop-two", transaction_dr_number: "DR-1", transaction_quantity: 2, transaction_total_cbm: 1.5, warehouse_name: "Warehouse", store_name: "Two" },
      { _trip_id: "trip", _trip_stop_id: "blank", transaction_dr_number: " " },
    ], error: fail ? { code: "XX000" } : null }).then(resolve) }; return chain;
  };
  try {
    await assert.rejects(searchOffloadTransactions({ profileId: "actor", role: "OTHER" }, ""));
    assert.equal(calls.length, 0);
    const result = await searchOffloadTransactions({ profileId: "actor", role: "ADMIN" }, "DR-1", 2);
    assert.deepEqual(result.rows.map((row) => row.id), ["stop-one", "stop-two"]);
    assert.equal(result.rows[0].quantity, 0); assert.equal(result.rows[0].total_cbm, null);
    assert.equal(result.rows[0].route, "Warehouse → One");
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["range", 50, 100])));
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["is", "transaction_archived_at", null])));
    assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "search" && String(call[1]).includes("warehouse_name.ilike")));
    fail = true; await assert.rejects(searchOffloadTransactions({ profileId: "actor", role: "ADMIN" }, ""), /Unable to read DR/);
  } finally { (supabaseAdmin as any).from = original; }
});
