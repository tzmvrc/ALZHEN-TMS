import assert from "node:assert/strict";
import test from "node:test";
import { clearApiCache } from "../src/services/api.service.ts";
import { REPORTS, clearReportPageCache, fetchReportPage, getCachedReportPage, getInitialReportPageOptions, getReportPageState, getStaleReportPage, invalidateReportData, invalidateReportPageCache } from "../src/services/report.service.ts";

function response(url: string, version = 1) {
  return new Response(JSON.stringify({ success: true, data: url.includes("/columns")
    ? { columns: [{ key: "id", title: "ID", type: "text" }] }
    : { rows: [{ id: `row-${version}` }], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } } }), { status: 200 });
}

test("every configured report shares its preloaded initial page with navigation", async () => {
  const original = globalThis.fetch;
  clearApiCache(); clearReportPageCache();
  let requests = 0;
  globalThis.fetch = async (url) => { requests++; return response(String(url)); };
  try {
    for (const key of Object.keys(REPORTS) as Array<keyof typeof REPORTS>) {
      const options = getInitialReportPageOptions(key);
      const [prefetched, navigation] = await Promise.all([fetchReportPage(key, "user-a", options), fetchReportPage(key, "user-a", options)]);
      assert.strictEqual(prefetched, navigation);
      assert.strictEqual(await fetchReportPage(key, "user-a", options), prefetched);
      assert.strictEqual(getCachedReportPage(key, "user-a", options), prefetched);
      assert.ok(getReportPageState(key, "user-a", options).lastSuccessfulFetchAt);
    }
    assert.equal(requests, Object.keys(REPORTS).length * 2, "one metadata and one rows request per configured report; navigation adds zero");
  } finally { globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});

test("unrelated report invalidation cannot deadlock a pending page", async () => {
  const original = globalThis.fetch;
  clearApiCache(); clearReportPageCache();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  globalThis.fetch = async (url) => { requests++; await gate; return response(String(url)); };
  try {
    const options = getInitialReportPageOptions("combined");
    const pending = fetchReportPage("combined", "user-a", options);
    assert.equal(getReportPageState("combined", "user-a", options).fetching, true);
    invalidateReportPageCache("dispatch");
    release();
    assert.equal((await pending).rows[0].id, "row-1");
    assert.equal(requests, 2);
  } finally { release(); globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});

test("failed background refresh keeps previous data and allows a successful retry", async () => {
  const original = globalThis.fetch;
  clearApiCache(); clearReportPageCache();
  const options = getInitialReportPageOptions("combined");
  globalThis.fetch = async (url) => response(String(url));
  try {
    const saved = await fetchReportPage("combined", "user-a", options);
    globalThis.fetch = async () => { throw new Error("Offline"); };
    await assert.rejects(fetchReportPage("combined", "user-a", options, true), /Offline/);
    assert.strictEqual(getStaleReportPage("combined", "user-a", options), saved);
    assert.match(getReportPageState("combined", "user-a", options).error ?? "", /Offline/);
    globalThis.fetch = async (url) => response(String(url), 2);
    assert.equal((await fetchReportPage("combined", "user-a", options, true)).rows[0].id, "row-2");
    assert.equal(getReportPageState("combined", "user-a", options).error, null);
    invalidateReportData("combined");
    assert.equal(getCachedReportPage("combined", "user-a", options), null);
  } finally { globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});

test("logout discards in-flight report pages and no user can read another user's cached page", async () => {
  const original = globalThis.fetch;
  clearApiCache(); clearReportPageCache();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (url) => { await gate; return response(String(url)); };
  const options = getInitialReportPageOptions("combined");
  try {
    const pending = fetchReportPage("combined", "old-user", options);
    const rejected = assert.rejects(pending, /session changed/);
    clearReportPageCache(); clearApiCache(); release(); await rejected;
    globalThis.fetch = async (url) => response(String(url), 2);
    await fetchReportPage("combined", "new-user", options);
    assert.equal(getCachedReportPage("combined", "old-user", options), null);
    assert.equal(getCachedReportPage("combined", "new-user", options)?.rows[0].id, "row-2");
  } finally { release(); globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});

test("an invalidated old response cannot overwrite a newer saved report page or refetch it unnecessarily", async () => {
  const original = globalThis.fetch;
  clearApiCache(); clearReportPageCache();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  let rowRequests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    if (String(url).includes("/columns")) return response(String(url));
    const version = ++rowRequests;
    if (version === 1) await gate;
    return response(String(url), version);
  };
  const options = getInitialReportPageOptions("combined");
  try {
    const old = fetchReportPage("combined", "user-a", options, true);
    invalidateReportData("combined");
    const newer = await fetchReportPage("combined", "user-a", options, true);
    release();
    assert.strictEqual(await old, newer);
    assert.equal(newer.rows[0].id, "row-2");
    assert.strictEqual(getCachedReportPage("combined", "user-a", options), newer);
    assert.equal(rowRequests, 2, "one row read per generation, no third refresh");
    assert.equal(requests, 4, "column metadata also revalidates when its API request was invalidated");
  } finally { release(); globalThis.fetch = original; clearApiCache(); clearReportPageCache(); }
});
