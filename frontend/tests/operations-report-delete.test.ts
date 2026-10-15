import assert from "node:assert/strict";
import test from "node:test";
import { deleteConfirmedOperationsReports } from "../src/services/operations-report-delete.ts";

const selected = [
  { row_id: "backload:one", source_type: "BACKLOAD" as const, record_id: "record-one", label: "Backload record-one" },
  { row_id: "offload:two", source_type: "OFFLOAD" as const, record_id: "record-two", label: "Offload record-two" },
];

test("cancelled report deletion performs no source-table requests", async () => {
  const requests: string[] = [];
  const outcome = await deleteConfirmedOperationsReports(false, selected, async (type, id) => { requests.push(`${type}:${id}`); });
  assert.deepEqual(requests, []);
  assert.deepEqual(outcome, { deletedRowIds: [], failures: [] });
});

test("confirmed mixed-type deletion targets exact source IDs and exposes partial failure", async () => {
  const requests: string[] = [];
  const outcome = await deleteConfirmedOperationsReports(true, selected, async (type, id) => {
    requests.push(`${type}:${id}`);
    if (id === "record-two") throw new Error("receipt images prevent deletion");
  });
  assert.deepEqual(requests, ["BACKLOAD:record-one", "OFFLOAD:record-two"]);
  assert.deepEqual(outcome.deletedRowIds, ["backload:one"]);
  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0].target.row_id, "offload:two");
  assert.match(outcome.failures[0].message, /receipt images/);
});
