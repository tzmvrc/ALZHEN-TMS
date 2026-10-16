import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, "0")}`;

test("transaction service validates exact scope, retries owned images, and reports committed deletion separately from cleanup", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/transaction-deletion.service.js");
  const actor = { id: id(1), role: "ADMIN" };
  const job = { id: id(2), transaction_id: id(4), trip_id: id(3), trip_stop_id: id(4), state: "PENDING_STORAGE", attempts: 0,
    storage_objects: [{ bucket: "report-receipts", path: `operations/${id(3)}/offload/${id(5)}/${id(6)}.png` }], snapshot: { private: true } };
  const original = { rpc: supabaseAdmin.rpc, from: supabaseAdmin.from, storage: supabaseAdmin.storage.from };
  let rpcCalls = 0, fails = true, ackFails = false, rpcError: { code: string; message: string } | null = null;
  const removed: string[][] = [];
  (supabaseAdmin as any).rpc = async (name: string, input: unknown) => {
    rpcCalls++; assert.equal(name, "delete_transaction_with_cleanup_v1");
    assert.deepEqual(input, { p_trip_id: id(3), p_stop_id: id(4), p_actor_id: id(1) });
    return { data: rpcError ? null : { ...job }, error: rpcError };
  };
  (supabaseAdmin.storage as any).from = (bucket: string) => {
    assert.equal(bucket, "report-receipts");
    return { remove: async (paths: string[]) => { removed.push([...paths]); return { error: fails ? { message: "Storage unavailable" } : null }; } };
  };
  (supabaseAdmin as any).from = (table: string) => {
    assert.equal(table, "transaction_deletion_jobs");
    let payload: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    const chain: any = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, update: (value: Record<string, unknown>) => { payload = value; return chain; },
      maybeSingle: async () => {
        if (payload) {
          assert.deepEqual(filters, [["id", id(2)], ["transaction_id", id(4)], ["state", "PENDING_STORAGE"]]);
          if (ackFails) throw new Error("Acknowledgement unavailable");
          Object.assign(job, payload);
        }
        return { data: { ...job }, error: null };
      } };
    return chain;
  };
  try {
    await assert.rejects(service.deleteTransaction({ ...actor, role: "TRUCKER" }, id(3), id(4)), /Only ADMIN or STAFF/);
    await assert.rejects(service.deleteTransaction(actor, "invalid", id(4)));
    await assert.rejects(service.deleteTransaction(actor, id(3), "invalid"));
    assert.equal(rpcCalls, 0);
    rpcError = { code: "55000", message: "Conversion history protects this transaction" };
    await assert.rejects(service.deleteTransaction(actor, id(3), id(4)), /Conversion history/);
    assert.equal(removed.length, 0);
    rpcError = { code: "23503", message: "private database details" };
    await assert.rejects(service.deleteTransaction(actor, id(3), id(4)), /Protected dependencies/);
    rpcError = { code: "23001", message: "PostgreSQL 18 RESTRICT dependency" };
    await assert.rejects(service.deleteTransaction(actor, id(3), id(4)), /Protected dependencies/);
    rpcError = { code: "08006", message: "ambiguous network failure" };
    await assert.rejects(service.deleteTransaction(actor, id(3), id(4)), /Retry this same transaction/);
    rpcError = null;
    let outcome = await service.deleteTransaction(actor, id(3), id(4));
    assert.equal(outcome.cleanup_pending, true); assert.equal("snapshot" in outcome, false);
    assert.deepEqual(removed[0], [job.storage_objects[0].path]);
    fails = false; ackFails = true;
    outcome = await service.retryTransactionCleanup(actor, id(2));
    assert.equal(outcome.cleanup_pending, true); // Never claim completion without DB acknowledgement.
    ackFails = false;
    outcome = await service.retryTransactionCleanup(actor, id(2));
    assert.equal(outcome.cleanup_pending, false);
    const previous = removed.length;
    await service.retryTransactionCleanup(actor, id(2));
    assert.equal(removed.length, previous);
    job.state = "PENDING_STORAGE"; job.storage_objects[0].path = `operations/${id(99)}/offload/${id(5)}/${id(6)}.png`;
    assert.equal((await service.retryTransactionCleanup(actor, id(2))).cleanup_pending, true);
    assert.equal(removed.length, previous); // Never remove sibling/foreign paths.
    job.trip_id = id(99);
    await assert.rejects(service.deleteTransaction(actor, id(3), id(4)), /identity could not be confirmed/);
  } finally {
    supabaseAdmin.rpc = original.rpc; supabaseAdmin.from = original.from; supabaseAdmin.storage.from = original.storage;
  }
});
