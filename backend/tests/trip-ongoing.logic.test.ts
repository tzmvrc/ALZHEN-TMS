import assert from "node:assert/strict";
import test from "node:test";
import { groupStopsByTrip, isTripOngoing, isStopComplete } from "../src/services/trip-ongoing.logic.js";

test("a partially completed multi-stop trip remains ongoing", () => {
  const stops = [
    { trip_id: "trip-1", delivery_status: "COMPLETED", departure_time: null },
    { trip_id: "trip-1", delivery_status: "IN PROGRESS", departure_time: null },
  ];
  assert.equal(isTripOngoing({ id: "trip-1", status: "COMPLETED" }, stops), true);
});

test("trip is complete only when every required stop meets the existing stop rule", () => {
  const stops = [
    { trip_id: "trip-2", delivery_status: "Delivered", departure_time: null },
    { trip_id: "trip-2", delivery_status: null, departure_time: "2026-10-13T12:00:00Z" },
  ];
  assert.ok(stops.every(isStopComplete));
  assert.equal(isTripOngoing({ id: "trip-2", status: "IN_PROGRESS" }, stops), false);
});

test("pending stops with missing statuses keep a trip ongoing, while cancelled trips are excluded", () => {
  const missingStatus = [{ trip_id: "trip-3", delivery_status: null, departure_time: null }];
  assert.equal(isTripOngoing({ id: "trip-3", status: null }, missingStatus), true);
  assert.equal(isTripOngoing({ id: "trip-3", status: "CANCELLED" }, missingStatus), false);
});

test("trips with no stops use trip status as the completion fallback", () => {
  assert.equal(isTripOngoing({ id: "trip-4", status: "PLANNED" }, []), true);
  assert.equal(isTripOngoing({ id: "trip-5", status: "COMPLETED" }, []), false);
  assert.equal(isTripOngoing({ id: "trip-6", status: null }, []), true);
});

test("all stored stops are included because no optional-stop marker exists", () => {
  const groups = groupStopsByTrip([
    { trip_id: "trip-7", delivery_status: "COMPLETED", departure_time: null },
    { trip_id: "trip-7", delivery_status: "PENDING", departure_time: null },
  ]);
  assert.equal(groups.get("trip-7")?.length, 2);
  assert.equal(isTripOngoing({ id: "trip-7", status: "COMPLETED" }, groups.get("trip-7")!), true);
});

test("server selector returns only trips with unfinished stops plus nonterminal no-stop trips", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { getOngoingTripIds } = await import("../src/services/trip-ongoing.service.js");
  const trips = [
    { id: "done", status: "COMPLETED" },
    { id: "partial", status: "COMPLETED" },
    { id: "cancelled", status: "CANCELLED" },
    { id: "pending-complete", status: "COMPLETED" },
    { id: "no-stops", status: "IN_PROGRESS" },
    { id: "unknown-no-stops", status: null },
    { id: "no-stops-complete", status: "COMPLETED" },
  ];
  const stops = [
    { trip_id: "done", delivery_status: "DELIVERED", departure_time: null },
    { trip_id: "partial", delivery_status: "COMPLETED", departure_time: null },
    { trip_id: "partial", delivery_status: "PENDING", departure_time: null },
    { trip_id: "cancelled", delivery_status: "PENDING", departure_time: null },
    { trip_id: "pending-complete", delivery_status: null, departure_time: null },
  ];
  const originalFrom = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let range: [number, number] | null = null;
    const chain: any = {
      select: () => chain,
      order: () => chain,
      range: (from: number, to: number) => { range = [from, to]; return chain; },
      not: (key: string, operator: string, value: unknown) => { filters.push([key, `not:${operator}`, value]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, "is", value]); return chain; },
      in: (key: string, values: unknown[]) => { filters.push([key, "in", values]); return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
    };
    const execute = () => {
      let rows: any[] = table === "trips" ? trips : stops;
      for (const [key, operator, value] of filters) {
        if (operator === "in") rows = rows.filter((row) => (value as unknown[]).includes(row[key]));
        else if (operator === "is") rows = rows.filter((row) => row[key] === value);
        else if (operator === "not:in") rows = rows.filter((row) => !String(value).slice(1, -1).split(",").includes(String(row[key])));
        else if (operator === "in") rows = rows;
        else if (operator === "in") rows = rows;
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows, error: null };
    };
    return chain;
  };
  try {
    const ids = await getOngoingTripIds();
    assert.deepEqual(new Set(ids), new Set(["partial", "pending-complete", "no-stops", "unknown-no-stops"]));
  } finally { (supabaseAdmin as any).from = originalFrom; }
});
