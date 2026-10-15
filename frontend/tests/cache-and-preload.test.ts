import assert from "node:assert/strict";
import test from "node:test";
import { apiGetCached, clearApiCache, invalidateApiCache } from "../src/services/api.service.ts";
import { runBackgroundPreload } from "../src/services/background-preload.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("cached API reads deduplicate and invalidated pending responses cannot replace newer values", async () => {
  clearApiCache();
  const originalFetch = globalThis.fetch;
  const oldRequest = deferred<Response>();
  const newRequest = deferred<Response>();
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? oldRequest.promise : newRequest.promise;
  try {
    const first = apiGetCached<{ version: number }>("/trips/test", "user-a");
    const simultaneous = apiGetCached<{ version: number }>("/trips/test", "user-a");
    assert.equal(requests, 1);
    invalidateApiCache("/trips");
    const newer = apiGetCached<{ version: number }>("/trips/test", "user-a");
    newRequest.resolve(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
    assert.deepEqual(await newer, { version: 2 });
    oldRequest.resolve(new Response(JSON.stringify({ version: 1 }), { status: 200 }));
    assert.deepEqual(await first, { version: 2 });
    assert.deepEqual(await simultaneous, { version: 2 });
    assert.deepEqual(await apiGetCached("/trips/test", "user-a"), { version: 2 });
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; clearApiCache(); }
});

test("logout discards pending data and cached responses remain isolated by user token", async () => {
  clearApiCache();
  const originalFetch = globalThis.fetch;
  const pending = deferred<Response>();
  globalThis.fetch = async () => pending.promise;
  try {
    const oldSession = apiGetCached("/reports/test", "user-a");
    const rejected = assert.rejects(oldSession, /session changed/);
    clearApiCache();
    pending.resolve(new Response(JSON.stringify({ user: "a" }), { status: 200 }));
    await rejected;
    let requests = 0;
    globalThis.fetch = async () => new Response(JSON.stringify({ request: ++requests }), { status: 200 });
    assert.deepEqual(await apiGetCached("/reports/test", "user-a"), { request: 1 });
    assert.deepEqual(await apiGetCached("/reports/test", "user-b"), { request: 2 });
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; clearApiCache(); }
});

test("background preload bounds concurrency, isolates errors and cancels queued work on a session change", async () => {
  let active = 0;
  let peak = 0;
  let started = 0;
  let current = true;
  const release = deferred<void>();
  const queue = runBackgroundPreload(Array.from({ length: 8 }, (_, index) => async () => {
    started += 1;
    active += 1;
    peak = Math.max(peak, active);
    await release.promise;
    active -= 1;
    if (index === 0) throw new Error("one failed resource");
  }), 2, () => current);
  assert.equal(started, 2);
  current = false;
  release.resolve();
  await queue;
  assert.equal(peak, 2);
  assert.equal(started, 2, "six queued requests never start after logout");
  const completed: number[] = [];
  await runBackgroundPreload([async () => { throw new Error("failed"); }, async () => { completed.push(1); }], 1, () => true);
  assert.deepEqual(completed, [1]);
});
