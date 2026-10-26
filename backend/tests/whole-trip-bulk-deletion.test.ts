// Prepared regression coverage. Not executed during the performance audit.
import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";
process.env.SUPABASE_ANON_KEY="isolated";
const ids=Array.from({length:125},(_,index)=>`00000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`);
const actor={id:ids[0],role:"ADMIN"};
const credentials={password:undefined,accessToken:"isolated-session",appSessionId:null};

test("125 trips use one confirmation and seven bounded transactions",async()=>{
 const {createWholeTripBulkDeleter}=await import("../src/services/whole-trip-deletion.service.js");
 const before=process.env.WHOLE_TRIP_DELETE_ENABLED;process.env.WHOLE_TRIP_DELETE_ENABLED="true";
 let confirmations=0;const batches:string[][]=[];
 const remove=createWholeTripBulkDeleter(async(_actor,_credentials,commit)=>{confirmations++;return commit();},async(_actor,input)=>{
  const batch=input as string[];batches.push(batch);return {trip_ids:batch,deleted_trips:batch.length,cleanup_pending:batches.length===2,operations:[]};
 });
 try{
  const result=await remove(actor,[...ids,ids[0]],{...credentials});
  assert.equal(confirmations,1);assert.deepEqual(batches.map(batch=>batch.length),[20,20,20,20,20,20,5]);
  assert.deepEqual(result.deleted_trip_ids,ids);assert.equal(result.remaining_trip_ids.length,0);assert.equal(result.cleanup_pending,true);
 }finally{if(before===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=before;}
});
test("a failed second transaction stops and reports only acknowledged deletions",async()=>{
 const {createWholeTripBulkDeleter}=await import("../src/services/whole-trip-deletion.service.js");
 const {ApiError}=await import("../src/utils/api-response.js");
 const before=process.env.WHOLE_TRIP_DELETE_ENABLED;process.env.WHOLE_TRIP_DELETE_ENABLED="true";
 let calls=0;
 const remove=createWholeTripBulkDeleter(async(_actor,_credentials,commit)=>commit(),async(_actor,input)=>{
  calls++;if(calls===2)throw new ApiError("Financial records require retention",409);
  const batch=input as string[];return {trip_ids:batch,deleted_trips:batch.length,cleanup_pending:false,operations:[]};
 });
 try{
  const result=await remove(actor,ids,{...credentials});
  assert.equal(calls,2);assert.deepEqual(result.deleted_trip_ids,ids.slice(0,20));assert.deepEqual(result.remaining_trip_ids,ids.slice(20));assert.equal(result.stopped_status,409);
  await assert.rejects(remove({...actor,role:"STAFF"},ids,{...credentials}));assert.equal(calls,2);
 }finally{if(before===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=before;}
});
