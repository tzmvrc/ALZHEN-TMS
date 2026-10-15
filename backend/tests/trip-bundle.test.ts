import assert from "node:assert/strict";
import test from "node:test";
import { saveTripBundle, validateTripBundle } from "../src/services/trip-bundle.logic.js";
const sample = () => ({ trip: { dispatch_number: "MANUAL-LUZON-1", loading_date: "2026-09-10", warehouse_id: "warehouse" }, stops: [{ stop_sequence: 1, store_id: "store", line_items: [{ product_id: "product", quantity: 3, cbm: 0.0003, dr_number: null, sap_so_number: "2300901937", remarks: "SP: SPPH26091000347 / DN: DNPH6091000796" }] }] });
test("accepts a planned Luzon trip without truck or DR and preserves references", () => {
  const input = sample();
  assert.deepEqual(validateTripBundle(input), input);
});
test("rejects empty deliveries, fractional quantities, invalid CBM and driver without truck", () => {
  assert.throws(() => validateTripBundle({ ...sample(), stops: [] }), /stop/);
  const input = sample(); input.stops[0]!.line_items[0]!.quantity = 1.5;
  assert.throws(() => validateTripBundle(input), /whole quantity/);
  input.stops[0]!.line_items[0]!.quantity = 1;
  input.stops[0]!.line_items[0]!.cbm = Infinity;
  assert.throws(() => validateTripBundle(input), /CBM/);
  assert.throws(() => validateTripBundle({ ...sample(), trip: { ...sample().trip, driver_id: "driver" } }), /truck/);
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
