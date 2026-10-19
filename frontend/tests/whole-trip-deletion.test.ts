import test from "node:test";
import assert from "node:assert/strict";
import {selectedParentTripIds,selectedParentTripCount,deleteWholeTrips} from "../src/services/whole-trip-deletion.ts";
import {apiGetCached,clearApiCache,getCachedApiResponse} from "../src/services/api.service.ts";
const one="123e4567-e89b-42d3-a456-000000000001",two="123e4567-e89b-42d3-a456-000000000002";
test("Combined and Tracker selections resolve unique exact parents, rejecting missing or display identities",()=>{
 assert.deepEqual(selectedParentTripIds([{trip_id:one},{trip_id:one},{trip_id:two}]),[one,two]);
 for(const rows of [[],[undefined],[{trip_id:"DR-333"}],[{trip_id:one},undefined]])assert.equal(selectedParentTripIds(rows),null);
});
test("bulk scope reports exact unique parents and never silently truncates a batch exceeding the atomic RPC limit",()=>{
 const rows=Array.from({length:21},(_,i)=>({trip_id:`123e4567-e89b-42d3-a456-${String(i+1).padStart(12,"0")}`}));
 assert.equal(selectedParentTripCount(rows),21);assert.equal(selectedParentTripIds(rows),null);
 assert.equal(selectedParentTripCount([rows[0],rows[0],rows[1]]),2);
 assert.equal(selectedParentTripIds(rows.slice(0,20))?.length,20);
});
test("missing passwords never issue a deletion request and synthetic passwords stay only in the POST body",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.ok(!String(input).includes("synthetic-password"));assert.deepEqual(JSON.parse(String(init?.body)),{trip_ids:[one],current_password:"synthetic-password"});return new Response(JSON.stringify({success:true,data:{cleanup_pending:false}}),{status:200});};
 try{await assert.rejects(deleteWholeTrips("fixture",[one],""),/password/);assert.equal(calls,0);await deleteWholeTrips("fixture",[one],"synthetic-password");assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test("confirmed whole-trip success invalidates every affected feature, retains unrelated cache and fails closed on an unconfirmed write",async()=>{
 const original=globalThis.fetch;clearApiCache();const paths=["/trips?limit=100","/reports/combined/page","/reports/operations/page","/reports/transmittal-tracker/page","/dashboard/summary","/tracking/roads","/truckers/assigned","/users"];let confirmed=true;
 globalThis.fetch=async(input,init)=>new Response(JSON.stringify(init?.method==="POST"?{success:true,data:confirmed?{cleanup_pending:true}:{}}:{success:true,data:{path:String(input)}}),{status:200});
 try{await Promise.all(paths.map(path=>apiGetCached(path,"fixture")));await deleteWholeTrips("fixture",[one],"isolated-password");for(const path of paths.slice(0,-1))assert.equal(getCachedApiResponse(path,"fixture"),null,path);assert.ok(getCachedApiResponse("/users","fixture"));confirmed=false;await assert.rejects(deleteWholeTrips("fixture",[one],"isolated-password"),/not confirmed/);}finally{globalThis.fetch=original;clearApiCache();}
});

test("concurrent confirmations and remounts reuse only the pending exact-session batch",async()=>{
 const original=globalThis.fetch;let calls=0,release=()=>{};
 globalThis.fetch=async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});return new Response(JSON.stringify({success:true,data:{cleanup_pending:false,deleted_trips:2}}),{status:200});};
 try{
  const first=deleteWholeTrips("fixture-concurrent",[one,two,one],"synthetic-password");
  const second=deleteWholeTrips("fixture-concurrent",[two,one],"synthetic-password");
  assert.equal(calls,1);release();assert.deepEqual(await first,await second);
  const retry=deleteWholeTrips("fixture-concurrent",[one,two],"fresh-password");assert.equal(calls,2);release();await retry;
 }finally{globalThis.fetch=original;}
});

test("failed confirmations can retry and never reuse authorization across accounts",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({success:false,message:"Incorrect password"}),{status:403});};
 try{
  await assert.rejects(deleteWholeTrips("fixture-account-a",[one],"wrong-password"));
  await assert.rejects(deleteWholeTrips("fixture-account-a",[one],"another-password"));
  await assert.rejects(deleteWholeTrips("fixture-account-b",[one],"own-password"));
  assert.equal(calls,3);
 }finally{globalThis.fetch=original;}
});
