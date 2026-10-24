import assert from "node:assert/strict";
import test from "node:test";
import { isolateImportRows } from "../src/services/isolate-import-rows.ts";

test("a row validation failure does not prevent saving the other source rows", async () => {
  const saved: number[] = [];
  const results = await isolateImportRows([1, 2, 3], async rows => { if (rows.includes(2)) throw Error("row"); saved.push(...rows); return { saved: rows, failed: [] as number[] }; }, error => error instanceof Error && error.message === "row", row => ({ saved: [], failed: [row] }));
  assert.deepEqual(saved, [1, 3]); assert.deepEqual(results.flatMap(result => result.failed), [2]);
});
test("network errors and immutable batch conflicts are not split or retried", async () => {
  let attempts = 0;
  await assert.rejects(isolateImportRows([1, 2], async () => { attempts++; throw Error("network"); }, () => false, () => 0), /network/);
  assert.equal(attempts, 1);
});
