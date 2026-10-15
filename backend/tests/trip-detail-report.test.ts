import assert from "node:assert/strict";
import test from "node:test";

test("trip detail enrichment includes stop dispatches and excludes other trips across pages", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getReportData } = await import("../src/services/report.service.js");
  const tripId = "223e4567-e89b-42d3-a456-426614174000";
  const trips = [{ id: tripId, dispatch_number: "CANONICAL-DISPATCH" }];
  const rows = [
    { _trip_id: tripId, dispatch_number: "STOP-A", product_name: "Refrigerator" },
    { _trip_id: tripId, dispatch_number: "STOP-B", product_name: "Washer" },
    { _trip_id: "323e4567-e89b-42d3-a456-426614174000", dispatch_number: "OTHER", product_name: "Unrelated" },
  ];
  const originalFrom = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let includedIds: unknown[] = [];
    let start = 0;
    let end = 499;
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      in: (_key: string, values: unknown[]) => { includedIds = values; return chain; },
      is: () => chain,
      order: () => chain,
      range: (from: number, to: number) => { start = from; end = to; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const matches = table === "v_trip_booking"
          ? rows.filter((row) => filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value))
          : table === "trips"
            ? trips.filter((trip) => includedIds.includes(trip.id))
          : [];
        return Promise.resolve({ data: matches.slice(start, end + 1).map((row) => ({ ...row })), count: matches.length, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  try {
    const first = await getReportData("trip-booking", { trip_id: tripId, limit: 1 });
    const second = await getReportData("trip-booking", { trip_id: tripId, limit: 1, page: 2 });
    assert.equal(first.pagination.total, 2);
    assert.equal(first.pagination.totalPages, 2);
    assert.equal(first.rows[0].product_name, "Refrigerator");
    assert.equal(second.rows[0].product_name, "Washer");
    assert.ok([...first.rows, ...second.rows].every((row) => row.dispatch_number === "CANONICAL-DISPATCH"));
    assert.ok([...first.rows, ...second.rows].every((row) => row.trip_id === tripId));
    await assert.rejects(getReportData("trip-booking", { trip_id: "invalid" }), /Invalid trip id/);
    await assert.rejects(getReportData("trip-booking", { trip_id: [tripId] }), /Invalid query parameter/);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});
