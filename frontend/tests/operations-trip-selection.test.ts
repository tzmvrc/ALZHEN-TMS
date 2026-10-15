import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsTripChoices, findOperationsTripChoice } from "../src/services/operations-trip-selection.ts";
import type { OperationsTripOption } from "../src/services/operations-report.service.ts";

const trip = (overrides: Partial<OperationsTripOption> = {}): OperationsTripOption => ({
  id: "trip-id-1",
  trip_number: 101,
  dispatch_number: "DSP-101",
  status: "PLANNED",
  driver_name: "Alex Driver",
  plate_number: "ABC-123",
  route: "Warehouse → Store A → Store B",
  stops: [{ id: "stop-a", stop_sequence: 1, dispatch_number: "DSP-A" }, { id: "stop-b", stop_sequence: 2, dispatch_number: "DSP-B" }],
  ...overrides,
});

test("trip choices deduplicate repeated rows and selection resolves by the real trip ID", () => {
  const option = trip();
  const choices = buildOperationsTripChoices([option, option]);

  assert.equal(choices.length, 2);
  assert.equal(choices[0].label, "DSP-A");
  const selected = findOperationsTripChoice(choices, "trip-id-1:stop-a");
  assert.equal(selected?.id, "trip-id-1:stop-a");
  assert.equal(selected?.dispatchNumber, "DSP-A");
  assert.equal(selected?.stopId, "stop-a");
  assert.equal(selected?.trip.driver_name, "Alex Driver");
  assert.equal(selected?.trip.plate_number, "ABC-123");
  assert.equal(selected?.trip.route, "Warehouse → Store A → Store B");
  assert.equal(findOperationsTripChoice(choices, "DSP-101"), null);
});

test("duplicate dispatch numbers are visibly distinguished and trip context stays tied to each ID", () => {
  const first = trip({ stops: [] });
  const second = trip({ id: "trip-id-2", trip_number: 102, driver_name: null, plate_number: null, route: null, stops: [] });
  const choices = buildOperationsTripChoices([first, second]);

  const parentChoices = choices.filter((choice) => !choice.stopId);
  assert.equal(new Set(parentChoices.map((choice) => choice.label)).size, 2);
  assert.ok(parentChoices.every((choice) => choice.label.includes("DSP-101")));
  assert.equal(findOperationsTripChoice(choices, "trip-id-2")?.trip.driver_name, null);
  assert.equal(findOperationsTripChoice(choices, "trip-id-1")?.stopId, null);
});

test("current stop dispatch resolves exact stop without inferring a sibling or requiring a separate stop picker", () => {
  const current = trip({ stops: [
    { id: "stop-a", stop_sequence: 1, dispatch_number: "SAVED-A" },
    { id: "stop-b", stop_sequence: 2, dispatch_number: "SAVED-B" },
    { id: "stop-c", stop_sequence: 3, dispatch_number: null },
  ] });
  const choices = buildOperationsTripChoices([current]);
  const selected = findOperationsTripChoice(choices, "trip-id-1:stop-b");
  assert.equal(selected?.dispatchNumber, "SAVED-B");
  assert.equal(selected?.stopId, "stop-b");
  assert.equal(selected?.trip.id, "trip-id-1");
  assert.equal(findOperationsTripChoice(choices, "trip-id-1"), null);
  assert.equal(choices.length, 3);
  assert.equal(findOperationsTripChoice(choices, "trip-id-1:stop-c")?.selectable, false);
  assert.equal(findOperationsTripChoice(choices, "trip-id-1:stop-c")?.dispatchNumber, "");
});

test("a shared trip/stop dispatch has exact stop identity and duplicate stop labels stay distinct", () => {
  const choices = buildOperationsTripChoices([trip({ dispatch_number: "DSP-A", stops: [
    { id: "stop-a", stop_sequence: 1, dispatch_number: "DSP-A" },
    { id: "stop-b", stop_sequence: 2, dispatch_number: "DSP-A" },
  ] })]);
  assert.equal(choices.length, 2);
  assert.equal(new Set(choices.map((choice) => choice.label)).size, 2);
  assert.deepEqual(choices.map((choice) => choice.stopId), ["stop-a", "stop-b"]);
  assert.ok(choices.every((choice) => !choice.label.includes("Stop ")));
});

test("trips without a dispatch number remain visible but cannot be selected", () => {
  const choices = buildOperationsTripChoices([trip({ dispatch_number: null, stops: [] })]);

  assert.equal(choices[0].label, "Dispatch number unavailable");
  assert.equal(choices[0].selectable, false);
});
