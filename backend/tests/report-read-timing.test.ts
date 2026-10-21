import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {reportReadTiming,timedSupabaseFetch} from "../src/utils/report-read-timing.js";
function reportScope<T>(run:()=>Promise<T>){let work:Promise<T>|undefined;const res=Object.assign(new EventEmitter(),{json:(body:unknown)=>body,setHeader:()=>{}});reportReadTiming({method:"GET",path:"/api/reports/dispatch",originalUrl:"/api/reports/dispatch"} as any,res as any,()=>{work=run();});return work!;}
test("report read timeout aborts once; mutation and unscoped requests keep their existing signals",async()=>{
 const original=globalThis.fetch,setting=process.env.REPORT_UPSTREAM_TIMEOUT_MS;process.env.REPORT_UPSTREAM_TIMEOUT_MS="1000";let reads=0;
 globalThis.fetch=async(_input,init)=>{reads++;assert.ok(init?.signal);return new Promise((_resolve,reject)=>{const signal=init!.signal!;signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true});});};
 try{await assert.rejects(reportScope(()=>timedSupabaseFetch("https://example.invalid/rest/v1/trips")),{name:"AbortError"});assert.equal(reads,1);
 const signals:Array<AbortSignal|null|undefined>=[];globalThis.fetch=async(_input,init)=>{signals.push(init?.signal);return new Response("{}",{status:200});};const caller=new AbortController();
 await reportScope(()=>timedSupabaseFetch("https://example.invalid/rest/v1/rpc/delete",{method:"POST",signal:caller.signal}));await timedSupabaseFetch("https://example.invalid/rest/v1/trips",{signal:caller.signal});assert.deepEqual(signals,[caller.signal,caller.signal]);
 }finally{globalThis.fetch=original;if(setting===undefined)delete process.env.REPORT_UPSTREAM_TIMEOUT_MS;else process.env.REPORT_UPSTREAM_TIMEOUT_MS=setting;}
});
test("report database reads preserve caller cancellation",async()=>{const original=globalThis.fetch;globalThis.fetch=async(_input,init)=>{assert.equal(init?.signal?.aborted,true);throw new DOMException("Aborted","AbortError");};try{const controller=new AbortController();controller.abort();await assert.rejects(reportScope(()=>timedSupabaseFetch("https://example.invalid/rest/v1/trips",{signal:controller.signal})),{name:"AbortError"});}finally{globalThis.fetch=original;}});
