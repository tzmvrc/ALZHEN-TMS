import test from "node:test";
import assert from "node:assert/strict";
import { POD_FIELDS } from "../src/services/pod-interpretation.service.js";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
process.env.SUPABASE_ANON_KEY="isolated-test";
process.env.GEMINI_API_KEY="isolated-fake-key";
process.env.GEMINI_MODEL="gemini-2.5-flash";

test("interpretation enforces role/consent/version/stop ownership, sends only original text, and never writes",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {interpretTripReceipt}=await import("../src/services/trip-receipt.service.js");
 const trip="223e4567-e89b-42d3-a456-426614174000",stop="323e4567-e89b-42d3-a456-426614174000",other="323e4567-e89b-42d3-a456-426614174001",id="423e4567-e89b-42d3-a456-426614174000";
 const receipt={id,trip_id:trip,trip_stop_id:stop,kind:"receipt",ocr_version:1,ocr_text:"DR Number: staff header must stay private\n--- Scanned text ---\nDR 444\nDispatch DSP-1"};
 const seeds:Record<string,Record<string,unknown>[]>={trip_images:[receipt],trips:[{id:trip,dispatch_number:"DSP-1"}],trip_stops:[{id:stop,trip_id:trip,dr_number:"333",dispatch_number:"DSP-1",archived_at:null},{id:other,trip_id:trip,dr_number:"444",dispatch_number:"DSP-1",archived_at:null}]};
 const original=supabaseAdmin.from,originalFetch=globalThis.fetch;let reads=0,calls=0,race=false;
 supabaseAdmin.from=((table:string)=>{
  reads++;const filters:Array<(row:Record<string,unknown>)=>boolean>=[];let single=false,limit=1000;
  const chain={select:()=>chain,order:()=>chain,eq:(k:string,v:unknown)=>{filters.push(row=>row[k]===v);return chain;},is:(k:string,v:unknown)=>{filters.push(row=>(row[k]??null)===v);return chain;},limit:(n:number)=>{limit=n;return chain;},maybeSingle:()=>{single=true;return chain;},then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>{const rows=(seeds[table]??[]).filter(row=>filters.every(f=>f(row))).slice(0,limit).map(row=>({...row}));return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);}};
  return chain;
 }) as typeof original;
 globalThis.fetch=async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body));assert.equal(request.contents[0].parts[0].text,"DR 444\nDispatch DSP-1");
  if(race)receipt.ocr_version++;
  const fields=Object.fromEntries(POD_FIELDS.map(key=>[key,{value:null,evidence:null,uncertain:true}]));fields.dr_number={value:"444",evidence:"DR 444",uncertain:false};fields.dispatch_number={value:"DSP-1",evidence:"Dispatch DSP-1",uncertain:false};
  return new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({fields})}]}}]}));
 };
 const actor={profileId:"fixture-staff",role:"STAFF"},input={external_processing_consent:true,expected_version:1};
 try{
  await assert.rejects(interpretTripReceipt(trip,id,{...actor,role:"TRUCKER"},input),/Only Admin/);assert.equal(reads,0);
  await assert.rejects(interpretTripReceipt(trip,id,actor,{}),/Authorize/);assert.equal(reads,0);
  await assert.rejects(interpretTripReceipt(trip,id,actor,{...input,expected_version:0}),/changed/);assert.equal(calls,0);
  await assert.rejects(interpretTripReceipt("223e4567-e89b-42d3-a456-426614174001",id,actor,input),/not found/);assert.equal(calls,0);
  const result=await interpretTripReceipt(trip,id,actor,input);
  assert.equal(result.linked_stop_mismatch,true);assert.equal(result.matching.suggested?.trip_stop_id,other);assert.equal(result.approved,false);assert.equal(result.persisted,false);assert.equal(receipt.trip_stop_id,stop);
  await interpretTripReceipt(trip,id,actor,input);assert.equal(calls,1,"identical retry must reuse extraction, but revalidate context");
  receipt.ocr_version=2;race=true;await assert.rejects(interpretTripReceipt(trip,id,actor,{...input,expected_version:2}),/changed during/);
  assert.equal(receipt.ocr_text.includes('staff header'),true);
 }finally{supabaseAdmin.from=original;globalThis.fetch=originalFetch;}
});
