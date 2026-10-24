import assert from "node:assert/strict";
import test from "node:test";

for(const report of ["trip-booking","dispatch"]){
test(`${report}: scoped detail reads use physical parent IDs and isolate stops across pages`, async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getReportData, getReportColumns } = await import("../src/services/report.service.js");
  const { getReportEditDefinition } = await import("../../frontend/src/services/report-editing.config.js");
  const tripId = "223e4567-e89b-42d3-a456-426614174000";
  const trips = [{ id: tripId, dispatch_number: "CANONICAL-DISPATCH", trip_number: 1, trip_reference: "TRIP261020-7" }];
  const rows = [
    { _trip_id: tripId, _trip_stop_id: "stop-a", dispatch_number: "STOP-A", product_name: "Refrigerator" },
    { _trip_id: tripId, _trip_stop_id: "stop-b", dispatch_number: "STOP-B", product_name: "Washer" },
    { _trip_id: tripId, dispatch_number: null, product_name: "Trip-only record" },
    { _trip_id: "323e4567-e89b-42d3-a456-426614174000", dispatch_number: "OTHER", product_name: "Unrelated" },
  ];
  const originalFrom = supabaseAdmin.from;
  let viewSearch = "";
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let includedIds: unknown[] = [];
    let start = 0;
    let end = 499;
    let search = "";
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      in: (_key: string, values: unknown[]) => { includedIds = values; return chain; },
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      ilike: (_key:string,value:string) => {viewSearch=value;return chain;},
      or: (value: string) => { search = value; if (table === "v_trip_booking" || table === "v_dispatch_report") viewSearch = value; return chain; },
      range: (from: number, to: number) => { start = from; end = to; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const matches = table === (report==="dispatch"?"v_dispatch_report":"v_trip_booking")
          ? rows.filter((row) => filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value))
          : table === "trips"
            ? trips.filter((trip) => includedIds.includes(trip.id) || search.includes(trip.trip_reference))
          : [];
        return Promise.resolve({ data: matches.slice(start, end + 1).map((row) => ({ ...row })), count: matches.length, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  try {
    const first = await getReportData(report, { trip_id: tripId, limit: 1 });
    const second = await getReportData(report, { trip_id: tripId, limit: 1, page: 2 });
    const third = await getReportData(report, { trip_id: tripId, limit: 1, page: 3 });
    assert.equal(first.pagination.total, 3);
    assert.equal(first.pagination.totalPages, 3);
    assert.equal(first.rows[0].product_name, "Refrigerator");
    assert.equal(second.rows[0].product_name, "Washer");
    assert.equal(first.rows[0].dispatch_number, "STOP-A");
    assert.equal(second.rows[0].dispatch_number, "STOP-B");
    assert.equal(third.rows[0].dispatch_number, "CANONICAL-DISPATCH", "trip-only records retain their authoritative parent identifier");
    assert.ok([...first.rows, ...second.rows, ...third.rows].every(row => row.trip_number === "TRIP261020-7"));
    assert.equal(trips[0].trip_number, 1, "display enrichment must not change the stored numeric position");
    const found = await getReportData(report, { trip_id: tripId, search: "TRIP261020-7" });
    assert.equal(found.rows[0].trip_number, "TRIP261020-7");
    assert.ok(viewSearch.includes("TRIP261020-7"), "generated trip searches must be filtered by the server projection");
    for (const report of ["combined", "dispatch-monitoring", "dispatch", "trip-booking"] as const) {
      const metadata = await getReportColumns(report);
      assert.equal(metadata.columns.find(column => column.key === "trip_number")?.type, "text");
      assert.equal(getReportEditDefinition(report, "trip_number", { trip_id: tripId }), null, "generated references cannot edit the stored numeric position");
    }
    assert.ok([...first.rows, ...second.rows].every((row) => row.trip_id === tripId));
    await assert.rejects(getReportData(report, { trip_id: "invalid" }), /Invalid trip id/);
    await assert.rejects(getReportData(report, { trip_id: [tripId] }), /Invalid query parameter/);
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});

}
