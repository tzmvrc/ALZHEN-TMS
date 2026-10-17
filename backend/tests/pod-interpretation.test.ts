import test from "node:test";
import assert from "node:assert/strict";
import {createPodInterpreter,matchPodTransaction,POD_FIELDS,validatePodInterpretation} from "../src/services/pod-interpretation.service.js";

const text="Dispatch DSP-1\nDR 333\nQuantity 0\nReceiver Test Receiver";
const output=()=>({fields:Object.fromEntries(POD_FIELDS.map(key=>[key,{value:null,evidence:null,uncertain:true}]))}) as {fields:Record<string,{value:string|number|null;evidence:string|null;uncertain:boolean}>};
const body=()=>{const value=output();value.fields.dispatch_number={value:"DSP-1",evidence:"Dispatch DSP-1",uncertain:false};value.fields.dr_number={value:"333",evidence:"DR 333",uncertain:false};value.fields.quantity={value:0,evidence:"Quantity 0",uncertain:false};return value;};
const success=()=>new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(body())}]}}]}));

test("structured output keeps null and zero, rejects invalid shapes/dates, and removes unsupported claims",()=>{
 const result=validatePodInterpretation(body(),text);assert.equal(result.fields.quantity.value,0);assert.equal(result.fields.so_number.value,null);assert.equal(result.status,"NEEDS_REVIEW");
 const fake=body();fake.fields.store_name={value:"Invented store",evidence:"Not in document",uncertain:false};assert.equal(validatePodInterpretation(fake,text).fields.store_name.value,null);
 const fabricated=body();fabricated.fields.dr_number.value="999";fabricated.fields.quantity.value=20;
 assert.equal(validatePodInterpretation(fabricated,text).fields.dr_number.value,null);assert.equal(validatePodInterpretation(fabricated,text).fields.quantity.value,null);
 assert.throws(()=>validatePodInterpretation({approved:true,fields:body().fields},text));
 const invalidDate=body();invalidDate.fields.delivery_date={value:"2026-02-31",evidence:"DR 333",uncertain:false};assert.throws(()=>validatePodInterpretation(invalidDate,text));
 const invalidNumber=body();invalidNumber.fields.quantity.value=-1;assert.throws(()=>validatePodInterpretation(invalidNumber,text));
 assert.throws(()=>validatePodInterpretation({fields:{}},text));
});

test("matching preserves exact physical stop identity and refuses ambiguous or contradictory identifiers",()=>{
 const candidates=[{trip_id:"trip",trip_stop_id:"stop-a",dispatch_number:"DSP-1",dr_number:"333",customer_name:null,store_name:null},{trip_id:"trip",trip_stop_id:"stop-b",dispatch_number:"DSP-1",dr_number:"444",customer_name:null,store_name:null}];
 const extraction=validatePodInterpretation(body(),text);assert.equal(matchPodTransaction(extraction,candidates).suggested?.trip_stop_id,"stop-a");
 assert.equal(matchPodTransaction(extraction,[candidates[0],{...candidates[0],trip_stop_id:"stop-c"}]).ambiguous,true);
 assert.equal(matchPodTransaction(extraction,[candidates[1]]).suggested,null);
 const missing=validatePodInterpretation(output(),text);assert.equal(matchPodTransaction(missing,candidates).suggested,null);
});

test("backend Gemini adapter deduplicates/cache-scopes requests, bounds cost and safely handles provider errors",async()=>{
 const oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_MODEL;
 process.env.GEMINI_API_KEY="isolated-fake-key";process.env.GEMINI_MODEL="gemini-2.5-flash";
 try{
  let calls=0;
  const interpret=createPodInterpreter((async(url,init)=>{calls++;assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'isolated-fake-key');assert.ok(!String(url).includes('isolated-fake-key'));const request=JSON.parse(String(init?.body));assert.equal(request.contents[0].parts[0].text,text);assert.equal(request.generationConfig.responseMimeType,'application/json');await Promise.resolve();return success();}) as typeof fetch);
  const [a,b]=await Promise.all([interpret('staff-a','receipt',1,text),interpret('staff-a','receipt',1,text)]);assert.deepEqual(a,b);assert.equal(calls,1);
  await interpret('staff-a','receipt',1,text);assert.equal(calls,1);
  await interpret('staff-b','receipt',1,text);await interpret('staff-a','receipt',2,text);assert.equal(calls,3);
  for(const status of [402,429,500,401]){
   const broken=createPodInterpreter((async()=>new Response('private provider diagnostic',{status})) as typeof fetch);
   await assert.rejects(broken('actor','receipt',0,text),error=>error instanceof Error && !error.message.includes('private provider diagnostic'));
  }
  const badJson=createPodInterpreter((async()=>new Response('not JSON')) as typeof fetch);await assert.rejects(badJson('actor','receipt',0,text),/manually/);
  const billing=createPodInterpreter((async()=>new Response('',{status:402})) as typeof fetch);await assert.rejects(billing('actor','receipt',0,text),/credits are depleted/);
  let syncCalls=0;
  const recover=createPodInterpreter((()=>{if(syncCalls++===0)throw Error('isolated failure');return Promise.resolve(success());}) as typeof fetch);
  await assert.rejects(recover('actor','receipt',0,text));await recover('actor','receipt',0,text);assert.equal(syncCalls,2,'a failed request must not poison in-flight deduplication');
  const timeout=createPodInterpreter((async()=>{throw new DOMException('private details','TimeoutError');}) as typeof fetch);await assert.rejects(timeout('actor','receipt',0,text),/timed out/);
  const limited=createPodInterpreter((async()=>success()) as typeof fetch);
  for(let i=0;i<6;i++)await limited('actor',`receipt-${i}`,0,text);
  await assert.rejects(limited('actor','receipt-7',0,text),/busy/);
  delete process.env.GEMINI_API_KEY;await assert.rejects(interpret('actor','receipt',0,text),/Configure backend/);
 }finally{
  if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;
  if(oldModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=oldModel;
 }
});
