import assert from "node:assert/strict";
import test from "node:test";
import { splitOffloadDetails } from "../src/services/offload-details.logic.js";
import { buildOperationsEventRows } from "../src/services/operations-report.logic.js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`;
const actor = { profileId: id(1), role: "ADMIN" };

test("Offload defaults use creation instant and Manila calendar date, preserving creator independently", () => {
  const { metadata } = splitOffloadDetails({}, actor, true, new Date("2026-10-15T17:00:00Z"));
  assert.equal(metadata.reported_at, "2026-10-15T17:00:00.000Z");
  assert.equal(metadata.report_date, "2026-10-16");
  assert.equal(metadata.reported_by, actor.profileId);
  assert.equal(metadata.created_by, actor.profileId);
  assert.equal(splitOffloadDetails({}, { ...actor, role: "TRUCKER" }, true).metadata.reported_by, actor.profileId);
  const changed = splitOffloadDetails({ reported_by: id(2), reported_at: "2026-10-16T09:30:00+08:00" }, { ...actor, role: "STAFF" }, true).metadata;
  assert.equal(changed.reported_by, id(2)); assert.equal(changed.created_by, actor.profileId);
  assert.equal(changed.reported_at, "2026-10-16T01:30:00.000Z");
});

test("Offload projection preserves physical IDs, reporter names and historical date-only records", () => {
  const rows = buildOperationsEventRows({ trips: [{ id: id(10), trip_number: "TR", dispatch_number: "OLD" }], stops: [{ id: id(21), trip_id: id(10), stop_sequence: 1, dispatch_number: "CURRENT" }], lineItems: [], loading: [], unloading: [], backloads: [],
    offloads: [
      { id: id(50), trip_id: id(10), trip_stop_id: id(21), reason: "Reason", number_of_boxes: null, comments: "Remark", reported_at: "2026-10-15T17:00:00Z", reported_by_name: "Report User", creator_name: "Actual Creator", items: [{ id: id(60), offload_id: id(50), trip_line_item_id: null, quantity: 0, total_cbm: 1.25 }] },
      { id: id(51), trip_id: id(10), trip_stop_id: null, reason: "Legacy", number_of_boxes: null, comments: null, report_date: "2026-09-01" },
    ], routes: new Map(), vehicles: new Map() });
  assert.equal(rows[0].source_record_id, id(50)); assert.equal(rows[0].dispatch_number, "CURRENT");
  assert.equal(rows[0].reported_by, "Report User"); assert.equal(rows[0].offload_records[0].creator_name, "Actual Creator");
  assert.equal(rows[0].date, "2026-10-15T17:00:00Z"); assert.equal(rows[0].quantity, 0); assert.equal(rows[0].total_cbm, 1.25); assert.equal(rows[0].remarks, "Remark");
  assert.equal(rows[1].date, "2026-09-01"); assert.equal(rows[1].reported_by, null); assert.equal(rows[1].quantity, null);
});
test("Trucker cannot override date or reporter; invalid timestamps/profile IDs are rejected", () => {
  for (const field of ["reported_by", "reported_at"]) assert.throws(() => splitOffloadDetails({ [field]: id(2) }, { ...actor, role: "TRUCKER" }, false), /Only ADMIN or STAFF/);
  for (const value of [null, "bad", "2026-10-16T09:30", "2026-02-30T09:30:00+08:00"]) assert.throws(() => splitOffloadDetails({ reported_at: value }, actor, true));
  assert.throws(() => splitOffloadDetails({ reported_by: "not-a-profile" }, actor, true), /UUID/);
  assert.deepEqual(splitOffloadDetails({ comments: "remark" }, actor, false).metadata, {}, "ordinary edits do not reset reporter/date/creator");
});

test("reporter lookup is management-only, bounded and includes all three supported roles", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { listOperationsReporters } = await import("../src/services/operations-report.service.js");
  const original = supabaseAdmin.from;
  const calls: Array<[string, unknown]> = [];
  (supabaseAdmin as any).from = () => {
    const chain: any = { select: () => chain, order: () => chain, in: (key: string, values: unknown) => { calls.push([key, values]); return chain; }, limit: (value: number) => { calls.push(["limit", value]); return chain; }, or: (value: string) => { calls.push(["search", value]); return chain; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: id(2), first_name: "Full", last_name: "Name", role: "TRUCKER" }], error: null }).then(resolve) };
    return chain;
  };
  try {
    await assert.rejects(listOperationsReporters({ ...actor, role: "TRUCKER" }, ""), /Only ADMIN or STAFF/);
    assert.equal(calls.length, 0);
    const users = await listOperationsReporters(actor, "Full Name");
    assert.deepEqual(calls[0], ["role", ["ADMIN", "STAFF", "TRUCKER"]]);
    assert.deepEqual(calls[1], ["limit", 100]); assert.equal(calls.filter(([key]) => key === "search").length, 2);
    assert.deepEqual(users, [{ id: id(2), name: "Full Name", role: "TRUCKER" }]);
  } finally { (supabaseAdmin as any).from = original; }
});

