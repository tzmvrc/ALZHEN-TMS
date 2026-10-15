import assert from "node:assert/strict";
import test from "node:test";
import { cancelAdminPreload, preloadAdminPageData } from "../src/services/admin-preload.service.ts";
import { clearApiCache } from "../src/services/api.service.ts";
import { REPORTS, clearReportPageCache, fetchReportPage, getCachedReportPage, getInitialReportPageOptions } from "../src/services/report.service.ts";

test("login schedules every configured report in the page cache and deduplicates repeat login/navigation", async () => {
  const original = globalThis.fetch;
  cancelAdminPreload(); clearApiCache(); clearReportPageCache();
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return new Response(JSON.stringify({ success: true, data: url.includes("/columns")
      ? { columns: [] }
      : { rows: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } }), { status: 200 });
  };
  try {
    await preloadAdminPageData("admin-test", "ADMIN");
    await preloadAdminPageData("admin-test", "ADMIN");
    const keys = Object.keys(REPORTS) as Array<keyof typeof REPORTS>;
    for (let attempt = 0; attempt < 100 && keys.some((key) => !getCachedReportPage(key, "admin-test", getInitialReportPageOptions(key))); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    for (const key of keys) {
      assert.ok(getCachedReportPage(key, "admin-test", getInitialReportPageOptions(key)), `${key} was prefetched`);
      const dataRequests = urls.filter((url) => new URL(url).pathname === `/api/reports/${key}` && !url.includes("active_transactions"));
      assert.equal(dataRequests.length, 1, `${key} initial data requested once`);
    }
    assert.ok(urls.some((url) => url.includes("active_transactions=true") && url.includes("archive_scope=active")), "Trips' active transaction query is warmed separately");
    const beforeNavigation = urls.length;
    for (const key of keys) await fetchReportPage(key, "admin-test", getInitialReportPageOptions(key));
    assert.equal(urls.length, beforeNavigation, "opening all five prefetched reports adds zero requests");
    cancelAdminPreload(); clearApiCache(); clearReportPageCache(); urls.length = 0;
    await preloadAdminPageData("trucker-test", "TRUCKER");
    assert.equal(urls.length, 0, "restricted sessions schedule no admin requests");
  } finally { cancelAdminPreload(); clearApiCache(); clearReportPageCache(); globalThis.fetch = original; }
});
