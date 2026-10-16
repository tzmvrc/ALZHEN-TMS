import assert from "node:assert/strict";
import test from "node:test";
import { clearApiCache } from "../src/services/api.service.ts";
import { deleteOperationsReport, fetchOperationsOverview, getCachedOperations, preloadOperationsOverview } from "../src/services/operations-report.service.ts";
import { fetchReportPage, getCachedReportPage, getInitialReportPageOptions, clearReportPageCache } from "../src/services/report.service.ts";

test("bounded warmup and navigation share in-flight data; deletion invalidates Operations without clearing Combined", async () => {
  clearApiCache(); clearReportPageCache();
  const original = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = async (input) => { const url = String(input); urls.push(url); await Promise.resolve(); return new Response(JSON.stringify({ success: true, data: url.includes("/columns") ? { columns: [] } : url.includes("/combined") ? { rows: [], pagination: { page: 1, total: 0 } } : { event_rows: [] } }), { status: 200 }); };
  try {
    const [preload, navigation] = await Promise.all([preloadOperationsOverview("owner"), fetchOperationsOverview("owner")]);
    assert.strictEqual(preload, navigation); assert.equal(urls.length, 1);
    assert.strictEqual(getCachedOperations("owner"), preload); assert.equal(getCachedOperations("other-user"), null);
    const options = getInitialReportPageOptions("combined");
    const combined = await fetchReportPage("combined", "owner", options);
    await deleteOperationsReport("owner", "OFFLOAD", "physical-id");
    assert.equal(getCachedOperations("owner"), null);
    assert.strictEqual(getCachedReportPage("combined", "owner", options), combined);
    await fetchOperationsOverview("owner"); assert.equal(urls.filter((url) => url.includes("/operations/overview")).length, 2);
  } finally { globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});
test("oversized background snapshots fail recoverably and normal page loads can retry", async () => {
  clearApiCache(); const original = globalThis.fetch;
  globalThis.fetch = async (input) => new Response(JSON.stringify(String(input).includes("preload=true") ? { success: false, message: "Background snapshot limit exceeded" } : { success: true, data: { event_rows: [] } }), { status: String(input).includes("preload=true") ? 413 : 200 });
  try { await assert.rejects(preloadOperationsOverview("owner"), /snapshot limit/); assert.equal(getCachedOperations("owner"), null); await fetchOperationsOverview("owner"); assert.ok(getCachedOperations("owner")); }
  finally { globalThis.fetch = original; clearApiCache(); }
});
