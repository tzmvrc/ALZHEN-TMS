import test from "node:test";
import assert from "node:assert/strict";
import {createDeletionConfirmationLimit} from "../src/services/deletion-confirmation-limit.js";
import {ApiError} from "../src/utils/api-response.js";

// Deterministic isolated Redis protocol model; never connects to Redis or Supabase.
function fixture(){
 let now=0;const budgets=new Map<string,{count:number;expires:number}>(),leases=new Map<string,{value:string;expires:number}>();
 const calls={expiredBudgets:0,releases:0};
 const factory=(()=>({isReady:true,on(){},async connect(){},async eval(script:string,{keys,arguments:args}:{keys:string[];arguments:string[]}){
  if(script.includes("INCR")){
   assert.match(script,/PEXPIRE/);assert.match(script,/'NX','PX',120000/);assert.equal(Number(args[0]),900000);
   let b=budgets.get(keys[0]);if(b&&b.expires<=now){budgets.delete(keys[0]);b=undefined;calls.expiredBudgets++;}
   if(!b){b={count:0,expires:now+Number(args[0])};budgets.set(keys[0],b);}b.count++;
   if(b.count>5)return 2;
   if((leases.get(keys[1])?.expires??0)>now)return 1;
   leases.set(keys[1],{value:args[1],expires:now+120000});return 0;
  }
  assert.match(script,/GET/);assert.match(script,/DEL/);
  if(leases.get(keys[0])?.value===args[0]){leases.delete(keys[0]);calls.releases++;return 1;}return 0;
 }})) as never;
 return {factory,calls,budgets,leases,advance:(ms:number)=>now+=ms};
}
async function isolated(run:()=>Promise<void>){const old=process.env.SOCKET_REDIS_URL;process.env.SOCKET_REDIS_URL="redis://isolated.invalid";try{await run();}finally{if(old===undefined)delete process.env.SOCKET_REDIS_URL;else process.env.SOCKET_REDIS_URL=old;}}
test("replicas/tabs share five attempts and one lease; sixth request is rejected",()=>isolated(async()=>{
 const f=fixture(),replicas=[createDeletionConfirmationLimit(Date.now,f.factory),createDeletionConfirmationLimit(Date.now,f.factory)];
 for(let i=0;i<5;i++)await(await replicas[i%2]("admin"))();
 await assert.rejects(replicas[1]("admin"),(e:unknown)=>(e as ApiError).statusCode===429);
 assert.equal(f.budgets.size,1);assert.equal(f.calls.releases,5);
}));
test("concurrent replica confirmations grant one lease and cannot bypass the shared budget",()=>isolated(async()=>{
 const f=fixture(),first=createDeletionConfirmationLimit(Date.now,f.factory),second=createDeletionConfirmationLimit(Date.now,f.factory);
 const results=await Promise.allSettled([first("admin"),second("admin"),first("admin"),second("admin"),first("admin"),second("admin")]);
 const accepted=results.filter(r=>r.status==="fulfilled");assert.equal(accepted.length,1);assert.equal(results.filter(r=>r.status==="rejected").length,5);
 for(const r of accepted)if(r.status==="fulfilled")await r.value();
 await assert.rejects(first("admin"),(e:unknown)=>(e as ApiError).statusCode===429);
}));
test("Redis window expiry restores budget without extending the original TTL on subsequent attempts",()=>isolated(async()=>{
 const f=fixture(),enter=createDeletionConfirmationLimit(Date.now,f.factory);
 for(let i=0;i<5;i++){await(await enter("admin"))();f.advance(1000);}
 f.advance(894999);await assert.rejects(enter("admin"),(e:unknown)=>(e as ApiError).statusCode===429);
 f.advance(1);await(await enter("admin"))();assert.equal(f.calls.expiredBudgets,1);
}));
test("an expired old lease cannot release a newer confirmation lease",()=>isolated(async()=>{
 const f=fixture(),first=createDeletionConfirmationLimit(Date.now,f.factory),second=createDeletionConfirmationLimit(Date.now,f.factory);
 const old=await first("admin");f.advance(120001);const current=await second("admin");await old();assert.equal(f.leases.size,1);
 await assert.rejects(first("admin"),(e:unknown)=>(e as ApiError).statusCode===409);await current();assert.equal(f.leases.size,0);
}));
test("Redis connection and command failures reject confirmation rather than falling back to local counters",()=>isolated(async()=>{
 for(const stage of ["connect","command"]){
  const factory=(()=>({isReady:true,on(){},async connect(){if(stage==="connect")throw Error("unavailable");},async eval(){throw Error("unavailable");}})) as never;
  const enter=createDeletionConfirmationLimit(Date.now,factory);
  for(let i=0;i<2;i++)await assert.rejects(enter("admin"),(e:unknown)=>(e as ApiError).statusCode===503&&!String(e).includes("isolated.invalid"));
 }
}));
