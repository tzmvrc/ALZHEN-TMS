import assert from "node:assert/strict";
import test from "node:test";
import { saveTripBundle, validateTripBundle } from "../src/services/trip-bundle.logic.js";
const sample = () => ({ trip: { dispatch_number: "MANUAL-LUZON-1", loading_date: "2026-09-10", warehouse_id: "warehouse" }, stops: [{ stop_sequence: 1, store_id: "store", line_items: [{ product_id: "product", quantity: 3, cbm: 0.0003, dr_number: null, sap_so_number: "2300901937", remarks: "SP: SPPH26091000347 / DN: DNPH6091000796" }] }] });
test("accepts a planned Luzon trip without truck or DR and preserves references", () => {
  const input = sample();
  assert.deepEqual(validateTripBundle(input), { ...input, assignments: [] });
});
test("validates multiple truck assignments and preserves one primary assignment", () => {
  const result = validateTripBundle({
    ...sample(),
    assignments: [
      { truck_id: "truck-a", driver_id: "driver-a" },
      { truck_id: "truck-b", driver_id: null },
    ],
  });
  assert.deepEqual(result.assignments, [
    { truck_id: "truck-a", driver_id: "driver-a", assignment_type: "PRIMARY" },
    { truck_id: "truck-b", driver_id: null, assignment_type: "ADDITIONAL" },
  ]);
  assert.throws(() => validateTripBundle({
    ...sample(),
    assignments: [{ truck_id: "truck-a" }, { truck_id: "truck-a" }],
  }), /more than once/);
  assert.throws(() => validateTripBundle({
    ...sample(),
    assignments: [
      { truck_id: "truck-a", assignment_type: "PRIMARY" },
      { truck_id: "truck-b", assignment_type: "PRIMARY" },
    ],
  }), /Exactly one truck assignment/);
  assert.throws(() => validateTripBundle({
    ...sample(),
    assignments: [
      { truck_id: "truck-a", assignment_type: "ADDITIONAL" },
    ],
  }), /Exactly one truck assignment/);
});
test("rejects malformed deliveries, fractional quantities, invalid CBM and driver without truck", () => {
  assert.throws(() => validateTripBundle({ ...sample(), stops: {} }), /array/);
  const input = sample(); input.stops[0]!.line_items[0]!.quantity = 1.5;
  assert.throws(() => validateTripBundle(input), /whole quantity/);
  input.stops[0]!.line_items[0]!.quantity = 1;
  input.stops[0]!.line_items[0]!.cbm = Infinity;
  assert.throws(() => validateTripBundle(input), /CBM/);
  assert.throws(() => validateTripBundle({ ...sample(), trip: { ...sample().trip, driver_id: "driver" } }), /truck/);
});

test("accepts a trip with all user fields omitted and empty deliveries", () => {
  assert.deepEqual(validateTripBundle({ trip: {} }), { trip: {}, stops: [], assignments: [] });
  assert.deepEqual(validateTripBundle({ trip: {}, stops: [], assignments: [] }), { trip: {}, stops: [], assignments: [] });
  const input = { trip: { warehouse_id: null }, stops: [{ stop_sequence: 1, store_id: null, line_items: [{ product_id: null, quantity: null, cbm: null, dr_number: "DR-123" }] }] };
  assert.deepEqual(validateTripBundle(input), { ...input, assignments: [] });
  assert.doesNotThrow(() => validateTripBundle({ trip: {}, stops: [{ stop_sequence: 1, line_items: [] }] }));
});

test("saves an incomplete booking without creating placeholder stops or assignments", async () => {
  const calls: string[] = [];
  await saveTripBundle({ trip: {} }, {
    createTrip: async () => { calls.push("trip"); return { id: "draft-trip" }; },
    createStop: async () => { assert.fail("No placeholder stops"); },
    createLine: async () => { assert.fail("No placeholder products"); },
    createAssignment: async () => { assert.fail("No placeholder truck assignments"); },
    rollback: async () => { assert.fail("Unexpected rollback"); },
  });
  assert.deepEqual(calls, ["trip"]);
});
test("saves each stop and product before optional assignment", async () => {
  const calls: string[] = [], input = sample();
  const result = await saveTripBundle({ ...input, trip: { ...input.trip, truck_id: "truck", driver_id: "driver" } }, {
    createTrip: async (details) => { assert.equal("truck_id" in details, false); calls.push("trip"); return { id: "trip" }; },
    createStop: async (_, stop) => { assert.equal("line_items" in stop, false); calls.push("stop"); return { id: "stop" }; },
    createLine: async (_, stopId, line) => { assert.equal(stopId, "stop"); assert.equal(line.sap_so_number, "2300901937"); calls.push("line"); },
    createAssignment: async (_, assignment) => { assert.equal(assignment.truck_id, "truck"); assert.equal(assignment.assignment_type, "PRIMARY"); calls.push("assignment"); },
    rollback: async () => { assert.fail("Unexpected rollback"); },
  });
  assert.equal(result.id, "trip"); assert.deepEqual(calls, ["trip", "stop", "line", "assignment"]);
});
test("saves every requested truck assignment under the same trip", async () => {
  const calls: string[] = [];
  await saveTripBundle({
    ...sample(),
    assignments: [{ truck_id: "truck-a" }, { truck_id: "truck-b" }],
  }, {
    createTrip: async () => ({ id: "one-trip" }),
    createStop: async () => ({ id: "stop" }),
    createLine: async () => {},
    createAssignment: async (tripId, assignment) => {
      assert.equal(tripId, "one-trip");
      calls.push(`${assignment.truck_id}:${assignment.assignment_type}`);
    },
    rollback: async () => { assert.fail("Unexpected rollback"); },
  });
  assert.deepEqual(calls, ["truck-a:PRIMARY", "truck-b:ADDITIONAL"]);
});
test("cleans up a failed save and skips assignment for unallocated trips", async () => {
  let rolledBack = "";
  const deps = {
    createTrip: async () => ({ id: "new-trip" }), createStop: async () => ({ id: "stop" }),
    createLine: async () => { throw new Error("Product missing"); },
    createAssignment: async () => { assert.fail("Unexpected assignment"); }, rollback: async (id: string) => { rolledBack = id; },
  };
  await assert.rejects(saveTripBundle(sample(), deps), /Product missing/);
  assert.equal(rolledBack, "new-trip");
  await saveTripBundle(sample(), { ...deps, createLine: async () => {} });
});
test("reports partial save explicitly if cleanup fails", async () => {
  await assert.rejects(saveTripBundle(sample(), {
    createTrip: async () => ({ id: "new-trip" }), createStop: async () => { throw new Error("Stop failed"); },
    createLine: async () => {}, createAssignment: async () => {}, rollback: async () => { throw new Error("Database unavailable"); },
  }), /new-trip was partially saved/);
});
