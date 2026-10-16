import assert from "node:assert/strict";
import test from "node:test";
import { consumeReportReadRows, reportReadPageSize, withReportReadBudget } from "../src/services/report-read-budget.js";

test("background reads are bounded and oversized snapshots fail instead of truncating data", async () => {
  assert.equal(reportReadPageSize(1000), 1000);
  await withReportReadBudget(async () => {
    assert.equal(reportReadPageSize(1000), 3);
    consumeReportReadRows("trips", 2);
    assert.throws(() => consumeReportReadRows("trips", 1), /background snapshot limit/);
  }, { perRelation: 2, total: 4 });
  await assert.rejects(withReportReadBudget(async () => { consumeReportReadRows("trips", 2); consumeReportReadRows("stops", 2); }, { perRelation: 3, total: 3 }), /background snapshot limit/);
  consumeReportReadRows("outside-background-request", 10000);
});
test("parallel snapshots have isolated budgets", async () => {
  await Promise.all([1, 2].map(() => withReportReadBudget(async () => { consumeReportReadRows("trips", 1); await Promise.resolve(); consumeReportReadRows("trips", 1); }, { perRelation: 2, total: 2 })));
});
