import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
process.env.SUPABASE_ANON_KEY="isolated-test";

test("page hydration reads only selected physical reports; protected roles and missing projection cannot fall back to full overview",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {getOperationsPage}=await import("../src/services/operations-report.service.js");
 const trip="00000000-0000-4000-8000-000000000001",stop="00000000-0000-4000-8000-000000000011";
 const reports=Array.from({length:75},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+100).padStart(12,"0")}`,trip_id:trip,trip_stop_id:stop,event_type:"Offload",comments:`Report ${i}`}));
 const seeds:Record<string,Record<string,unknown>[]>={trips:[{id:trip,trip_number:1,warehouse_id:null}],trip_stops:[{id:stop,trip_id:trip,stop_sequence:1}],offloads:reports};
 const calls:Array<{table:string;ids:unknown[]|undefined}>=[];let missing=false;
 const original=supabaseAdmin.from;
 supabaseAdmin.from=((table:string)=>{
   const call={table,ids:undefined as unknown[]|undefined};calls.push(call);
   let start=0,end=999;const filters:Array<(row:Record<string,unknown>)=>boolean>=[];
   const execute=()=>{
    if(table==="v_operations_report_page")return missing?{data:null,error:{code:"42P01"},count:null}:{data:reports.slice(start,end+1).map(r=>({source_type:"OFFLOAD",source_record_id:r.id,trip_id:trip,trip_stop_id:stop,quantity:null,total_cbm:null,dr_number:null,date:null,route:"Warehouse not set → Stop 1 · Stop 1",reported_by:null})),count:75,error:null};
    return {data:(seeds[table]??[]).filter(row=>filters.every(f=>f(row))).slice(start,end+1),error:null};
   };
   const chain={select:()=>chain,order:()=>chain,or:()=>chain,eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return chain;},is:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return chain;},in:(key:string,ids:unknown[])=>{if(key==="id")call.ids=ids;filters.push(row=>ids.includes(row[key]));return chain;},range:(from:number,to:number)=>{start=from;end=to;return chain;},then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve(execute()).then(resolve,reject)};
   return chain;
 }) as typeof original;
 try{
  const admin={profileId:"fixture-admin",role:"ADMIN"};
  const result=await getOperationsPage(admin,{page:"2",limit:"25"});
  assert.equal(result.event_rows.length,25);assert.equal(result.pagination.total,75);assert.equal(result.pagination.totalPages,3);
  assert.deepEqual(result.event_rows.map(r=>r.source_record_id),reports.slice(25,50).map(r=>r.id));
  assert.deepEqual(calls.find(c=>c.table==="offloads")?.ids,reports.slice(25,50).map(r=>r.id));
  assert.ok(!calls.some(c=>["loading_reports","unloading_reports","backloads"].includes(c.table)),"unselected physical sources must not be read");
  const before=calls.length;await assert.rejects(getOperationsPage({profileId:"restricted",role:"TRUCKER"},{}),/Only ADMIN or STAFF/);assert.equal(calls.length,before);
  missing=true;await assert.rejects(getOperationsPage(admin,{}),/not configured/);assert.equal(calls.length,before+1,"missing view must never trigger an overview fallback");
 }finally{supabaseAdmin.from=original;}
});
