import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12,"0")}`;
test("Offload cleanup retries exact owned objects, exposes pending state and never claims failed cleanup completed", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/offload-deletion.service.js");
  const actor = { profileId: id(1), role: "ADMIN" };
  const path = `operations/${id(2)}/offload/${id(4)}/${id(9)}.png`;
  const job = { id: id(10), offload_id: id(4), trip_id: id(2), trip_stop_id: id(3), state: "PENDING_STORAGE", storage_paths: [path], attempts: 0, snapshot: { private: "never returned" } };
  const originalFrom = supabaseAdmin.from, originalRpc = supabaseAdmin.rpc, originalStorage = supabaseAdmin.storage.from;
  let rpcCalls = 0, storageFails = true, ackFails = false, protectedReport = false;
  const removed: string[][] = [];
  (supabaseAdmin as any).rpc = async (name: string, input: unknown) => { rpcCalls++; assert.equal(name,"delete_offload_with_cleanup_v1"); assert.deepEqual(input,{p_offload_id:id(4),p_actor_id:id(1)}); return protectedReport ? { data: null,error: { code: "55000",message: "Protected historical record" } } : {data:{...job},error:null}; };
  (supabaseAdmin.storage as any).from = (bucket: string) => { assert.equal(bucket,"report-receipts"); return { remove: async (paths: string[]) => { removed.push([...paths]); return { error: storageFails ? { message: "failure" } : null }; } }; };
  (supabaseAdmin as any).from = (table: string) => {
    assert.equal(table,"offload_deletion_jobs"); const filters: Array<[string,unknown]> = []; let values: Record<string,unknown> | null = null;
    const chain: any = { select:()=>chain,eq:(key:string,value:unknown)=>{filters.push([key,value]);return chain;},update:(value:Record<string,unknown>)=>{values=value;return chain;},maybeSingle:async()=>{
      if (values && ackFails) return {data:null,error:{code:"XX000"}};
      if (!filters.every(([key,value])=>(job as any)[key]===value)) return {data:null,error:null};
      if(values)Object.assign(job,values);return {data:{...job},error:null};
    }}; return chain;
  };
  try {
    await assert.rejects(service.deleteOffloadPermanently({...actor,role:"TRUCKER"},id(4)),/Only ADMIN or STAFF/);
    await assert.rejects(service.deleteOffloadPermanently(actor,"bad"),/UUID/); assert.equal(rpcCalls,0);
    const pending = await service.deleteOffloadPermanently(actor,id(4));
    assert.equal(pending.cleanup_pending,true);assert.equal(job.state,"PENDING_STORAGE");
    assert.equal("snapshot" in pending,false);assert.equal("storage_paths" in pending,false);
    assert.deepEqual(removed,[[path]]);
    storageFails=false;ackFails=true;
    assert.equal((await service.retryOffloadCleanup(actor,id(10))).cleanup_pending,true,"failed acknowledgement cannot claim completion");
    ackFails=false;
    assert.equal((await service.retryOffloadCleanup(actor,id(10))).cleanup_pending,false);
    const count=removed.length;
    assert.equal((await service.retryOffloadCleanup(actor,id(10))).cleanup_pending,false);
    assert.equal(removed.length,count,"completed operations never remove again");
    protectedReport=true;await assert.rejects(service.deleteOffloadPermanently(actor,id(4)),/Protected historical/);assert.equal(removed.length,count);
    assert.ok(removed.every((paths)=>paths.length===1&&paths[0]===path),"no sibling object or broad prefix can be deleted");
  } finally { (supabaseAdmin as any).from=originalFrom;(supabaseAdmin as any).rpc=originalRpc;(supabaseAdmin.storage as any).from=originalStorage; }
});
