import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";
process.env.SUPABASE_ANON_KEY="isolated";

test("record bulk deletion binds a fresh confirmation to deduplicated immutable physical IDs",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {createOperationsReportDeleter,deleteOperationsReports}=await import("../src/services/operations-report.service.js");
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
 const old=supabaseAdmin.rpc,calls:string[]=[];let confirmations=0;
 let entered!:()=>void,release!:()=>void;
 const waiting=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 supabaseAdmin.rpc=(async(name:string,args:Record<string,string>)=>{
  assert.equal(name,"delete_offload_with_cleanup_v1");assert.equal(args.p_actor_id,id(1));calls.push(args.p_offload_id);
  return {error:null,data:{id:id(9),offload_id:args.p_offload_id,trip_id:id(10),trip_stop_id:id(11),state:"COMPLETE",storage_paths:[],attempts:0}};
 }) as typeof old;
 try{
  const actor={profileId:id(1),role:"STAFF"},targets=[{source_type:"OFFLOAD",record_id:id(2)},{source_type:"OFFLOAD",record_id:id(2)},{source_type:"OFFLOAD",record_id:id(3)}];
  const remove=createOperationsReportDeleter(async(owner,_credentials,commit)=>{confirmations++;assert.deepEqual(owner,{id:id(1),role:"STAFF"});entered();await gate;return commit();});
  const request=remove(actor,targets,{password:"fixture",accessToken:"fixture",appSessionId:null});
  await waiting;targets[0].record_id=id(8);actor.profileId=id(7);release();
  const response=await request;assert.equal(confirmations,1);assert.deepEqual(calls,[id(2),id(3)]);assert.equal(response.outcomes.length,2);
  await assert.rejects(remove(actor,Array.from({length:21},()=>targets[0]),{password:"fixture",accessToken:"fixture",appSessionId:null}),/1 and 20/);
  await assert.rejects(deleteOperationsReports({profileId:id(1),role:"ADMIN"},[{source_type:"OFFLOAD",record_id:id(2)}],{password:undefined,accessToken:"fixture",appSessionId:null}),/current account password/);
  await assert.rejects(deleteOperationsReports({profileId:id(1),role:"TRUCKER"},[{source_type:"OFFLOAD",record_id:id(2)}],{password:"fixture",accessToken:"fixture",appSessionId:null}),/Only ADMIN or STAFF/);
  assert.equal(calls.length,2);
 }finally{supabaseAdmin.rpc=old;}
});
