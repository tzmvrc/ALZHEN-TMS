import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("request envelope validates keys and does not let retry metadata enter editable report fields", async () => {
  const { submissionRequest } = await import("../src/services/operations-submission.service.js");
  const input = { request_id: id(1), reason: "Two\nlines" };
  assert.deepEqual(submissionRequest(input), { requestId:id(1),body:{reason:"Two\nlines"} });
  assert.equal(input.request_id,id(1));
  for (const value of ["bad",null,4]) assert.throws(()=>submissionRequest({request_id:value}),/UUID/);
});

test("durable report RPC binds actor, request, type and exact payload; no second write fallback",async()=>{
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const {submitReportOnce}=await import("../src/services/operations-submission.service.js");
  const original=supabaseAdmin.rpc; const calls:any[]=[];
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{calls.push({name,args});return {data:{id:id(10)},error:null};};
  try {
    for(const type of ["OFFLOAD","BACKLOAD"] as const) await submitReportOnce({profileId:id(1),role:"TRUCKER"},id(2),type,{reason:"R"},{trip_id:id(3),trip_stop_id:id(4)});
    assert.equal(calls.length,2);
    for(const call of calls){assert.equal(call.name,"submit_operations_report_v1");assert.equal(call.args.p_actor,id(1));assert.equal(call.args.p_request,id(2));assert.equal(call.args.p_report.trip_stop_id,id(4));}
    (supabaseAdmin as any).rpc=async()=>({data:null,error:{code:"40001"}});
    await assert.rejects(submitReportOnce({profileId:id(1),role:"ADMIN"},id(2),"OFFLOAD",{},{}),/different content/);
  }finally{(supabaseAdmin as any).rpc=original;}
});

test("database validation errors allow correction while transient failures retain retry identity",async()=>{
  const { submissionError }=await import("../src/services/operations-submission.service.js");
  for(const code of ["22023","22P02","23514"]){assert.throws(()=>submissionError({code},"save"),(error:any)=>error.statusCode===400&&error.code==="INVALID_REPORT_SUBMISSION");}
  assert.throws(()=>submissionError({code:"XX000"},"save"),(error:any)=>error.statusCode===502);
});

test("HTTP report submissions require a durable client key before reaching the database",async()=>{
  const controller=await import("../src/controllers/operations-report.controller.js");
  for(const handler of [controller.createOffload,controller.createBackload,controller.submitEvent]){
    let status=0;let body:any;
    const response:any={status(value:number){status=value;return response;},json(value:unknown){body=value;return response;}};
    await handler({body:{trip_id:id(10),reason:"valid"},appSession:{profileId:id(1),role:"ADMIN"}} as any,response);
    assert.equal(status,400);assert.equal(body.success,false);
  }
});

test("Storage retry retains reservation on upload/confirmation failures and verifies existing bytes",async()=>{
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const {uploadReceiptOnce}=await import("../src/services/operations-submission.service.js");
  const rpc=supabaseAdmin.rpc, storage=supabaseAdmin.storage.from;
  const bytes=Buffer.from("synthetic-image"), hash=createHash("sha256").update(bytes).digest("hex");
  let ready=false,exists=false,failUpload=true,failConfirm=false,wrongBytes=false,uploads=0,completions=0;
  const reservation={id:id(8),trip_id:id(3),trip_stop_id:id(4),storage_path:"private/reserved/path",upload_sha256:hash,upload_request_id:id(2)};
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{
    if(name==="reserve_operations_receipt_v1"){
      assert.equal(args.p_actor,id(1));assert.equal(args.p_request,id(2));assert.equal(args.p_record,id(5));assert.equal(args.p_sha256,hash);
      return {data:{...reservation,upload_status:ready?"READY":"PENDING"},error:null};
    }
    assert.equal(name,"complete_operations_receipt_v1");completions++;
    if(failConfirm){failConfirm=false;return {data:null,error:{code:"XX000"}};}
    ready=true;return {data:{...reservation,upload_status:"READY"},error:null};
  };
  (supabaseAdmin.storage as any).from=()=>({
    upload:async(_path:string,_bytes:Buffer,options:any)=>{assert.equal(options.upsert,false);uploads++;if(failUpload||exists)return {error:{message:"mock failure"}};exists=true;return {error:null};},
    download:async()=>exists?{data:new Blob([wrongBytes?Buffer.from("wrong"):bytes]),error:null}:{data:null,error:{message:"not found"}},
    remove:()=>{throw Error("must never remove recoverable reservation bytes");},
  });
  const upload=()=>uploadReceiptOnce({profileId:id(1),role:"TRUCKER"},"OFFLOAD",id(5),bytes,"image/png","proof.png",id(2));
  try{
    await assert.rejects(upload(),/incomplete/);assert.equal(completions,0);
    failUpload=false;failConfirm=true;
    await assert.rejects(upload(),/confirm the report image/);assert.equal(exists,true);
    wrongBytes=true;await assert.rejects(upload(),/incomplete/);assert.equal(ready,false);
    wrongBytes=false;const recovered=await upload();assert.equal(recovered.upload_status,"READY");
    assert.equal("storage_path" in recovered,false);assert.equal("upload_sha256" in recovered,false);
    const prior=uploads;await upload();assert.equal(uploads,prior,"READY replay makes no Storage request");
  }finally{(supabaseAdmin as any).rpc=rpc;(supabaseAdmin.storage as any).from=storage;}
});
