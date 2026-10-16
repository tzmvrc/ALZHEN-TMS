import { getCachedMasterData,fetchMasterData } from "../src/services/master-data.service.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { cancelAdminPreload, preloadAdminPageData } from "../src/services/admin-preload.service.ts";
import { clearApiCache } from "../src/services/api.service.ts";
import { REPORTS, clearReportPageCache, fetchReportPage, getCachedReportPage, getInitialReportPageOptions } from "../src/services/report.service.ts";
import { fetchOperationsOverview, getCachedOperations } from "../src/services/operations-report.service.ts";
import { fetchTransmittalTracker, getCachedTransmittalTracker } from "../src/services/transmittal-tracker.service.ts";

test("login schedules every configured report in the page cache and deduplicates repeat login/navigation", async () => {
  const original = globalThis.fetch;
  cancelAdminPreload(); clearApiCache(); clearReportPageCache();
  const urls: string[] = [];let activeRequests=0,maxConcurrentRequests=0;const warmupStart=performance.now();
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);activeRequests++;maxConcurrentRequests=Math.max(maxConcurrentRequests,activeRequests);await new Promise(resolve=>setTimeout(resolve,1));activeRequests--;
    return new Response(JSON.stringify({ success: true, data: url.includes("/operations/overview") ? { event_rows: [], trips: [], stops: [], loading: [], unloading: [], backloads: [], offloads: [], trip_options: [] } : url.includes("/transmittal-tracker") ? { rows: [], columns: [], table_id: "tracker", access: { canView: true } } : url.includes("/columns")
      ? { columns: [] }
      : { rows: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } }), { status: 200 });
  };
  try {
    await preloadAdminPageData("admin-test", "ADMIN");
    await preloadAdminPageData("admin-test", "ADMIN");
    const keys = Object.keys(REPORTS) as Array<keyof typeof REPORTS>;
    for (let attempt = 0; attempt < 100 && (keys.some((key) => !getCachedReportPage(key, "admin-test", getInitialReportPageOptions(key))) || !getCachedOperations("admin-test") || !getCachedTransmittalTracker("admin-test") || !getCachedMasterData("admin-test","stores")); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    for (const key of keys) {
      assert.ok(getCachedReportPage(key, "admin-test", getInitialReportPageOptions(key)), `${key} was prefetched`);
      const dataRequests = urls.filter((url) => new URL(url).pathname === `/api/reports/${key}` && !url.includes("active_transactions"));
      assert.equal(dataRequests.length, 1, `${key} initial data requested once`);
    }
    assert.ok(urls.some((url) => url.includes("active_transactions=true") && url.includes("archive_scope=active")), "Trips' active transaction query is warmed separately");
    assert.ok(getCachedOperations("admin-test")); assert.ok(getCachedTransmittalTracker("admin-test"));
    assert.equal(urls.filter((url) => url.includes("/operations/overview?preload=true")).length, 1);
    assert.equal(urls.filter((url) => url.includes("/transmittal-tracker?search=&preload=true")).length, 1);
    assert.equal(urls.length, 23, "7 report datasets plus shared lookups, Trips queries and three bounded management pages");
    const warmupMs=Math.round(performance.now()-warmupStart);const beforeNavigation = urls.length;
    for (const key of keys) await fetchReportPage(key, "admin-test", getInitialReportPageOptions(key));
    await fetchOperationsOverview("admin-test"); await fetchTransmittalTracker("admin-test");
    for(const resource of ["warehouses","trucks","stores"] as const)await fetchMasterData("admin-test",resource,"",1);
    assert.equal(urls.length, beforeNavigation, "opening all seven prefetched report datasets adds zero requests");
    assert.ok(maxConcurrentRequests<=4,"two queued tasks have at most two report requests each");
    console.log(JSON.stringify({mockedPreload:true,initialRequests:beforeNavigation,maxConcurrentRequests,warmupMs,navigationAdditionalRequests:urls.length-beforeNavigation}));
    cancelAdminPreload(); clearApiCache(); clearReportPageCache(); urls.length = 0;
    await preloadAdminPageData("trucker-test", "TRUCKER");
    assert.equal(urls.length, 0, "restricted sessions schedule no admin requests");
  } finally { cancelAdminPreload(); clearApiCache(); clearReportPageCache(); globalThis.fetch = original; }
});
