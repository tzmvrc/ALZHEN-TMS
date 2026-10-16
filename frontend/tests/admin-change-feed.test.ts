import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ADMIN_CHANGE_TOPICS, createAdminChangeFeed } from "../src/services/admin-change-feed.ts";
import { createDeferredRefresh } from "../src/services/deferred-refresh.ts";

function scheduler() {
  const tasks = new Map<number, () => void>(); let id = 0;
  return { tasks, schedule(callback: () => void) { tasks.set(++id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer: ReturnType<typeof setTimeout>) { tasks.delete(Number(timer)); },
    flush() { const next = [...tasks.values()]; tasks.clear(); next.forEach((callback) => callback()); } };
}
test("signal bursts are deduplicated per topic and do not carry private records", () => {
  const clock = scheduler(), changes: string[][] = [];
  const feed = createAdminChangeFeed({ changed: (topics) => changes.push(topics), snapshot: async () => [], ...clock });
  for (let i = 0; i < 100; i++) feed.push({ topic: "trip_stops", revision: String(i) });
  feed.push({ topic: "offloads", revision: "a" }); feed.push({ topic: "offloads", revision: "a" }); feed.push({ topic: "private_unknown_table", revision: "bad" });
  assert.equal(clock.tasks.size, 1); clock.flush();
  assert.deepEqual(changes, [["trip_stops", "offloads"]]);
  feed.push({ topic: "offloads", revision: "a" }); assert.equal(clock.tasks.size, 0);
  feed.stop(); feed.push({ topic: "offloads", revision: "b" }); clock.flush(); assert.equal(changes.length, 1);
});
test("snapshot recovery deduplicates requests, rejects stale snapshot races and ignores logout responses", async () => {
  const clock = scheduler(), changes: string[][] = []; let calls = 0;
  let resolve!: (rows: Array<{ topic: string; revision: string }>) => void;
  const feed = createAdminChangeFeed({ changed: (topics) => changes.push(topics), snapshot: () => { calls++; return new Promise((done) => { resolve = done; }); }, ...clock });
  const initial = feed.reconcile(); assert.strictEqual(feed.reconcile(), initial); assert.equal(calls, 1);
  feed.push({ topic: "flex_cells", revision: "new" }); resolve([{ topic: "flex_cells", revision: "old" }]); await initial; clock.flush();
  assert.deepEqual(changes, [["flex_cells"]]);
  const latest = feed.reconcile(); resolve([{ topic: "flex_cells", revision: "new" }]); await latest; clock.flush(); assert.equal(changes.length, 1);
  const late = feed.reconcile(); feed.stop(); resolve([{ topic: "flex_cells", revision: "late" }]); await late; clock.flush(); assert.equal(changes.length, 1);
});
test("failed signal snapshots recover on the next check without poisoning other topics", async () => {
  const clock = scheduler(); let fail = true; const changes: string[][] = [];
  const feed = createAdminChangeFeed({ changed: (topics) => changes.push(topics), snapshot: async () => { if (fail) throw new Error("offline"); return [{ topic: "shared_table_column_widths", revision: "saved" }]; }, ...clock });
  await feed.reconcile(); clock.flush(); assert.equal(changes.length, 0);
  fail = false; await feed.reconcile(); clock.flush(); assert.deepEqual(changes, [["shared_table_column_widths"]]); feed.stop();
});
test("deferred invalidation keeps active drafts and coalesces refreshes until editing is released", async () => {
  const clock = scheduler(); let blocked = true, calls = 0;
  const gate = createDeferredRefresh({ blocked: () => blocked, refresh: async () => { calls++; }, ...clock });
  for (let i = 0; i < 50; i++) gate.request(); clock.flush(); await Promise.resolve(); assert.equal(calls, 0);
  blocked = false; clock.flush(); await Promise.resolve(); assert.equal(calls, 1);
  gate.request(); gate.stop(); clock.flush(); await Promise.resolve(); assert.equal(calls, 1);
});
test("migration triggers cover exactly the frontend topic allowlist", () => {
  const sql = readFileSync(new URL("../../backend/migrations/2026_10_23_admin_change_signals.sql", import.meta.url), "utf8");
  const array = sql.split("FOREACH v_table IN ARRAY ARRAY[")[1].split("] LOOP")[0];
  const names = [...array.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [...ADMIN_CHANGE_TOPICS].sort()); assert.equal(new Set(names).size, 51);
  assert.ok(!sql.includes("GRANT SELECT ON public.profiles"));
});

test("deferred refresh resumes after StrictMode effect cleanup and cancels old timers", async () => {
  const clock = scheduler(); let calls = 0;
  const gate = createDeferredRefresh({ blocked: () => false, refresh: () => { calls++; }, ...clock });
  gate.request(); gate.stop(); assert.equal(clock.tasks.size, 0);
  gate.resume(); gate.request(); clock.flush(); await Promise.resolve();
  assert.equal(calls, 1); gate.stop();
});
