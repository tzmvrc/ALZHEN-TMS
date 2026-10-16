import assert from "node:assert/strict";
import test from "node:test";
import { deleteTransaction } from "../src/services/trip.service.ts";
import { clearApiCache } from "../src/services/api.service.ts";
import { createTransactionChangeMonitor } from "../src/services/transaction-change-monitor.ts";

test("transaction deletion uses exact physical trip/stop URL and preserves pending cleanup outcome", async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(String(input)); assert.equal(init?.method, "DELETE");
    return new Response(JSON.stringify({ success: true, data: { transaction_id: "stop-2", trip_id: "trip-1", trip_stop_id: "stop-2", operation_id: "job", cleanup_pending: true } }), { status: 200 });
  };
  try {
    assert.equal((await deleteTransaction("session", "trip-1", "stop-2")).cleanup_pending, true);
    assert.ok(calls[0].endsWith("/trips/trip-1/stops/stop-2"));
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Protected historical report" }), { status: 409 });
    await assert.rejects(deleteTransaction("session", "trip-1", "stop-2"), /Protected historical report/);
  } finally { globalThis.fetch = original; clearApiCache(); }
});

test("authorized deletion monitor deduplicates polls, retries failures, and ignores responses after logout", async () => {
  const original = globalThis.fetch; let calls = 0, changes = 0, version = "job-1", fail = false;
  let resolve: (() => void) | null = null;
  globalThis.fetch = async () => {
    calls++;
    await new Promise<void>((done) => { resolve = done; });
    return new Response(JSON.stringify(fail ? { success: false, message: "Unavailable" } : { success: true, data: { version } }), { status: fail ? 503 : 200 });
  };
  const monitor = createTransactionChangeMonitor("session", () => { changes++; });
  async function check() { const request = monitor.check(); await Promise.resolve(); resolve!(); await request; }
  try {
    const first = monitor.check(); await monitor.check(); assert.equal(calls, 1); resolve!(); await first;
    assert.equal(changes, 1);
    await check(); assert.equal(changes, 1);
    fail = true; await check(); assert.equal(changes, 1);
    fail = false; version = "job-2"; await check(); assert.equal(changes, 2);
    version = "job-3"; const late = monitor.check(); monitor.stop(); resolve!(); await late;
    assert.equal(changes, 2); const before = calls; await monitor.check(); assert.equal(calls, before);
  } finally { monitor.stop(); globalThis.fetch = original; }
});
