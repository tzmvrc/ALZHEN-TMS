import assert from "node:assert/strict";
import test from "node:test";

test("Master List expands by physical product while monitoring stays at stop granularity", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-source-report-test";
  process.env.SUPABASE_ANON_KEY = "isolated-source-report-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getReportData, getReportColumns } = await import("../src/services/report.service.js");
  const trip = "123e4567-e89b-42d3-a456-426614174000", stop = "223e4567-e89b-42d3-a456-426614174000";
  const lines = [3, 4, 5].map(value => ({ id: `${value}23e4567-e89b-42d3-a456-426614174000`, quantity: "2.00", cbm: "0.246913578246", unit_cbm: "0.123456789123", stock_quantity: null }));
  const source = lines.map((line, index) => ({ trip_id: trip, _trip_id: trip, _trip_stop_id: stop, _trip_line_item_id: line.id, customer_model: `MODEL-${index}`, dr_number: "SHARED-DR" }));
  const originalFrom = supabaseAdmin.from,originalRpc=supabaseAdmin.rpc;
  (supabaseAdmin as any).rpc=async(name:string)=>{assert.equal(name,"read_confirmed_operational_state_batch_v1");return {data:[],error:null};};
  (supabaseAdmin as any).from = (table: string) => {
    let limit = 500;
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, range: () => chain,
      limit: (value: number) => { limit = value; return chain; },
      then: (resolve: (value: unknown) => unknown) => {
        const data = limit === 0 ? [] : ["v_trip_source_master","v_trip_master_csv"].includes(table) ? source : table === "v_dispatch_monitoring" ? [{ trip_id: trip, _trip_stop_id: stop }]
          : table === "trips" ? [{ id: trip, dispatch_number: "DISPATCH261021-1", trip_reference: "TRIP261021-1" }]
          : table === "trip_line_items" ? lines : [];
        return Promise.resolve({ data: data.map(row => ({ ...row })), count: data.length, error: null }).then(resolve);
      },
    }; return chain;
  };
  try {
    const master = await getReportData("dispatch-monitoring", { source_lines: "true" });
    assert.equal(master.rows.length, 3); assert.equal(master.pagination.total, 3);
    assert.equal(new Set(master.rows.map(row => row.trip_line_item_id)).size, 3);
    assert.ok(master.rows.every(row => row.unit_cbm === "0.123456789123" && row.cbm === "0.246913578246"));
    const monitor = await getReportData("dispatch-monitoring"); assert.equal(monitor.rows.length, 1);
    const columns = (await getReportColumns("dispatch-monitoring", true)).columns;
    const {MASTER_LIST_COLUMNS}=await import("../src/config/master-list-columns.js");
    assert.deepEqual(columns.map(column=>column.key),MASTER_LIST_COLUMNS.map(column=>column.key));
    assert.ok(columns.some(column=>column.key==="quantity"));assert.ok(columns.some(column=>column.key==="cbm"));
  } finally { supabaseAdmin.from = originalFrom;supabaseAdmin.rpc=originalRpc; }
});