test("actual Offload service creates exact stop snapshots atomically and validates before writes", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/operations-report.service.js");
  const trip = { id: id(10), status: "IN_PROGRESS", archived_at: null };
  const stops = [1, 2, 3].map((n) => ({ id: id(20 + n), trip_id: trip.id, quantity: n, total_cbm: n / 10, archived_at: null as string | null }));
  const reports: Record<string, any>[] = [{ id: id(50), trip_id: trip.id, trip_stop_id: stops[1].id, created_by: actor.profileId, reason: "Legacy", comments: "Old" }];
  const tables: Record<string, any[]> = { trips: [trip], trip_stops: stops, offloads: reports, profiles: [{ id: actor.profileId, role: "ADMIN" }, { id: id(2), role: "TRUCKER" }, { id: id(3), role: "OTHER" }], operations_report_conversions: [] };
  const original = supabaseAdmin.from, originalRpc = supabaseAdmin.rpc;
  const writes: any[] = [];
  let fail = false;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = []; let values: any;
    const chain: any = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, update: (value: unknown) => { values = value; return chain; }, maybeSingle: async () => {
      const row = tables[table]?.find((item) => filters.every(([key, value]) => item[key] === value));
      if (values) { writes.push({ table, filters, values }); if (fail) return { data: null, error: { code: "XX000" } }; if (row) Object.assign(row, values); }
      return { data: row ?? null, error: null };
    } }; return chain;
  };
  (supabaseAdmin as any).rpc = async (name: string, input: any) => {
    assert.equal(name, "create_offload_with_item_v1");
    if (fail) return { data: null, error: { code: "XX000", message: "atomic write failed" } };
    writes.push({ rpc: name, ...input }); return { data: { id: id(60), ...input.p_report }, error: null };
  };
  const values = { trip_id: trip.id, trip_stop_id: stops[1].id, reason: "Issue" };
  try {
    await service.createOffload(actor, values);
    assert.deepEqual(writes[0].p_item, { quantity: 2, total_cbm: 0.2 });
    assert.equal(writes[0].p_report.trip_stop_id, stops[1].id);
    await service.createOffload(actor, { ...values, quantity: 0, total_cbm: null, reported_by: id(2) });
    assert.deepEqual(writes[1].p_item, { quantity: 0, total_cbm: null });
    assert.equal(writes[1].p_report.created_by, actor.profileId);
    assert.equal(writes[1].p_report.reported_by, id(2));
    assert.deepEqual(stops.map((stop) => stop.quantity), [1, 2, 3]);
    const count = writes.length;
    for (const extra of [{ trip_stop_id: id(999) }, { reported_by: id(3) }, { quantity: -1 }]) await assert.rejects(service.createOffload(actor, { ...values, ...extra }));
    stops[1].archived_at = "2026-10-15T00:00:00Z";
    await assert.rejects(service.createOffload(actor, values), /archived/);
    assert.equal(writes.length, count);
    stops[1].archived_at = null;
    await service.updateOffload(actor, reports[0].id, { trip_id: trip.id, trip_stop_id: stops[1].id, comments: "New remark", reported_by: id(2) });
    assert.deepEqual(writes.at(-1).filters, [["id", reports[0].id], ["trip_id", trip.id]]);
    assert.deepEqual(writes.at(-1).values, { comments: "New remark", reported_by: id(2) });
    assert.equal(reports[0].created_by, actor.profileId);
    fail = true;
    await assert.rejects(service.updateOffload(actor, reports[0].id, { trip_id: trip.id, comments: "Failed draft" }), /Unable to update offload/);
    assert.equal(reports[0].comments, "New remark");
    await assert.rejects(service.createOffload(actor, values), /Unable to create offload/);
    assert.equal(reports.length, 1, "failed creation never inserts a parent through a second service request");
  } finally { (supabaseAdmin as any).from = original; (supabaseAdmin as any).rpc = originalRpc; }
});
