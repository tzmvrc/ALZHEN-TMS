import assert from "node:assert/strict";
import test from "node:test";
import { cancelAdminPreload, preloadAdminPageData } from "../src/services/admin-preload.service.ts";
import { clearApiCache } from "../src/services/api.service.ts";
import { REPORTS, clearReportPageCache, fetchReportPage, getCachedReportPage, getInitialReportPageOptions } from "../src/services/report.service.ts";

test("login does not preload unrelated tabs; Reports warms only the requested report and shared references", async () => {
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
    assert.equal(urls.length,0,"login starts no unrelated feature requests");
    await Promise.all(Array.from({length:10},()=>fetchReportPage("combined","admin-test",getInitialReportPageOptions("combined"))));
    await preloadAdminPageData("admin-test","ADMIN","reports");
    const keys = Object.keys(REPORTS) as Array<keyof typeof REPORTS>;
    for (const key of keys) {
      const cached=getCachedReportPage(key, "admin-test", getInitialReportPageOptions(key));
      if(key==="combined")assert.ok(cached,"requested report was prefetched");
      else assert.equal(cached,null,`${key} stays lazy until its workspace requests it`);
      const dataRequests = urls.filter((url) => new URL(url).pathname === `/api/reports/${key}` && !url.includes("active_transactions"));
      assert.equal(dataRequests.length, key==="combined"?1:0, `${key} only reads when requested`);
    }
    assert.ok(!urls.some(url=>url.includes("/trips?")||url.includes("/master-data/")),"Reports does not preload Home or management data");
    assert.ok(!urls.some(url=>/\/operations\/|\/transmittal-tracker/.test(url)),"unopened workspaces are not preloaded");
    assert.equal(urls.length,6,"one report's columns and rows, plus four shared reference reads");
    const warmupMs=Math.round(performance.now()-warmupStart);const beforeNavigation = urls.length;
    await fetchReportPage("combined", "admin-test", getInitialReportPageOptions("combined"));

    assert.equal(urls.length, beforeNavigation, "opening the warmed report adds zero requests");
    assert.ok(maxConcurrentRequests<=4,"two queued tasks have at most two report requests each");
    console.log(JSON.stringify({mockedPreload:true,baselineLoginPreloads:23,loginPreloads:0,reportsWarmupRequests:beforeNavigation,maxConcurrentRequests,warmupMs,navigationAdditionalRequests:urls.length-beforeNavigation}));
    cancelAdminPreload(); clearApiCache(); clearReportPageCache(); urls.length = 0;
    await preloadAdminPageData("trucker-test", "TRUCKER");
    assert.equal(urls.length, 0, "restricted sessions schedule no admin requests");
  } finally { cancelAdminPreload(); clearApiCache(); clearReportPageCache(); globalThis.fetch = original; }
});
