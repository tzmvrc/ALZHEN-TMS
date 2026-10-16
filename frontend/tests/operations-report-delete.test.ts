import assert from "node:assert/strict";
import test from "node:test";
import { deleteConfirmedOperationsReports, operationsDeleteTargets } from "../src/services/operations-report-delete.ts";
import type { OperationsEventRow } from "../src/services/operations-report.service.ts";

const selected = [
  { row_id: "backload:one", source_type: "BACKLOAD" as const, record_id: "record-one", label: "Backload record-one" },
  { row_id: "offload:two", source_type: "OFFLOAD" as const, record_id: "record-two", label: "Offload record-two" },
];

test("cancelled report deletion performs no source-table requests", async () => {
  const requests: string[] = [];
  const outcome = await deleteConfirmedOperationsReports(false, selected, async (type, id) => { requests.push(`${type}:${id}`); });
  assert.deepEqual(requests, []);
  assert.deepEqual(outcome, { deletedRowIds: [], failures: [], cleanupPending: [] });
});

test("confirmed mixed-type deletion targets exact source IDs and exposes partial failure", async () => {
  const requests: string[] = [];
  const outcome = await deleteConfirmedOperationsReports(true, selected, async (type, id) => {
    requests.push(`${type}:${id}`);
    if (id === "record-two") throw new Error("protected historical records prevent deletion");
  });
  assert.deepEqual(requests, ["BACKLOAD:record-one", "OFFLOAD:record-two"]);
  assert.deepEqual(outcome.deletedRowIds, ["backload:one"]);
  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0].target.row_id, "offload:two");
  assert.match(outcome.failures[0].message, /protected historical/);
});
test("toolbar targets use physical report identity, reject hidden selections and never fall back to a trip", () => {
  const row = { id: "offload:physical", source_type: "OFFLOAD", source_record_id: "physical", trip_id: "trip", trip_stop_id: "stop", dispatch_number: "DSP", event_type_records: [{ id: "physical", source_type: "OFFLOAD", event_type: "Loading" }] } as OperationsEventRow;
  assert.equal(operationsDeleteTargets([row], new Set([row.id]))?.[0].record_id, "physical");
  assert.equal(operationsDeleteTargets([], new Set([row.id])), null);
  assert.equal(operationsDeleteTargets([{ ...row, source_record_id: "trip" }], new Set([row.id])), null);
  assert.equal(operationsDeleteTargets([{ ...row, event_type_records: [] }], new Set([row.id])), null);
});

test("bulk deletion separates completed, pending image cleanup and protected records", async () => {
  const targets = [...selected, { ...selected[1], row_id: "offload:three", record_id: "record-three" }];
  const result = await deleteConfirmedOperationsReports(true, targets, async (_type, id) => {
    if (id === "record-two") return { cleanup_pending: true, operation_id: "cleanup-two" };
    if (id === "record-three") throw new Error("Protected history");
    return { cleanup_pending: false };
  });
  assert.deepEqual(result.deletedRowIds,["backload:one","offload:two"]);
  assert.equal(result.cleanupPending[0].operationId,"cleanup-two");
  assert.equal(result.failures[0].target.record_id,"record-three");
});
