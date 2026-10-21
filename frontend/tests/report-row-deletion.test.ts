import test from "node:test";
import assert from "node:assert/strict";
import { reportLineItemDeletionTargets } from "../src/services/report-row-actions";
import { deleteSelectedLineItems } from "../src/services/trip.service";
const trip="123e4567-e89b-42d3-a456-000000000010",stop="123e4567-e89b-42d3-a456-000000000011",item="123e4567-e89b-42d3-a456-000000000012";
const row={trip_id:trip,trip_stop_id:stop,trip_line_item_id:item};
test("child delete requires exact physical scope and deduplicates projections",()=>{
 for(const sheet of ["dispatch-monitoring","dispatch","trip-booking"] as const){
  assert.deepEqual(reportLineItemDeletionTargets(sheet,[row,{...row}]),[{tripId:trip,stopId:stop,id:item}]);
  assert.equal(reportLineItemDeletionTargets(sheet,[{trip_id:trip,trip_stop_id:stop}]),null);
  assert.equal(reportLineItemDeletionTargets(sheet,[row,{...row,trip_id:stop}]),null);
 }
});
test("calls and issue projections never offer a cargo or parent fallback",()=>{
 assert.equal(reportLineItemDeletionTargets("store-calling",[{...row,store_call_id:item}]),null);
 for(const key of ["incident_id","backload_id","offload_id"]){assert.equal(reportLineItemDeletionTargets("dispatch",[{...row,[key]:item}]),null);}
});
test("bulk child deletion targets only exact endpoints and retains failed targets",async()=>{
 const original=globalThis.fetch,paths:string[]=[];
 globalThis.fetch=async(input)=>{const path=String(input);paths.push(path);return new Response(JSON.stringify(path.endsWith(item)?{success:true,data:{id:item}}:{success:false,message:"fixture protected"}),{status:path.endsWith(item)?200:409});};
 try{const target={tripId:trip,stopId:stop,id:item},failed={...target,id:trip};const result=await deleteSelectedLineItems("fixture",[target,target,failed]);
 assert.deepEqual(result.deleted,[target]);assert.deepEqual(result.failed,[failed]);assert.equal(paths.length,2);
 assert.ok(paths.every(path=>path.includes(`/trips/${trip}/stops/${stop}/line-items/`)));
 }finally{globalThis.fetch=original;}
});
