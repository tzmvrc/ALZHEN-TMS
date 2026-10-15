import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

test("overview choices include all nonarchived transactions, including completed trips, without hiding reports", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getOperationsOverview } = await import("../src/services/operations-report.service.js");
  const tables: Record<string, Record<string, any>[]> = {
    trips: [
      { id: "partial", status: "IN_PROGRESS", dispatch_number: "OLD" },
      { id: "complete", status: "IN_PROGRESS", dispatch_number: "HISTORIC" },
      { id: "no-stops", status: "PLANNED", dispatch_number: "SOLO" },
      { id: "archived", status: "PLANNED", archived_at: "2026-10-15T00:00:00Z" },
    ],
    trip_stops: [
      { id: "s1", trip_id: "partial", stop_sequence: 1, dispatch_number: "SAVED-1", delivery_status: "COMPLETED" },
      { id: "s2", trip_id: "partial", stop_sequence: 2, dispatch_number: "SAVED-2", delivery_status: "PENDING" },
      { id: "s3", trip_id: "partial", stop_sequence: 3, dispatch_number: null, delivery_status: "PENDING" },
      { id: "s4", trip_id: "complete", delivery_status: "PENDING", departure_time: "2026-10-15T00:00:00Z" },
      { id: "s5", trip_id: "partial", archived_at: "2026-10-15T00:00:00Z", dispatch_number: "ARCHIVED" },
    ],
    offloads: [{ id: "historic-offload", trip_id: "complete", trip_stop_id: "s4", event_type: "Offload" }],
  };
  const original = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const chain: any = {
      select: () => chain,
      order: () => chain,
      in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return chain; },
      is: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return chain; },
      not: (column: string, _: string, values: string) => { rows = rows.filter((row) => row[column] != null && !values.slice(1, -1).split(",").includes(row[column])); return chain; },
      range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return chain;
  };
  try {
    const overview = await getOperationsOverview({ role: "ADMIN", profileId: "admin" });
    assert.deepEqual(new Set(overview.trip_options.map((trip) => trip.id)), new Set(["partial", "complete", "no-stops"]));
    assert.deepEqual(overview.trip_options.find((trip) => trip.id === "partial")?.stops.map((stop) => [stop.id, stop.dispatch_number]), [["s1", "SAVED-1"], ["s2", "SAVED-2"], ["s3", null]]);
    assert.equal(overview.trip_options.find((trip) => trip.id === "no-stops")?.stops.length, 0);
    assert.ok(overview.offloads.some((row) => row.id === "historic-offload"));
    assert.ok(overview.event_rows.some((row) => row.source_type === "OFFLOAD" && row.source_record_id === "historic-offload"));
    await assert.rejects(getOperationsOverview({ role: "TRUCKER", profileId: "driver" }), /Access denied/);
  } finally { (supabaseAdmin as any).from = original; }
});
