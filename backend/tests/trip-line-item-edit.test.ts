import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsEventRows } from "../src/services/operations-report.logic.js";

const tripId = "223e4567-e89b-42d3-a456-426614174000";
const otherTripId = "623e4567-e89b-42d3-a456-426614174000";
const stopId = "323e4567-e89b-42d3-a456-426614174000";
const otherStopId = "423e4567-e89b-42d3-a456-426614174000";
const thirdStopId = "823e4567-e89b-42d3-a456-426614174000";
const lineId = "523e4567-e89b-42d3-a456-426614174000";
const otherLineId = "723e4567-e89b-42d3-a456-426614174000";
const thirdLineId = "923e4567-e89b-42d3-a456-426614174000";

test("line-item editors validate numeric quantity and preserve decimal strings for PostgreSQL numeric", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { buildTripLineItemPayload } = await import("../src/services/trip.service.js");
  assert.deepEqual(buildTripLineItemPayload({ quantity: "4", cbm: "0.123456" }), { quantity: "4", cbm: "0.123456" });
  assert.deepEqual(buildTripLineItemPayload({ quantity: "4.5", unit_cbm: "0.123456789123456789" }), { quantity: "4.5", unit_cbm: "0.123456789123456789" });
  assert.throws(() => buildTripLineItemPayload({ quantity: "-1" }), /non-negative/);
  assert.throws(() => buildTripLineItemPayload({ cbm: "not a number" }), /non-negative decimal/);
});

test("scoped update rejects another stop, successful saves recalculate totals, and failed saves preserve values", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/trip.service.js");
  const tables: Record<string, Record<string, unknown>[]> = {
    trips: [{ id: tripId }, { id: otherTripId }],
    trip_stops: [
      { id: stopId, trip_id: tripId },
      { id: otherStopId, trip_id: tripId },
      { id: thirdStopId, trip_id: tripId },
    ],
    trip_line_items: [
      { id: lineId, trip_id: tripId, trip_stop_id: stopId, dr_number: "DR-1", quantity: 2, cbm: 0.2 },
      { id: otherLineId, trip_id: tripId, trip_stop_id: otherStopId, dr_number: "DR-2", quantity: 3, cbm: 0.3 },
      { id: thirdLineId, trip_id: tripId, trip_stop_id: thirdStopId, dr_number: "DR-3", quantity: 5, cbm: 0.5 },
    ],
  };
  const originalFrom = supabaseAdmin.from;
  let failNextWrite = false;
  let writeCount = 0;
  (supabaseAdmin as any).from = (table: string) => {
    let operation = "select";
    let payload: Record<string, unknown> = {};
    const filters: Array<[string, unknown, "eq" | "is"]> = [];
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value, "eq"]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value, "is"]); return chain; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return chain; },
      maybeSingle: async () => execute(),
      single: async () => execute(),
    };
    const execute = () => {
      const rows = tables[table] ?? [];
      const matching = rows.filter((row) => filters.every(([key, value, kind]) => kind === "is" ? row[key] === value : row[key] === value));
      if (operation === "update") {
        writeCount += 1;
        if (failNextWrite) { failNextWrite = false; return { data: null, error: { message: "simulated database write failure" } }; }
        if (!matching[0]) return { data: null, error: null };
        Object.assign(matching[0], payload);
        return { data: matching[0], error: null };
      }
      return { data: matching[0] ?? null, error: null };
    };
    return chain;
  };
  try {
    await assert.rejects(service.updateTripLineItemRecord(tripId, otherStopId, lineId, { quantity: 7 }), /does not belong to this stop/);
    assert.equal(writeCount, 0, "wrong-stop record is rejected before update");
    await service.updateTripLineItemRecord(tripId, stopId, lineId, { quantity: 7, cbm: 0.123456 });
    assert.equal(tables.trip_line_items[1].quantity, 3, "another stop's source row is unchanged");
    await service.updateTripLineItemRecord(tripId, otherStopId, otherLineId, { quantity: 9 });
    assert.equal(tables.trip_line_items[0].quantity, 7, "editing stop two leaves stop one's item unchanged");
    assert.equal(tables.trip_line_items[2].quantity, 5, "editing stop two leaves stop three's item unchanged");
    const projected = buildOperationsEventRows({
      trips: [{ id: tripId, trip_number: 1, dispatch_number: "D-1", status: "IN_PROGRESS" }],
      stops: [
        { id: stopId, trip_id: tripId, stop_sequence: 1, arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
        { id: otherStopId, trip_id: tripId, stop_sequence: 2, arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
        { id: thirdStopId, trip_id: tripId, stop_sequence: 3, arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
      ],
      lineItems: tables.trip_line_items as any, loading: [], unloading: [
        { id: "unload-one", trip_id: tripId, trip_stop_id: stopId },
        { id: "unload-two", trip_id: tripId, trip_stop_id: otherStopId },
        { id: "unload-three", trip_id: tripId, trip_stop_id: thirdStopId },
      ], backloads: [], offloads: [], routes: new Map(), vehicles: new Map(),
    });
    const stopOne = projected.find((row) => row.trip_stop_id === stopId)!;
    const stopTwo = projected.find((row) => row.trip_stop_id === otherStopId)!;
    const stopThree = projected.find((row) => row.trip_stop_id === thirdStopId)!;
    assert.equal(stopOne.quantity, 7);
    assert.equal(stopOne.total_cbm, 0.123456);
    assert.equal(stopTwo.quantity, 9);
    assert.equal(stopTwo.total_cbm, 0.3);
    assert.equal(stopThree.quantity, 5);
    assert.equal(stopThree.total_cbm, 0.5);

    failNextWrite = true;
    await assert.rejects(service.updateTripLineItemRecord(tripId, stopId, lineId, { quantity: 8 }), /Unable to update trip line item/);
    assert.equal(tables.trip_line_items[0].quantity, 7, "a failed write leaves the previous value intact");
    assert.equal(tables.trip_line_items[1].quantity, 9, "a failed stop-one save leaves stop two unchanged");
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
});

test("unscoped line-item updates retain a null stop association", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/trip.service.js");
  const rows = [{ id: lineId, trip_id: tripId, trip_stop_id: null, quantity: 1, cbm: 0.4 }];
  const originalFrom = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    let operation = "select";
    let payload: Record<string, unknown> = {};
    const filters: Array<[string, unknown, "eq" | "is"]> = [];
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value, "eq"]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value, "is"]); return chain; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return chain; },
      maybeSingle: async () => execute(),
      single: async () => execute(),
    };
    const execute = () => {
      const matching = (table === "trips" ? [{ id: tripId }] : rows).filter((row) => filters.every(([key, value]) => row[key] === value));
      if (operation === "update" && matching[0]) Object.assign(matching[0], payload);
      return { data: matching[0] ?? null, error: null };
    };
    return chain;
  };
  try {
    await service.updateTripUnscopedLineItemRecord(tripId, lineId, { quantity: 5 });
    assert.equal(rows[0].quantity, 5);
    assert.equal(rows[0].trip_stop_id, null);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
});

