import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
test("POD decision gates schema activation, validates review data, targets stored stop, confirms canonical identity and never performs split writes",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {decidePodReceipt,validatePodDecision,podReviewCapabilities}=await import("../src/services/pod-review.service.js");
 const actor={profileId:"00000000-0000-4000-8000-000000000001",role:"STAFF"},trip="00000000-0000-4000-8000-000000000010",stop="00000000-0000-4000-8000-000000000100",receipt="00000000-0000-4000-8000-000000000200";
 const input={request_id:"00000000-0000-4000-8000-000000000300",decision:"REJECTED",reason:"Unreadable",reviewed_fields:{quantity:0,dr_number:"333"},expected_review_version:0,expected_ocr_version:2};
 let calls=0,code:string|null=null,wrong=false;
 const original=supabaseAdmin.from,originalRpc=supabaseAdmin.rpc,storage=supabaseAdmin.storage.from,oldFlag=process.env.POD_REVIEW_ENABLED;
 supabaseAdmin.from=((table:string)=>{calls++;assert.equal(table,"trip_images");const chain={select:()=>chain,eq:()=>chain,maybeSingle:()=>Promise.resolve({data:{id:receipt,trip_id:trip,trip_stop_id:stop,kind:"receipt",pod_review_status:"REJECTED",pod_review_version:1,ocr_version:2,storage_path:"fixture.png"},error:null})};return chain;}) as typeof original;
 supabaseAdmin.rpc=(async(_name:string,params:Record<string,unknown>)=>{calls++;assert.equal(_name,"review_pod_receipt_v1");assert.equal(params.p_stop_id,stop);assert.equal(params.p_actor_id,actor.profileId);assert.equal(params.p_request_id,input.request_id);return code?{data:null,error:{code,message:"Fixture conflict"}}:{data:{receipt_id:wrong?"other":receipt,trip_id:trip,trip_stop_id:stop,request_id:input.request_id,status:"REJECTED",review_version:1,event_id:input.request_id,notification_id:input.request_id},error:null};}) as typeof originalRpc;
 supabaseAdmin.storage.from=(()=>({createSignedUrl:async()=>({data:{signedUrl:"https://isolated.test/fixture"},error:null})})) as typeof storage;
 try{
  delete process.env.POD_REVIEW_ENABLED;assert.deepEqual(podReviewCapabilities(actor),{enabled:false});
  await assert.rejects(decidePodReceipt(actor,trip,receipt,input),/awaiting/);assert.equal(calls,0);
  await assert.rejects(decidePodReceipt({...actor,role:"TRUCKER"},trip,receipt,input),/Only Admin/);assert.equal(calls,0);
  assert.throws(()=>validatePodDecision({...input,reason:""}),/reason/);assert.throws(()=>validatePodDecision({...input,reviewed_fields:{trip_id:trip}}));assert.throws(()=>validatePodDecision({...input,reviewed_fields:{delivery_date:"2026-02-31"}}));assert.equal(validatePodDecision(input).reviewed_fields.quantity,0);
  process.env.POD_REVIEW_ENABLED="true";
  const result=await decidePodReceipt(actor,trip,receipt,{...input,trip_stop_id:"wrong-client-stop"});assert.equal(result.receipt.id,receipt);assert.equal(result.receipt.pod_review_status,"REJECTED");
  code="PGRST202";await assert.rejects(decidePodReceipt(actor,trip,receipt,input),/migration/);
  code="40001";await assert.rejects(decidePodReceipt(actor,trip,receipt,input),/conflict/);
  code=null;wrong=true;await assert.rejects(decidePodReceipt(actor,trip,receipt,input),/identity/);
 }finally{supabaseAdmin.from=original;supabaseAdmin.rpc=originalRpc;supabaseAdmin.storage.from=storage;if(oldFlag===undefined)delete process.env.POD_REVIEW_ENABLED;else process.env.POD_REVIEW_ENABLED=oldFlag;}
});
