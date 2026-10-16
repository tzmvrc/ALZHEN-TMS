import assert from "node:assert/strict";
import test from "node:test";
import { offloadTransactionChoices, offloadTransactionChoice, type OffloadTransaction } from "../src/services/offload-dr-selection";
import { selectedTransactionValues } from "../src/services/offload-form.logic";
test("duplicate DR labels retain distinct transaction IDs and zero/blank autofill never changes source values", () => {
  const row: OffloadTransaction = { id: "stop-one", trip_id: "shared-trip", trip_stop_id: "stop-one", dr_number: "DR-123", dispatch_number: "SHARED", warehouse: "Warehouse", destination: "Store", driver_name: "Shared Driver", plate_number: "Shared Truck", route: "Warehouse → Store", quantity: 0, total_cbm: null };
  const sibling = { ...row, id: "stop-two", trip_stop_id: "stop-two", quantity: 12, total_cbm: 1.5 };
  const choices = offloadTransactionChoices([row, sibling, row, { ...row, id: "blank", dr_number: " " }]);
  assert.equal(choices.length, 2); assert.notEqual(choices[0].label, choices[1].label);
  assert.match(choices[0].label, /DR-123 — Warehouse — Store/);
  const target = offloadTransactionChoice(row);
  assert.equal(target.trip.id, "shared-trip"); assert.equal(target.stopId, "stop-one");
  assert.deepEqual(selectedTransactionValues(target), { quantity: "0", totalCbm: "" });
  assert.equal(sibling.quantity, 12);
});
