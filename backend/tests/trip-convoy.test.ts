import test from "node:test";
import assert from "node:assert/strict";
import {supabaseAdmin as db} from "../src/config/supabase.js";
import {readTripConvoy,saveTripAllocations,saveAssignmentStops,saveAssignmentStopProgress} from "../src/services/trip-convoy.service.js";
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor={id:uuid(1),role:"ADMIN"},trip=uuid(2),assignment=uuid(3),item=uuid(4);
const change={assignment_id:assignment,trip_line_item_id:item,quantity:10,allocated_cbm:50,expected_version:0};
test("convoy writes reject unauthorized roles and invalid/duplicate targets before RPC",async()=>{
  const old=db.rpc;let calls=0;db.rpc=(async()=>{calls++;throw Error("Unexpected RPC");}) as typeof old;
  try{
    await assert.rejects(saveTripAllocations({...actor,role:"TRUCKER"},trip,[change]),{statusCode:403});
    await assert.rejects(saveTripAllocations(actor,trip,[change,change]),{statusCode:400});
    await assert.rejects(saveTripAllocations(actor,trip,[{...change,allocated_cbm:Infinity}]),{statusCode:400});
    await assert.rejects(saveAssignmentStops(actor,trip,assignment,{scope:"SELECTED",stop_ids:["index-1"],expected_version:0}),{statusCode:400});
    await assert.rejects(saveAssignmentStopProgress(actor,trip,uuid(8),{progress:"UNSUPPORTED",expected_version:1}),{statusCode:400});
    assert.equal(calls,0);
  }finally{db.rpc=old;}
});
test("convoy saves use one atomic RPC, preserve physical IDs, and expose version conflicts",async()=>{
  const old=db.rpc;const calls:any[]=[];let conflict=false;
  db.rpc=(async(name:string,payload:any)=>{calls.push({name,payload});return conflict?{data:null,error:{code:"40001"}}:{data:[{...change,id:uuid(5),trip_id:trip,collaboration_version:1}],error:null};}) as typeof old;
  try{
    const result=await saveTripAllocations(actor,trip,[change]);assert.equal(result[0].id,uuid(5));
    assert.equal(calls[0].name,"save_trip_cargo_allocations_v1");assert.equal(calls[0].payload.p_trip,trip);assert.deepEqual(calls[0].payload.p_changes,[{...change,quantity:"10",allocated_cbm:"50"}]);
    conflict=true;await assert.rejects(saveTripAllocations(actor,trip,[change]),{statusCode:409});
  }finally{db.rpc=old;}
});
test("convoy detail reads page through all physical cargo and retain assignment company relationships",async()=>{
 const old=db.from,oldRpc=db.rpc;const reads:any[]=[];
 db.rpc=(async(name:string,payload:any)=>{assert.equal(name,"read_confirmed_operational_state_batch_v1");assert.deepEqual(payload.p_trips,[trip]);return {data:[],error:null};}) as typeof oldRpc;
 const cargo=Array.from({length:1001},(_,index)=>({id:uuid(1000+index),trip_id:trip}));
 (db as any).from=(table:string)=>{const query:any={select:()=>query,eq:()=>query,order:()=>query,
  maybeSingle:async()=>({data:table==="trips"?{id:trip}:{total_cbm:80,assigned_cbm:0,remaining_cbm:80},error:null}),
  range:async(from:number,to:number)=>{reads.push({table,from,to});const rows=table==="trip_line_items"?cargo:table==="trip_truck_assignments"?[{id:assignment,truck:{trucking_company:{id:uuid(12),name:"Assigned company"}}}]:[];return {data:rows.slice(from,to+1),error:null};}};return query;};
 try{const result=await readTripConvoy(actor,trip);assert.equal(result.cargo.length,1001);assert.equal(result.assignments[0].trucking_company.name,"Assigned company");assert.ok(reads.some(read=>read.table==="trip_line_items"&&read.from===1000));}
 finally{db.from=old;db.rpc=oldRpc;}
});
