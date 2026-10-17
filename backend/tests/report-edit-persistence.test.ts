import assert from "node:assert/strict";
import test from "node:test";

test("confirmed physical stop edits survive delayed report refresh without parent or sibling replacement", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { updateTripStopRecord } = await import("../src/services/trip.service.js");
  const { getReportData } = await import("../src/services/report.service.js");
  const tripId = "223e4567-e89b-42d3-a456-426614174000";
  const stops = ["3", "4", "5"].map((prefix, index) => ({
    id: `${prefix}23e4567-e89b-42d3-a456-426614174000`, trip_id: tripId,
    stop_sequence: index + 1, dispatch_number: `DSP-${index + 1}`,
    transaction_number: `TX-${index + 1}`, quantity: index + 1, total_cbm: null,
    customer_id: null, store_id: null, remarks: null, delivery_status: "Planned",
  }));
  const loading = { id: "623e4567-e89b-42d3-a456-426614174000", trip_id: tripId, loading_start_at: "2026-10-16T15:50:23.250Z", loading_finished_at: "2026-10-16T16:35:10.000Z" };
  const trip = { id: tripId, dispatch_number: "PARENT-LEGACY", transaction_number: "PARENT-TX" };
  const writes: Array<{table: string; filters: Array<[string, unknown]>; payload: Record<string, unknown>}> = [];
  let failWrite = false;
  let parentReferenceReads = 0;
  const originalFrom = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let included: {key: string; values: unknown[]} | undefined;
    let payload: Record<string, unknown> | undefined;
    let start = 0, end = 499;
    const execute = (single = false) => {
      if (payload) {
        writes.push({table, filters: [...filters], payload});
        if (failWrite) return {data: null, error: {message: "isolated failed write"}};
        const matches = stops.filter(stop => filters.every(([key,value]) => (stop as any)[key] === value));
        assert.equal(table, "trip_stops", "writes must never target a view");
        assert.equal(matches.length, 1);
        Object.assign(matches[0], payload);
        return {data: {...matches[0]}, error: null};
      }
      const viewRows = () => stops.map(stop => ({
        _trip_id: tripId, _trip_stop_id: stop.id, trip_id: tripId,
        dispatch_number: stop.dispatch_number, transaction_number: stop.transaction_number,
        transaction_quantity: stop.quantity, transaction_total_cbm: stop.total_cbm,
        stop_remarks: stop.remarks, delivery_status: stop.delivery_status,
      }));
      const candidates: Array<Record<string, unknown>> = table.startsWith("v_") || table.startsWith("vw_")
        ? viewRows() : table === "trips" ? [trip] : table === "trip_stops" ? stops : table === "loading_reports" ? [loading]
        : table === "tms_dropdown_options" ? [{field_key:"delivery_status",option_value:"Completed",active:true}] : [];
      const matches = candidates.filter(row => filters.every(([key,value]) => row[key] === value)
        && (!included || included.values.includes(row[included.key])));
      return {data: single ? matches[0] ?? null : matches.slice(start,end+1).map(row=>({...row})), count: matches.length, error: null};
    };
    const chain: any = {
      select: (fields: string) => {if(table==="trips" && fields==="id, dispatch_number, transaction_number")parentReferenceReads++;return chain;}, order: () => chain,
      eq: (key: string,value: unknown) => {filters.push([key,value]);return chain;},
      is: (key: string,value: unknown) => {filters.push([key,value]);return chain;},
      in: (key: string,values: unknown[]) => {included={key,values};return chain;},
      range: (from: number,to: number) => {start=from;end=to;return chain;},
      update: (value: Record<string, unknown>) => {payload=value;return chain;},
      maybeSingle: async () => execute(true), single: async () => execute(true),
      then: (resolve: any,reject: any) => Promise.resolve(execute()).then(resolve,reject),
    };
    return chain;
  };
  try {
    const selected = stops[1];
    const saved = await updateTripStopRecord(tripId,selected.id,{dispatch_number:"DSP-SAVED",transaction_number:"TX-SAVED",quantity:0,remarks:"Confirmed"});
    assert.equal(saved.dispatch_number,"DSP-SAVED");
    assert.deepEqual(writes[0].filters,[["id",selected.id],["trip_id",tripId]]);
    assert.equal(selected.total_cbm,null,"untouched nullable CBM remains null");
    await updateTripStopRecord(tripId,selected.id,{delivery_status:"Completed"});
    const check = async () => {
      for (const report of ["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"]) {
        const result = await getReportData(report);
        assert.deepEqual(result.rows.map(row=>row.dispatch_number),["DSP-1","DSP-SAVED","DSP-3"],report);
        assert.deepEqual(result.rows.map(row=>row.transaction_number),["TX-1","TX-SAVED","TX-3"],report);
        assert.equal(result.rows[1].transaction_quantity,0);
        assert.equal(result.rows[1].transaction_total_cbm,null);
        assert.equal(result.rows[1].delivery_status,"Completed");
        if (["combined", "dispatch", "dispatch-monitoring"].includes(report)) {
          assert.equal(result.rows[1].loading_report_id, loading.id);
          assert.equal(result.rows[1].loading_start_at, loading.loading_start_at);
          assert.equal(result.rows[1].loading_finished_at, loading.loading_finished_at);
        }
      }
    };
    await check();
    await new Promise(resolve=>setTimeout(resolve,5100));
    await check(); // Fresh service reads after the reported reversion interval.
    assert.equal(parentReferenceReads,0,"stop-only report pages need no parent-identifier enrichment query");
    await updateTripStopRecord(tripId,selected.id,{dispatch_number:null,transaction_number:null});
    const blank = await getReportData("combined");
    assert.equal(blank.rows[1].dispatch_number,null,"blank stop dispatch must not inherit parent");
    assert.equal(blank.rows[1].transaction_number,null);
    failWrite=true;
    await assert.rejects(updateTripStopRecord(tripId,selected.id,{remarks:"Must not save"}),/Unable to update/);
    assert.equal(selected.remarks,"Confirmed");
    assert.equal(trip.dispatch_number,"PARENT-LEGACY");
    assert.deepEqual(stops.filter(stop=>stop.id!==selected.id).map(stop=>stop.dispatch_number),["DSP-1","DSP-3"]);
  } finally {supabaseAdmin.from=originalFrom;}
});

