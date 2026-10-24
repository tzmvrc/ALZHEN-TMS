import assert from "node:assert/strict";
import test from "node:test";
import { blockingIssues, confirmedStopAddress, csvCompletion, tabStatus } from "../src/components/admin/csv-completion.ts";
import { cargoSignature, emptyCargoPlan, type CargoLine, type CargoPlan } from "../src/services/cargo-planning.ts";

const lines: CargoLine[] = [
  { key: "a", dr: "DR1", stop: "Store", label: "A", quantity: "2", cbm: "0.246913578246913578" },
  { key: "b", dr: "DR2", stop: "Store", label: "B", quantity: "1", cbm: "1" },
];
function completePlan(): CargoPlan {
  const trucks = [{ id: "t1", label: "Plate 1", capacity: "10", driverId: "", driverLabel: "" }];
  return { trucks, placements: lines.map(line => ({ line_key: line.key, truck_id: "t1", quantity: line.quantity, allocated_cbm: line.cbm })), confirmed: true, signature: cargoSignature(lines, trucks) };
}
const state = (plan = completePlan(), changes: Partial<Parameters<typeof csvCompletion>[0]> = {}) => csvCompletion({ group: "Trip", index: 0, detailIssues: [], stops: [{ key: "stop", label: "Store", verified: true }], lines, plan, cargoSaved: false, dirty: false, ...changes });

test("unconfirmed or missing addresses remain optional warnings and never block navigation", () => {
  const address = { address: "1 Main Street", province: "Cebu", city: "Cebu City", latitude: "10.3", longitude: "123.9", verified: true };
  assert.equal(confirmedStopAddress(address), true);
  for (const decision of [undefined, {}, { ...address, verified: false }, { ...address, verified: false, store_verified: true }, { ...address, pin_address_mismatch: true }, ...["address", "province", "city", "latitude", "longitude"].map(field => ({ ...address, [field]: "" })), { ...address, latitude: "100" }]) {
    assert.equal(confirmedStopAddress(decision), false);
    const completion = state(completePlan(), { stops: [{ key: "stop", label: "Store", verified: confirmedStopAddress(decision) }] });
    assert.equal(completion.stops.issues[0].optional, true);
    assert.equal(tabStatus(completion.stops.issues, true), "attention");
    assert.deepEqual(blockingIssues([completion], "cargo"), []);
    assert.deepEqual(blockingIssues([completion]), []);
  }
});

test("sub-tab status distinguishes complete, attention and unvisited without extra required trip fields", () => {
  const ready = state();
  assert.deepEqual(blockingIssues([ready]), []);
  assert.equal(tabStatus(ready.details.issues, false), "complete");
  const missing = state(emptyCargoPlan()).cargo.issues;
  assert.equal(tabStatus(missing, false), "unvisited");
  assert.equal(tabStatus(missing, true), "attention");
  assert.match(missing[0].message, /Add at least one truck/);
  assert.equal(ready.stops.count, "1");
  assert.equal(ready.cargo.count, "1 trucks · 2 DRs");
});

test("forward guard ignores optional addresses; review still checks required issues in every group", () => {
  const blocked = state(emptyCargoPlan(), { stops: [{ key: "second", label: "Second store", verified: false }] });
  assert.equal(blockingIssues([blocked], "stops").length, 0);
  assert.deepEqual(blockingIssues([blocked], "cargo"), []);
  assert.equal(blocked.stops.issues[0].stop, "second");
  assert.equal(blocked.stops.issues[0].section, "csv-group-0-stores");
  const other = state(completePlan(), { group: "Other", index: 1, detailIssues: ["match source warehouse Cebu."] });
  const issues = blockingIssues([state(), blocked, other]);
  assert.equal(issues.length, 2);
  assert.equal(issues[1].group, "Other");
  assert.equal(issues[1].section, "csv-group-1-warehouses");
});

test("cargo status counts partially unassigned DRs using existing exact-decimal totals", () => {
  const plan = completePlan();
  plan.placements[0] = { ...plan.placements[0], quantity: "1", allocated_cbm: "0.123456789123456789" };
  const before = JSON.stringify(plan);
  assert.match(state(plan).cargo.issues[0].message, /^1 DR unassigned/);
  assert.equal(JSON.stringify(plan), before, "readiness must not change the plan");
});

test("cargo status preserves validation for drivers, capacity and stale confirmation", () => {
  const plan = completePlan();
  plan.trucks.push({ id: "t2", label: "Plate 2", capacity: "10", driverId: "", driverLabel: "" });
  assert.match(state(plan).cargo.issues[0].message, /driver for each truck/);
  const full = completePlan(); full.trucks[0].capacity = "1";
  assert.match(state(full).cargo.issues[0].message, /Capacity is short/);
  const stale = completePlan(); stale.signature = "old";
  assert.match(state(stale).cargo.issues[0].message, /current cargo proposal/);
  assert.equal(state(stale, { cargoSaved: true }).cargo.issues.length, 0);
  assert.equal(state(emptyCargoPlan(), { lines: [] }).cargo.issues.length, 0, "no owned source cargo must not require new trucks");
});

test("dirty source edits stay in Stops and existing detail errors retain their sections", () => {
  const dirty = state(completePlan(), { dirty: true, detailIssues: ["estimated delivery is before loading.", "select the existing dispatch."] });
  assert.equal(dirty.stops.issues[0].message, "Apply store & product changes");
  assert.equal(dirty.details.issues[0].section, "csv-trip-details-0");
  assert.equal(dirty.details.issues[1].section, "csv-group-0-destination");
});

test("optional dates reuse the existing unreserved-plan confirmation", () => {
  const plan = completePlan();
  plan.confirmed = false;
  plan.schedule = { loading_date: "", estimated_delivery_date: "", unreserved_confirmed: false };
  assert.match(state(plan).cargo.issues[0].message, /Plan without reserving dates/);
  plan.schedule.unreserved_confirmed = true; plan.confirmed = true;
  assert.equal(state(plan).cargo.issues.length, 0);
});
