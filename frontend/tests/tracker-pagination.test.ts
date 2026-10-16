import assert from "node:assert/strict";
import test from "node:test";
import {trackerPageEndpoint,fetchTrackerPage,fetchPagedTrackerExportRows} from "../src/services/transmittal-tracker.service.ts";
import {clearApiCache} from "../src/services/api.service.ts";
test("Tracker page cache isolates parameters and tokens and deduplicates same-page navigation",async()=>{
 clearApiCache();const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(input)=>{calls.push(String(input));await new Promise(resolve=>setTimeout(resolve,5));return new Response(JSON.stringify({success:true,data:{rows:[],pagination:{page:1,limit:50,total:0,totalPages:1}}}),{status:200});};
 try {
  assert.equal(new URL(trackerPageEndpoint({page:2,limit:25,search:"DR & 2",filterBy:"status",filter:"Completed"}),"http://fixture").searchParams.get("search"),"DR & 2");
  const first=await Promise.all([fetchTrackerPage("owner"),fetchTrackerPage("owner")]);assert.strictEqual(first[0],first[1]);assert.equal(calls.length,1);
  await fetchTrackerPage("owner");assert.equal(calls.length,1);
  await fetchTrackerPage("owner",{page:2});await fetchTrackerPage("other");assert.equal(calls.length,3);
 } finally {globalThis.fetch=original;clearApiCache();}
});

test("explicit Tracker export uses bounded fresh pages and rejects drift or oversize",async()=>{
 const original=globalThis.fetch;let mode="normal";const calls:string[]=[];
 globalThis.fetch=async(input)=>{const url=new URL(String(input));calls.push(url.href);const page=Number(url.searchParams.get("page"));return new Response(JSON.stringify({success:true,data:{rows:[{trip_stop_id:mode==="duplicate"?"same":"stop-"+page}],pagination:{page,limit:100,total:mode==="large"?20001:mode==="drift"&&page===2?3:2,totalPages:2}}}),{status:200});};
 try {
  assert.equal((await fetchPagedTrackerExportRows("owner",{reference:"REF-1"})).length,2);assert.equal(calls.length,2);assert.ok(calls.every(url=>new URL(url).searchParams.get("limit")==="100"&&new URL(url).searchParams.get("reference")==="REF-1"));
  mode="drift";await assert.rejects(fetchPagedTrackerExportRows("owner"),/changed during export/);
  mode="large";await assert.rejects(fetchPagedTrackerExportRows("owner"),/20,000/);
  mode="duplicate";await assert.rejects(fetchPagedTrackerExportRows("owner"),/rows changed/);
 }finally{globalThis.fetch=original;}
});
