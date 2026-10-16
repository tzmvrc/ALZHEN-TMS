import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

test("change recovery reads bounded metadata only and rejects restricted roles before a database call", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { listAdminChangeSignals } = await import("../src/services/admin-change.service.js");
  const original = supabaseAdmin.from; let reads = 0, fail = false;
  (supabaseAdmin as any).from = (table: string) => {
    reads++; assert.equal(table, "admin_change_signals");
    const query = { select: (fields: string) => { assert.equal(fields, "topic,revision"); return query; }, order: (key: string) => { assert.equal(key, "topic"); return query; }, limit: async (limit: number) => { assert.equal(limit, 100); return { data: fail ? null : [{ topic: "trip_stops", revision: "opaque-revision" }], error: fail ? { message: "private SQL failure" } : null }; } };
    return query;
  };
  try {
    await assert.rejects(listAdminChangeSignals({ role: "TRUCKER" }), /Only ADMIN or STAFF/); assert.equal(reads, 0);
    assert.deepEqual(await listAdminChangeSignals({ role: "ADMIN" }), [{ topic: "trip_stops", revision: "opaque-revision" }]);
    assert.equal((await listAdminChangeSignals({ role: "STAFF" })).length, 1);
    fail = true; await assert.rejects(listAdminChangeSignals({ role: "STAFF" }), (error: unknown) => error instanceof Error && /temporarily unavailable/.test(error.message) && !error.message.includes("private SQL"));
  } finally { supabaseAdmin.from = original; }
});
