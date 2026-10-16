import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const uuid = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`;

test("actual delete service preserves protected reports, targets physical IDs and handles dependency races", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { deleteOperationsReport } = await import("../src/services/operations-report.service.js");
  const actor = { profileId: uuid(1), role: "ADMIN" };
  const trip = uuid(2), stop = uuid(3), offload = uuid(4), sibling = uuid(5);
  const tables: Record<string, Array<Record<string, any>>> = {
    trips: [{ id: trip }], trip_stops: [{ id: stop, trip_id: trip }],
    offloads: [{ id: offload, trip_id: trip, trip_stop_id: stop }, { id: sibling, trip_id: trip, trip_stop_id: stop }],
    offload_items: [{ id: uuid(6), offload_id: offload }, { id: uuid(7), offload_id: sibling }],
    report_receipts: [], operations_report_conversions: [],
  };
  const original = supabaseAdmin.from, originalRpc = supabaseAdmin.rpc;
  const writes: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  let failure: string | null = null;
  (supabaseAdmin as any).rpc = async (name: string, input: { p_offload_id: string; p_actor_id: string }) => {
    assert.equal(name, "delete_offload_with_cleanup_v1");
    assert.deepEqual(input, { p_offload_id: offload, p_actor_id: actor.profileId });
    const parent = tables.offloads.find((row) => row.id === input.p_offload_id);
    if (!parent) return { data: null, error: { code: "P0002", message: "Offload report not found." } };
    if (tables.operations_report_conversions.some((row) => row.source_id === offload || row.target_id === offload)) return { data: null, error: { code: "55000", message: "This report is protected by conversion history." } };
    if (failure === "55000") return { data: null, error: { code: failure, message: "A receipt is referenced by a retained document." } };
    writes.push({ table: "offloads", filters: [["id", offload], ["trip_id", trip], ["trip_stop_id", stop]] });
    if (failure) return { data: null, error: { code: failure, message: "FK race" } };
    tables.offloads = tables.offloads.filter((row) => row.id !== offload);
    tables.offload_items = tables.offload_items.filter((row) => row.offload_id !== offload);
    return { data: { id: uuid(10), offload_id: offload, trip_id: trip, trip_stop_id: stop, state: "COMPLETE", storage_paths: [], attempts: 0 }, error: null };
  };
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = []; let deleting = false, count = false;
    const query: any = { select: (_: string, options?: { head?: boolean }) => { count = options?.head === true; return query; }, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, is: (key: string, value: unknown) => { filters.push([key, value]); return query; }, delete: () => { deleting = true; return query; }, maybeSingle: async () => execute(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve) };
    function execute() {
      const matches = (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      if (count) return { data: null, count: matches.length, error: null };
      if (deleting) {
        writes.push({ table, filters });
        if (failure) return { data: null, error: { code: failure, message: "linked receipt race" } };
        if (matches[0]) {
          tables[table] = tables[table].filter((row) => row !== matches[0]);
          // Isolated fixture models the catalog-verified ON DELETE CASCADE.
          tables.offload_items = tables.offload_items.filter((item) => item.offload_id !== matches[0].id);
        }
      }
      return { data: matches[0] ?? null, error: null };
    }
    return query;
  };
  try {
    await assert.rejects(deleteOperationsReport({ ...actor, role: "TRUCKER" }, "OFFLOAD", offload), /Only ADMIN or STAFF/);
    await assert.rejects(deleteOperationsReport(actor, "TRIPS", offload), /exactly one/);
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", `offload:${offload}`), /UUID/);
    tables.report_receipts.push({ id: uuid(8), offload_id: offload });
    failure = "55000";
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", offload), /retained document/);
    assert.equal(tables.report_receipts.length, 1); assert.equal(writes.length, 0);
    tables.report_receipts = []; failure = null;
    tables.operations_report_conversions.push({ id: uuid(9), source_type: "OFFLOAD", source_id: offload });
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", offload), /conversion history/);
    tables.operations_report_conversions = [{ id: uuid(9), target_type: "OFFLOAD", target_id: offload }];
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", offload), /conversion history/);
    assert.equal(writes.length, 0);
    tables.operations_report_conversions = []; failure = "23503";
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", offload), /Protected dependencies/);
    assert.equal(tables.offloads.length, 2); assert.equal(tables.offload_items.length, 2);
    failure = null;
    await deleteOperationsReport(actor, "OFFLOAD", offload);
    assert.deepEqual(writes.at(-1), { table: "offloads", filters: [["id", offload], ["trip_id", trip], ["trip_stop_id", stop]] });
    assert.deepEqual(tables.offloads.map((row) => row.id), [sibling]);
    assert.deepEqual(tables.offload_items.map((row) => row.offload_id), [sibling]);
    await assert.rejects(deleteOperationsReport(actor, "OFFLOAD", offload), /not found/);
    assert.equal(tables.offloads.length, 1, "duplicate requests never target the sibling");
  } finally { (supabaseAdmin as any).from = original; (supabaseAdmin as any).rpc = originalRpc; }
});
