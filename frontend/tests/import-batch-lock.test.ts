import assert from "node:assert/strict";
import test from "node:test";
import { importBatchHasRecordedRows } from "../src/services/import-batch-lock.ts";

const missing = {
  imported: 0, failed: 0, awaiting_allocation: 0, cargo_saved: {},
  outcomes: [{ source_identity: "source", status: "failed" as const, error: "Previously imported product is missing." }],
  history: { source: { status: "missing" as const, batch_id: "old-batch", line_item_id: null, source_row: 2, model: "Product", imported_at: null } },
};
test("missing historical products do not lock a draft with no recorded rows", () => {
  assert.equal(importBatchHasRecordedRows(missing), false);
  assert.equal(importBatchHasRecordedRows({ ...missing, outcomes: [], history: {} }), false);
});
test("persisted failures keep the server's immutable batch protection", () => {
  assert.equal(importBatchHasRecordedRows({ ...missing, failed: 1 }), true);
});
test("saved trip and product identities keep a batch locked even with missing history", () => {
  assert.equal(importBatchHasRecordedRows({ ...missing, outcomes: [{ ...missing.outcomes[0], trip_id: "trip" }] }), true);
  assert.equal(importBatchHasRecordedRows({ ...missing, outcomes: [{ ...missing.outcomes[0], line_item_id: "line" }] }), true);
  assert.equal(importBatchHasRecordedRows({ ...missing, imported: 1 }), true);
  assert.equal(importBatchHasRecordedRows({ ...missing, cargo_saved: { group: true } }), true);
});
test("unclassified outcomes stay protected", () => {
  assert.equal(importBatchHasRecordedRows({ ...missing, history: {} }), true);
});
