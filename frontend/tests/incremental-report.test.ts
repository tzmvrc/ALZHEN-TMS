import test from "node:test";
import assert from "node:assert/strict";
import { clearReportPageCache,fetchReportCollection,fetchNextReportCollection,getReportCollection,getInitialReportPageOptions,updateReportCollection } from "../src/services/report.service";
import { clearApiCache } from "../src/services/api.service";
import { clearSharedWidths,refreshSharedWidths,readSharedWidths } from "../src/services/shared-table-widths";
import { refreshSharedDesign } from "../src/services/shared-table-design";

test("Master loads one page, dedupes next-page readers, preserves newer values and exposes all remaining pages on demand",async()=>{
 const old=globalThis.fetch,pages:number[]=[];clearApiCache();clearReportPageCache();
 globalThis.fetch=async(input)=>{const u=new URL(String(input));if(u.pathname.endsWith("/columns"))return new Response(JSON.stringify({success:true,data:{columns:[]}}));const n=Number(u.searchParams.get("page"));pages.push(n);await new Promise(r=>setTimeout(r,5));return new Response(JSON.stringify({success:true,data:{rows:[{trip_id:"trip-"+n,trip_stop_id:"stop-"+n,dispatch_number:"DSP-"+n}],pagination:{page:n,limit:200,total:20000,totalPages:100}}}));};
 try{const opts=getInitialReportPageOptions("dispatch-monitoring");const first=await fetchReportCollection("dispatch-monitoring","incremental",opts);assert.deepEqual(pages,[1]);assert.equal(first.collection?.totalPages,100);assert.equal(first.pagination.total,20000);
 updateReportCollection("dispatch-monitoring","incremental",opts,rows=>rows.map(row=>({...row,dispatch_number:"newer"})));
 await Promise.all(Array.from({length:10},()=>fetchNextReportCollection("dispatch-monitoring","incremental",opts)));assert.deepEqual(pages,[1,2]);const result=getReportCollection("dispatch-monitoring","incremental",opts)!;assert.equal(result.rows[0].dispatch_number,"newer");assert.equal(result.rows.length,2);assert.equal(result.collection?.page,2);assert.equal(result.pagination.total,20000);
 await fetchReportCollection("dispatch-monitoring","incremental",opts);assert.deepEqual(pages,[1,2],"cached return must not start a history sweep");
 }finally{globalThis.fetch=old;clearReportPageCache();clearApiCache();}
});
test("width and formatting hydration share one authorized versioned layout read",async()=>{
 const old=globalThis.fetch;clearSharedWidths();let gets=0;
 globalThis.fetch=async()=>{gets++;await new Promise(r=>setTimeout(r,5));return new Response(JSON.stringify({success:true,data:[{column_key:"dispatch",width_px:180,revision:1,design:{color:"#abcdef"}}]}));};
 try{await Promise.all([refreshSharedWidths("layout-test","trips"),refreshSharedDesign("layout-test","trips")]);assert.equal(gets,1);assert.equal(readSharedWidths("layout-test","trips").widths.dispatch,180);}finally{globalThis.fetch=old;clearSharedWidths();}
});
