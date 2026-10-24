import assert from "node:assert/strict";
import test from "node:test";
import { proposeAllocation, allocationGroupKey } from "../src/services/propose-allocation.ts";
import type { CargoLine, CargoTruck } from "../src/services/cargo-planning.ts";
const line = (key: string, dr: string, cbm: string): CargoLine => ({ key, dr, cbm, quantity: "1", stop: "Store", label: key });
const truck = (id: string, capacity: string): CargoTruck => ({ id, capacity, label: id, driverId: `driver-${id}`, driverLabel: id });
test("fits all source lines in one truck without changing precision", () => {
  const lines = [line("1", "DR1", "0.123456789123456789"), line("2", "DR2", "0.2")];
  const result = proposeAllocation({ lines, trucks: [truck("A", "1")] });
  assert.equal(result.unassigned.length, 0); assert.equal(result.assignedCbm, "0.323456789123456789"); assert.equal(result.assignments[0].quantity, "1");
});
test("two trucks keep each DR whole with deterministic best fit", () => {
  const lines = [line("1", "DR1", "4"), line("2", "DR1", "2"), line("3", "DR2", "4")];
  const input = { lines, trucks: [truck("A", "6"), truck("B", "4")] };
  const result = proposeAllocation(input);
  assert.equal(result.unassigned.length, 0); assert.equal(new Set(result.assignments.filter(p => ["1", "2"].includes(p.line_key)).map(p => p.truck_id)).size, 1);
  assert.deepEqual(result, proposeAllocation(input)); assert.deepEqual(input.lines, lines);
});
test("locked DRs and intentionally unassigned locks remain untouched", () => {
  const a = line("1", "DR1", "4"), b = line("2", "DR2", "4"), placement = { line_key: "1", truck_id: "B", quantity: "1", allocated_cbm: "4" };
  const result = proposeAllocation({ lines: [a, b], trucks: [truck("A", "10"), truck("B", "10")], locked: { [allocationGroupKey(a)]: [placement], [allocationGroupKey(b)]: [] } });
  assert.deepEqual(result.assignments, [placement]); assert.deepEqual(result.unassigned, [b]);
});
test("one oversized DR splits by product lines and displays a warning", () => {
  const result = proposeAllocation({ lines: [line("1", "DR1", "6"), line("2", "DR1", "5")], trucks: [truck("A", "6"), truck("B", "6")] });
  assert.equal(result.assignments.length, 2); assert.equal(result.unassigned.length, 0); assert.ok(result.warnings.some(w => w.code === "split"));
});
test("unknown capacity is not assignable", () => {
  const result = proposeAllocation({ lines: [line("1", "DR1", "3")], trucks: [truck("A", "")] });
  assert.equal(result.assignments.length, 0); assert.equal(result.unassigned.length, 1); assert.ok(result.warnings.some(w => w.code === "unknown"));
});

test("a partially placed locked line reports its exact unassigned remainder", () => {
  const source = { ...line("1", "DR1", "3.5"), quantity: "7" };
  const placement = { line_key: "1", truck_id: "A", quantity: "3", allocated_cbm: "1.5" };
  const result = proposeAllocation({ lines: [source], trucks: [truck("A", "10")], locked: { "dr:DR1": [placement] } });
  assert.deepEqual(result.assignments, [placement]);
  assert.deepEqual(result.unassigned, [{ ...source, quantity: "4", cbm: "2" }]);
});
test("zero trucks leaves every line unassigned", () => {
  const lines = [line("1", "DR1", "3")], result = proposeAllocation({ lines, trucks: [] });
  assert.deepEqual(result.unassigned, lines); assert.equal(result.capacityCbm, "0");
});
test("over capacity produces a partial proposal, then adding a truck redistributes every unlocked DR", () => {
  const lines = [line("1", "DR1", "6"), line("2", "DR2", "5")];
  const first = proposeAllocation({ lines, trucks: [truck("A", "6")] });
  assert.equal(first.assignments.length, 1); assert.equal(first.overflowCbm, "5");
  assert.equal(proposeAllocation({ lines, trucks: [truck("A", "6"), truck("B", "6")] }).unassigned.length, 0);
});
test("known conflicts never receive automatic cargo", () => {
  const result = proposeAllocation({ lines: [line("1", "DR1", "3")], trucks: [truck("A", "6"), truck("B", "6")], excludedTruckIds: ["A"] });
  assert.equal(result.assignments[0].truck_id, "B");
});
test("capacity fragmentation never silently splits a normal-size DR", () => {
  const result = proposeAllocation({ lines: [line("1", "DR1", "6"), line("2", "DR1", "5"), line("3", "DR2", "8")], trucks: [truck("A", "12"), truck("B", "7")] });
  assert.equal(result.unassigned[0].dr, "DR2"); assert.ok(!result.warnings.some(w => w.group === "dr:DR2" && w.code === "split"));
});