test("dispatch and transaction updates are isolated to the selected stop across three stops", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/trip.service.js");
  const stops = [
    { id: stopId, trip_id: tripId, dispatch_number: "DISPATCH-1", transaction_number: "TX-1", customer_id: null, store_id: null },
    { id: otherStopId, trip_id: tripId, dispatch_number: "DISPATCH-2", transaction_number: "TX-2", customer_id: null, store_id: null },
    { id: thirdStopId, trip_id: tripId, dispatch_number: "DISPATCH-3", transaction_number: "TX-3", customer_id: null, store_id: null },
  ];
  const originalFrom = supabaseAdmin.from;
  const writes: Array<{ table: string; filters: Array<[string, unknown]>; payload: Record<string, unknown> }> = [];
  (supabaseAdmin as any).from = (table: string) => {
    let operation = "select";
    let payload: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return chain; },
      maybeSingle: async () => execute(),
      single: async () => execute(),
    };
    const execute = () => {
      const rows = table === "trips" ? [{ id: tripId }, { id: otherTripId }] : table === "trip_stops" ? stops : [];
      const matching = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      if (operation === "update") {
        writes.push({ table, filters: [...filters], payload: { ...payload } });
        if (matching[0]) Object.assign(matching[0], payload);
      }
      return { data: matching[0] ?? null, error: null };
    };
    return chain;
  };
  try {
    await service.updateTripStopRecord(tripId, otherStopId, { dispatch_number: "DISPATCH-2-EDITED" });
    assert.deepEqual(stops.map((stop) => stop.dispatch_number), ["DISPATCH-1", "DISPATCH-2-EDITED", "DISPATCH-3"]);
    await service.updateTripStopRecord(tripId, stopId, { transaction_number: "TX-1-EDITED" });
    assert.deepEqual(stops.map((stop) => stop.transaction_number), ["TX-1-EDITED", "TX-2", "TX-3"]);
    assert.deepEqual(writes[1], {
      table: "trip_stops", filters: [["id", stopId], ["trip_id", tripId]], payload: { transaction_number: "TX-1-EDITED" },
    });
    await assert.rejects(service.updateTripStopRecord(otherTripId, stopId, { transaction_number: "WRONG-TRIP" }), /does not belong to this trip/);
    assert.equal(writes.length, 2, "wrong-parent transaction request performs no write");
    await service.updateTripStopRecord(tripId, thirdStopId, { transaction_number: null });
    assert.deepEqual(stops.map((stop) => stop.transaction_number), ["TX-1-EDITED", "TX-2", null]);
    assert.deepEqual(writes[0], {
      table: "trip_stops",
      filters: [["id", otherStopId], ["trip_id", tripId]],
      payload: { dispatch_number: "DISPATCH-2-EDITED" },
    }, "write targets both the intended stop primary key and its owning trip");

    await assert.rejects(service.updateTripStopRecord(otherTripId, otherStopId, { dispatch_number: "WRONG-TRIP" }), /does not belong to this trip/);
    assert.equal(writes.length, 3, "wrong-trip request is rejected before any write");
    assert.deepEqual(stops.map((stop) => stop.dispatch_number), ["DISPATCH-1", "DISPATCH-2-EDITED", "DISPATCH-3"]);
    await service.updateTripStopRecord(tripId, otherStopId, { dr_number: "DR-ONLY-2", quantity: 0, total_cbm: 1.234567 });
    assert.deepEqual(writes.at(-1), { table: "trip_stops", filters: [["id", otherStopId], ["trip_id", tripId]], payload: { dr_number: "DR-ONLY-2", quantity: 0, total_cbm: 1.234567 } });
    await service.updateTripStopRecord(tripId, otherStopId, { quantity: 12.125 });
    assert.deepEqual(writes.at(-1)?.payload, { quantity: 12.125 }, "quantity edits do not send CBM or product quantities");
    await service.updateTripStopRecord(tripId, otherStopId, { total_cbm: null });
    assert.deepEqual(writes.at(-1)?.payload, { total_cbm: null }, "CBM edits do not send quantity");
    const beforeInvalid = writes.length;
    await assert.rejects(service.updateTripStopRecord(tripId, otherStopId, { quantity: -1 }), /non-negative/);
    assert.equal(writes.length, beforeInvalid);
    assert.ok(writes.every((write) => write.table === "trip_stops"), "transaction edits never update product line items or the trip");
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
});
