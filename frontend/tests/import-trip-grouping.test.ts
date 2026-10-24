import assert from "node:assert/strict";
import test from "node:test";
import { hasPhReferenceGroups, importFileFromGrid, importPayload, regroupImportFile } from "../src/components/admin/tripImportFiles.ts";
import { parseCsv } from "../src/components/admin/tripCsv.ts";
import { proposeAllocation } from "../src/services/propose-allocation.ts";
import { validateCargo, type CargoLine } from "../src/services/cargo-planning.ts";

const csv = "Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number,PH TRUCK NAME\nCustomer,Store A,Cebu,Cebu City,A,1,1.25,DR1,PH1\nCustomer,Store B,Cebu,Cebu City,B,1,2.5,DR2,PH2\nCustomer,Store C,Cebu,Cebu City,C,1,0.125,DR3,PH3";
const file = () => importFileFromGrid("Requests.csv", parseCsv(csv));

test("different PH references and stops start in one shared planning group", () => {
  const source = file(), rows = importPayload([source])[0].rows;
  assert.equal(new Set(source.rows.map(row => row.group)).size, 1);
  assert.equal(source.rows[0].group, "Requests.csv");
  assert.deepEqual(rows.map(row => row.values.ph_truck_reference), ["PH1", "PH2", "PH3"]);
  assert.deepEqual(rows.map(row => row.values.ship_to), ["Store A", "Store B", "Store C"]);
  assert.equal(hasPhReferenceGroups(source), false);
});

test("one physical truck carries different PH references and stops while respecting CBM", () => {
  const rows = importPayload([file()])[0].rows;
  const lines: CargoLine[] = rows.map(row => ({ key: String(row.line), label: row.values.customer_model!, stop: row.values.ship_to!, dr: row.values.dr_number!, quantity: row.values.quantity!, cbm: row.values.cbm!, phTruckReference: row.values.ph_truck_reference! }));
  const trucks = [{ id: "physical-1", label: "ABC-123", capacity: "4", driverId: "", driverLabel: "" }];
  const plan = proposeAllocation({ lines, trucks });
  assert.equal(plan.unassigned.length, 0);
  assert.equal(plan.assignedCbm, "3.875");
  assert.equal(new Set(plan.assignments.map(item => item.truck_id)).size, 1);
  assert.equal(validateCargo(lines, trucks, plan.assignments), null);
  const smaller = proposeAllocation({ lines, trucks: [{ ...trucks[0], capacity: "3" }] });
  assert.ok(smaller.unassigned.length > 0);
  assert.ok(Number(smaller.assignedCbm) <= 3);
});

test("legacy PH groups combine without changing source cells, row order or PH metadata", () => {
  const source = file(), separate = regroupImportFile(source, "ph_truck_reference");
  assert.equal(hasPhReferenceGroups(separate), true);
  assert.equal(new Set(separate.rows.map(row => row.group)).size, 3);
  const before = JSON.stringify(separate), combined = regroupImportFile(separate, "file");
  assert.equal(JSON.stringify(separate), before);
  assert.deepEqual(importPayload([combined]), importPayload([source]));
  assert.deepEqual(combined.rows.map(({ group: _, ...row }) => row), separate.rows.map(({ group: _, ...row }) => row));
});

test("manually planned groups are not identified as automatic PH groups", () => {
  const source = file();
  source.rows[1].group = "Separate scheduled delivery";
  assert.equal(hasPhReferenceGroups(source), false);
});

test("explicit dispatch and trip grouping remains available", () => {
  const source = importFileFromGrid("Dispatch.csv", parseCsv("Customer Name,Ship To,DR Number,Dispatch no.,Trip no.\nCustomer,Store,DR1,DISPATCH-1,1\nCustomer,Store2,DR2,DISPATCH-1,2"));
  const grouped = regroupImportFile(source, "dispatch_number");
  assert.deepEqual(grouped.rows.map(row => row.group), ["Dispatch.csv / DISPATCH-1 / Trip 1", "Dispatch.csv / DISPATCH-1 / Trip 2"]);
});
