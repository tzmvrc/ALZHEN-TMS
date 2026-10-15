import assert from "node:assert/strict";
import test from "node:test";
import { manilaDateTime, manilaDateTimeToIso, optionalOffloadNumber, selectedTransactionValues } from "../src/services/offload-form.logic.ts";
import { buildOperationsTripChoices } from "../src/services/operations-trip-selection.ts";
import { exactOffloadReport } from "../src/services/operations-offload-target.ts";
import type { OperationsEventRow, OperationsTripOption } from "../src/services/operations-report.service.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OperationsReporterEditor from "../src/components/admin/OperationsReporterEditor.tsx";

test("Manila report inputs round-trip across a UTC date boundary without local timezone shifts", () => {
  assert.equal(manilaDateTime("2026-10-15T17:30:00Z"), "2026-10-16T01:30");
  assert.equal(manilaDateTimeToIso("2026-10-16T01:30"), "2026-10-15T17:30:00.000Z");
  assert.throws(() => manilaDateTimeToIso("2026-02-30T09:30"));
});

test("reporter dropdown displays the full name rather than the underlying profile ID", () => {
  const id = "123e4567-e89b-42d3-a456-000000000001";
  const html = renderToStaticMarkup(createElement(OperationsReporterEditor, { token: "test-session", value: id, name: "Current Full Name", onSelect: () => assert.fail("render must not submit") }));
  assert.match(html, /Current Full Name/);
  assert.doesNotMatch(html, new RegExp(id));
});
test("three shared-assignment transactions autofill only their own quantities; overrides never mutate Trips", () => {
  const trip: OperationsTripOption = { id: "trip", trip_number: "TR", dispatch_number: "STALE", status: "PLANNED", driver_name: "Shared driver", plate_number: "Shared truck", route: "Route", stops: [1, 2, 3].map((n) => ({ id: `stop-${n}`, stop_sequence: n, dispatch_number: `SAVED-${n}`, quantity: n === 1 ? 0 : n, total_cbm: n / 10 })) };
  const choices = buildOperationsTripChoices([trip, trip]);
  assert.equal(choices.length, 3); assert.deepEqual(choices.map((choice) => choice.dispatchNumber), ["SAVED-1", "SAVED-2", "SAVED-3"]);
  const before = structuredClone(trip);
  const values = selectedTransactionValues(choices[1]);
  assert.deepEqual(values, { quantity: "2", totalCbm: "0.2" });
  values.quantity = "8"; assert.equal(optionalOffloadNumber(values.quantity), 8);
  assert.deepEqual(trip, before);
  assert.equal(selectedTransactionValues(choices[0]).quantity, "0");
  assert.equal(optionalOffloadNumber(""), null); assert.equal(optionalOffloadNumber("0"), 0);
  assert.throws(() => optionalOffloadNumber("-1"));
});
test("Offload edits require one exact physical parent and matching trip/stop", () => {
  const row = { source_type: "OFFLOAD", source_record_id: "offload", trip_id: "trip", trip_stop_id: "stop-2", offload_records: [{ id: "offload", trip_id: "trip", trip_stop_id: "stop-2", comments: "Remark" }] } as OperationsEventRow;
  assert.equal(exactOffloadReport(row)?.id, "offload");
  for (const changed of [{ trip_id: "wrong" }, { trip_stop_id: "stop-1" }, { source_record_id: "wrong" }, { source_type: "BACKLOAD" }, { offload_records: [...row.offload_records, ...row.offload_records] }]) assert.equal(exactOffloadReport({ ...row, ...changed } as OperationsEventRow), null);
});

test("Offload service sends exact transaction values and invalidates the shared overview cache", async () => {
  const { clearApiCache } = await import("../src/services/api.service.ts");
  const service = await import("../src/services/operations-report.service.ts");
  clearApiCache();
  const original = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify({ success: true, data: requests.at(-1)?.method === "GET" ? { event_rows: [] } : { id: "offload", trip_id: "trip", trip_stop_id: "stop-2" } }), { status: 200 });
  };
  try {
    await service.fetchOperationsOverview("session-a"); await service.fetchOperationsOverview("session-a");
    assert.equal(requests.length, 1);
    await service.createScopedReport("session-a", "offloads", { trip_id: "trip", trip_stop_id: "stop-2", reason: "Issue", comments: "Remark", number_of_boxes: null, quantity: 8, total_cbm: 0, reported_by: "profile" });
    assert.deepEqual(requests[1].body, { trip_id: "trip", trip_stop_id: "stop-2", reason: "Issue", comments: "Remark", number_of_boxes: null, quantity: 8, total_cbm: 0, reported_by: "profile" });
    await service.fetchOperationsOverview("session-a"); assert.equal(requests.length, 3);
    await service.updateScopedReport("session-a", "offloads", "offload", { trip_id: "trip", trip_stop_id: "stop-2", comments: "Edited" });
    assert.match(requests[3].url, /offloads\/offload$/);
    assert.deepEqual(requests[3].body, { trip_id: "trip", trip_stop_id: "stop-2", comments: "Edited" }, "remarks-only edits do not rewrite numeric values or the creator");
    assert.ok(requests.every((request) => !/line-items/.test(request.url)));
  } finally { globalThis.fetch = original; clearApiCache(); }
});
