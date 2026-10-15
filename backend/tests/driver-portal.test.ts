import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

test("driver portal hides archives and saves details only to the assigned active stop", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getDriverAssignedTrips, updateDriverTripStatus, saveDriverTripReceipt } = await import("../src/services/trucker.service.js");
  const { getAssignedOperations } = await import("../src/services/operations-report.service.js");
  const tables: Record<string, Record<string, any>[]> = {
    drivers: [{ id: "driver", profile_id: "profile" }],
    trips: [
      { id: "active", status: "IN_PROGRESS", departure_from_warehouse_at: null, archived_at: null, warehouse_id: "warehouse" },
      { id: "archived", status: "PLANNED", archived_at: "2026-10-16" },
      { id: "all-stops-archived", status: "PLANNED", archived_at: null },
      { id: "unassigned", status: "PLANNED", archived_at: null },
    ],
    trip_truck_assignments: ["active", "archived", "all-stops-archived"].map((trip_id) => ({ trip_id, driver_id: "driver", unassigned_at: null })),
    trip_stops: [
      { id: "stop", trip_id: "active", store_id: "store", stop_sequence: 1, delivery_status: "PENDING", archived_at: null },
      { id: "hidden-stop", trip_id: "active", stop_sequence: 2, delivery_status: "PENDING", archived_at: "2026-10-16" },
      { id: "hidden-only", trip_id: "all-stops-archived", archived_at: "2026-10-16" },
    ],
    trip_line_items: [
      { id: "item", trip_id: "active", trip_stop_id: "stop", quantity: 2 },
      { id: "hidden-item", trip_id: "active", trip_stop_id: "hidden-stop", quantity: 3 },
    ],
    customer_stores: [{ id: "store", name: "Delivery store" }],
    warehouses: [{ id: "warehouse", name: "Origin warehouse" }],
    driver_trip_updates: [],
    trip_events: [],
    unloading_reports: [
      { id: "visible-report", trip_id: "active", trip_stop_id: "stop" },
      { id: "archived-stop-report", trip_id: "active", trip_stop_id: "hidden-stop" },
    ],
  };
  const originalFrom = supabaseAdmin.from;
  const writes: string[] = [];
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let payload: Record<string, unknown> | null = null;
    let insert: Record<string, unknown> | null = null;
    let single = false;
    const execute = () => {
      let rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      if (payload) { writes.push(table); rows.forEach((row) => Object.assign(row, payload)); }
      if (insert) { writes.push(table); tables[table].push(insert); rows = [insert]; }
      const results = rows.map((row) => table === "trips"
        ? { ...row, trip_stops: tables.trip_stops.filter((stop) => stop.trip_id === row.id) }
        : { ...row });
      return { data: single ? results[0] ?? null : results, error: null };
    };
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return chain; },
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return chain; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return chain; },
      order: () => chain,
      range: () => chain,
      update: (value: Record<string, unknown>) => { payload = value; return chain; },
      insert: (value: Record<string, unknown>) => { insert = value; return chain; },
      maybeSingle: () => { single = true; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
    };
    return chain;
  };
  try {
    const trips = await getDriverAssignedTrips("profile");
    assert.deepEqual(trips.map((trip) => trip.id), ["active"]);
    assert.deepEqual(trips[0].stops.map((stop) => stop.id), ["stop"]);
    assert.equal(trips[0].destination, "Delivery store");
    assert.deepEqual(trips[0].stops[0].items.map((item) => item.id), ["item"]);
    const reports = await getAssignedOperations({ role: "TRUCKER", profileId: "profile" });
    assert.deepEqual(reports.trips.map((trip) => trip.id), ["active"]);
    assert.deepEqual(reports.stops.map((stop) => stop.id), ["stop"]);
    assert.deepEqual(reports.unloading.map((report) => report.id), ["visible-report"]);

    await updateDriverTripStatus("profile", { trip_id: "active", trip_stop_id: "stop", dr_number: " DR-123 ", notes: " Delivery note " });
    assert.equal(tables.trip_stops[0].dr_number, "DR-123");
    assert.equal(tables.trip_stops[0].remarks, "Delivery note");
    assert.equal(tables.trip_line_items[0].dr_number, "DR-123");
    assert.equal(tables.trip_line_items[1].dr_number, undefined);
    assert.equal(tables.trip_stops[0].delivery_status, "PENDING");
    assert.equal(tables.trips[0].status, "IN_PROGRESS");
    assert.ok(!writes.includes("trips"), "saving details must not change progress");

    const started = await updateDriverTripStatus("profile", {
      trip_id: "active",
      trip_stop_id: "stop",
      step: 1,
      latitude: 14.5995,
      longitude: 120.9842,
    });
    assert.equal(started.trip_status, "IN_PROGRESS");
    assert.ok(tables.trips[0].departure_from_warehouse_at, "starting a trip must persist the departure time");
    assert.deepEqual(
      { event_type: tables.trip_events[0].event_type, latitude: tables.trip_events[0].latitude, longitude: tables.trip_events[0].longitude },
      { event_type: "WAREHOUSE_DEPARTURE", latitude: 14.5995, longitude: 120.9842 },
    );
    await updateDriverTripStatus("profile", {
      trip_id: "active",
      trip_stop_id: "stop",
      step: 2,
      latitude: 14.6042,
      longitude: 120.9822,
    });
    assert.deepEqual(
      { event_type: tables.trip_events[1].event_type, trip_stop_id: tables.trip_events[1].trip_stop_id },
      { event_type: "GPS_UPDATE", trip_stop_id: "stop" },
    );
    await assert.rejects(
      updateDriverTripStatus("profile", { trip_id: "active", trip_stop_id: "stop", step: 1 }),
      /location access|coordinates/i,
    );

    const beforeRejected = writes.length;
    await assert.rejects(updateDriverTripStatus("profile", { trip_id: "active", dr_number: "DR" }), /Choose the delivery stop/);
    await assert.rejects(updateDriverTripStatus("profile", { trip_id: "archived", trip_stop_id: "stop", step: 2 }), /archived/);
    await assert.rejects(updateDriverTripStatus("profile", { trip_id: "active", trip_stop_id: "hidden-stop", step: 2 }), /archived/);
    await assert.rejects(updateDriverTripStatus("profile", { trip_id: "unassigned", trip_stop_id: "stop", step: 2 }), /not currently assigned/);
    await assert.rejects(saveDriverTripReceipt("profile", "active", "hidden-stop", Buffer.from("unused"), "image/png", "receipt.png", "DR-123"), /archived/);
    assert.equal(writes.length, beforeRejected, "rejected updates must not write anything");

    const result = await updateDriverTripStatus("profile", { trip_id: "active", trip_stop_id: "stop", step: 4 });
    assert.equal(result.trip_status, "COMPLETED", "archived stops must not block trip completion");
    assert.equal(tables.trip_stops[1].delivery_status, "PENDING");
  } finally {
    supabaseAdmin.from = originalFrom;
  }
});
