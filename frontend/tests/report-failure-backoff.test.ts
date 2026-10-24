import assert from "node:assert/strict";
import test from "node:test";
import {clearApiCache} from "../src/services/api.service.ts";
import {clearReportPageCache,fetchReportCollection,fetchReportPage,fetchReportTripRows,getInitialReportPageOptions,invalidateReportData,retryReportRead} from "../src/services/report.service.ts";

test("targeted trip refreshes share failure backoff and explicit Retry recovers",async()=>{
 const original=globalThis.fetch;clearApiCache();clearReportPageCache();let reads=0,fail=true;
 globalThis.fetch=async input=>{
  if(String(input).includes('/columns'))return new Response(JSON.stringify({success:true,data:{columns:[]}}));
  reads++;return new Response(JSON.stringify(fail?{success:false}:{success:true,data:{rows:[],pagination:{page:1,limit:200,total:0,totalPages:0}}}),{status:fail?503:200});
 };
 const options=getInitialReportPageOptions("dispatch-monitoring");
 try{
  await assert.rejects(fetchReportTripRows("dispatch-monitoring","a",options,"trip-a"));
  invalidateReportData("dispatch-monitoring");
  await assert.rejects(fetchReportTripRows("dispatch-monitoring","a",options,"trip-a"));assert.equal(reads,1);
  fail=false;retryReportRead("dispatch-monitoring","a");assert.deepEqual(await fetchReportTripRows("dispatch-monitoring","a",options,"trip-a"),[]);assert.equal(reads,2);
 }finally{globalThis.fetch=original;clearApiCache();clearReportPageCache();}
});

test("failed report reads are deduplicated and realtime invalidation cannot create a retry storm",async()=>{
  const old=globalThis.fetch;clearApiCache();clearReportPageCache();let reads=0,fail=true;
  globalThis.fetch=async(input)=>{
    if(String(input).includes('/columns'))return new Response(JSON.stringify({success:true,data:{columns:[]}}));
    reads++;return fail?new Response(JSON.stringify({success:false,message:"The report query took too long.",error:{code:"REPORT_READ_TIMEOUT"}}),{status:503}):new Response(JSON.stringify({success:true,data:{rows:[],pagination:{page:1,limit:200,total:0,totalPages:1}}}));
  };
  const options={...getInitialReportPageOptions("dispatch-monitoring"),filters:{source_lines:"true"}};
  try{
    const burst=await Promise.allSettled(Array.from({length:5},()=>fetchReportCollection("dispatch-monitoring","user-a",options)));
    assert.ok(burst.every(result=>result.status==="rejected"));assert.equal(reads,1);
    for(let n=0;n<3;n++){
      invalidateReportData("dispatch-monitoring");
      await assert.rejects(fetchReportCollection("dispatch-monitoring","user-a",options,undefined,true),/took too long/);
    }
    assert.equal(reads,1,"background refresh must respect the cooldown even with a refresh flag");
    fail=false;retryReportRead("dispatch-monitoring","user-a");
    assert.equal((await fetchReportCollection("dispatch-monitoring","user-a",options)).rows.length,0);
    assert.equal(reads,2,"explicit Retry should work immediately");
  }finally{globalThis.fetch=old;clearApiCache();clearReportPageCache();}
});

test("failure backoff is scoped to the exact user and query and is cleared on logout",async()=>{
  const old=globalThis.fetch;clearApiCache();clearReportPageCache();let reads=0;
  globalThis.fetch=async(input)=>String(input).includes('/columns')?new Response(JSON.stringify({success:true,data:{columns:[]}})):(reads++,new Response(JSON.stringify({success:false,message:"Unavailable"}),{status:500}));
  const options=getInitialReportPageOptions("combined");
  try{
    await assert.rejects(fetchReportPage("combined","a",options));
    await assert.rejects(fetchReportPage("combined","a",options));assert.equal(reads,1);
    await assert.rejects(fetchReportPage("combined","b",options));assert.equal(reads,2);
    await assert.rejects(fetchReportPage("combined","a",{...options,search:"different"}));assert.equal(reads,3);
    clearReportPageCache();clearApiCache();await assert.rejects(fetchReportPage("combined","a",options));assert.equal(reads,4);
  }finally{globalThis.fetch=old;clearApiCache();clearReportPageCache();}
});
