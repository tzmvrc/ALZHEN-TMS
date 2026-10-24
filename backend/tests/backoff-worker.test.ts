import assert from "node:assert/strict";
import test from "node:test";
import {startBackoffWorker} from "../src/utils/backoff-worker.js";

function clock(){
 const original=globalThis.setTimeout,clear=globalThis.clearTimeout;
 const queued:Array<{callback:()=>void;delay:number;cancelled:boolean;unref:()=>void}>=[];
 globalThis.setTimeout=((callback:()=>void,delay:number)=>{const timer={callback,delay,cancelled:false,unref:()=>{}};queued.push(timer);return timer;}) as any;
 globalThis.clearTimeout=((timer:any)=>{if(timer)timer.cancelled=true;}) as any;
 return {queued,async next(){const timer=queued.shift();assert.ok(timer&&!timer.cancelled);timer.callback();await new Promise<void>(resolve=>setImmediate(resolve));},restore(){globalThis.setTimeout=original;globalThis.clearTimeout=clear;}};
}

test("queue polling backs off to its cap, reports once per outage and resets after recovery",async()=>{
 const time=clock();let calls=0,unavailable=0,fail=true;
 const stop=startBackoffWorker({run:async()=>{calls++;if(fail)throw Error("upstream unavailable");},onUnavailable:(_error,retryMs)=>{unavailable++;assert.equal(retryMs,30000);}});
 try{
  assert.equal(time.queued[0].delay,15000);
  for(const delay of [30000,60000,120000,240000,300000,300000]){await time.next();assert.equal(time.queued[0].delay,delay);}
  assert.equal(calls,6);assert.equal(unavailable,1);
  fail=false;await time.next();assert.equal(time.queued[0].delay,15000);
  fail=true;await time.next();assert.equal(unavailable,2);assert.equal(time.queued[0].delay,30000);
  stop();assert.equal(time.queued[0].cancelled,true);
 }finally{stop();time.restore();}
});

test("a pending poll cannot overlap another poll or reschedule after shutdown",async()=>{
 const time=clock();let calls=0,release!:()=>void;
 const stop=startBackoffWorker({immediate:true,run:async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});},onUnavailable:()=>assert.fail("unexpected failure")});
 try{
  assert.equal(calls,1);assert.equal(time.queued.length,0);
  stop();release();await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(time.queued.length,0);assert.equal(calls,1);
 }finally{stop();time.restore();}
});

test("user maintenance backs off failed claims without executing or completing jobs",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-worker";process.env.SUPABASE_ANON_KEY="isolated-worker";
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {startUserMaintenanceWorker}=await import("../src/services/user-maintenance.service.js");
 const rpc=supabaseAdmin.rpc,from=supabaseAdmin.from,log=console.warn,random=Math.random,time=clock();let calls=0,logs=0,unavailable=true;
 Math.random=()=>0.5;
 (supabaseAdmin as any).rpc=(name:string)=>{assert.equal(name,"claim_user_maintenance_v1");calls++;const q:any={abortSignal:()=>q,retry:()=>q,then:(resolve:any,reject:any)=>Promise.resolve(unavailable?{error:{message:"Upstream timeout"},data:null}:{error:null,data:[]}).then(resolve,reject)};return q;};
 (supabaseAdmin as any).from=()=>assert.fail("No job can be changed when its claim is unavailable");
 console.warn=(message)=>{const detail=JSON.parse(message);assert.equal(detail.worker,"user_maintenance");if(detail.event==="background_worker_deferred")logs++;};
 const stop=startUserMaintenanceWorker();
 try{
  await time.next();assert.equal(calls,1);assert.equal(time.queued[0].delay,30000);
  await time.next();assert.equal(calls,2);assert.equal(logs,1);assert.equal(time.queued[0].delay,60000);
  unavailable=false;await time.next();assert.equal(time.queued[0].delay,30000,"recovery resumes the upstream scheduler's idle interval");
 }finally{stop();time.restore();console.warn=log;Math.random=random;supabaseAdmin.rpc=rpc;supabaseAdmin.from=from;}
});
