import assert from "node:assert/strict";
import test from "node:test";
import { collectDriverDrNumbers } from "../src/services/driver-dr.logic.js";

test("combines stop and product DR numbers once per trip", () => {
  const result = collectDriverDrNumbers([
    { id: "stop-a", trip_id: "trip-a", dr_number: " DR-1 " },
    { id: "stop-b", trip_id: "trip-b", dr_number: "DR-3" },
  ], [
    { trip_id: "trip-a", trip_stop_id: "stop-a", dr_number: "DR-1" },
    { trip_id: "trip-a", trip_stop_id: "stop-a", dr_number: "DR-2" },
    { trip_id: "trip-a", trip_stop_id: "stop-a", dr_number: " " },
  ]);
  assert.equal(result.get("trip-a"), "DR-1, DR-2");
  assert.equal(result.get("trip-b"), "DR-3");
});

test("omits archived stop DRs and their lines while keeping unscoped lines", () => {
  const result = collectDriverDrNumbers([{ id: "archived", trip_id: "trip", dr_number: "OLD", archived_at: "2026-10-20" }], [
    { trip_id: "trip", trip_stop_id: "archived", dr_number: "OLD-LINE" },
    { trip_id: "trip", trip_stop_id: null, dr_number: "CURRENT" },
  ]);
  assert.equal(result.get("trip"), "CURRENT");
  assert.equal(collectDriverDrNumbers([], []).size, 0);
});