test("billing edits return the confirmed value and parent rather than an ID-only success", async () => {
  process.env.SUPABASE_URL="http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
  process.env.SUPABASE_ANON_KEY="isolated-test";
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const {updateTripBillingRecord}=await import("../src/services/trip.service.js");
  const tripId="223e4567-e89b-42d3-a456-426614174000",billingId="323e4567-e89b-42d3-a456-426614174000";
  const row:Record<string,unknown>={id:billingId,trip_id:tripId,invoice_number:"OLD"};
  const original=supabaseAdmin.from;let writes=0;
  (supabaseAdmin as any).from=(table:string)=>{
    assert.equal(table,"billings");let fields="",payload:Record<string,unknown>|undefined;
    const filters:Array<[string,unknown]>=[];
    const execute=()=>{
      assert.ok(filters.every(([key,value])=>row[key]===value));
      if(payload){writes++;assert.deepEqual(filters,[["id",billingId],["trip_id",tripId]]);Object.assign(row,payload);}
      return {data:Object.fromEntries(fields.split(",").map(key=>[key.trim(),row[key.trim()]])),error:null};
    };
    const chain:any={select:(value:string)=>{fields=value;return chain;},eq:(key:string,value:unknown)=>{filters.push([key,value]);return chain;},update:(value:Record<string,unknown>)=>{payload=value;return chain;},maybeSingle:async()=>execute(),single:async()=>execute()};
    return chain;
  };
  try {
    assert.deepEqual(await updateTripBillingRecord(tripId,billingId,{invoice_number:"SAVED"}),{id:billingId,trip_id:tripId,invoice_number:"SAVED"});
    assert.deepEqual(await updateTripBillingRecord(tripId,billingId,{invoice_number:null}),{id:billingId,trip_id:tripId,invoice_number:null});
    await assert.rejects(updateTripBillingRecord("423e4567-e89b-42d3-a456-426614174000",billingId,{invoice_number:"WRONG"}),/does not belong/);
    assert.equal(writes,2);
  }finally{supabaseAdmin.from=original;}
});
