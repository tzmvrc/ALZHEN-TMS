import assert from "node:assert/strict";
import test from "node:test";
test("canonical record reads allow only physical sources and whitelisted spreadsheet values",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {readCollaborationRecord}=await import("../src/services/collaboration-record.service.js");
 const original=supabaseAdmin.from,id="123e4567-e89b-42d3-a456-000000000012";let calls=0,missing=false,failed=false;
 (supabaseAdmin as any).from=(source:string)=>{calls++;assert.equal(source,"trip_stops");const chain:any={select:()=>chain,eq:(key:string,value:string)=>{assert.equal(key,"id");assert.equal(value,id);return chain;},maybeSingle:async()=>({data:missing?null:{id,trip_id:"parent",dispatch_number:"saved",quantity:0,remarks:null,collaboration_version:2,private_storage_path:"private",unrelated_sensitive_value:"secret"},error:failed?{code:"42501"}:null})};return chain;};
 try{
  const record=await readCollaborationRecord("trip_stops",id);assert.equal(record.quantity,0);assert.equal(record.remarks,null);assert.equal(record.collaboration_version,2);assert.equal(Object.hasOwn(record,"private_storage_path"),false);assert.equal(Object.hasOwn(record,"unrelated_sensitive_value"),false);
  for(const source of ["profiles","v_tms_combined","constructor","offloads"])await assert.rejects(readCollaborationRecord(source,id),/Invalid physical/);
  await assert.rejects(readCollaborationRecord("trip_stops","not-a-uuid"),/Invalid physical/);assert.equal(calls,1);
  missing=true;await assert.rejects(readCollaborationRecord("trip_stops",id),/no longer exists/);missing=false;
  failed=true;await assert.rejects(readCollaborationRecord("trip_stops",id),/Unable to read/);
 }finally{supabaseAdmin.from=original;}
});
