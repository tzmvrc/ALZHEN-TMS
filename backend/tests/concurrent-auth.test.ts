import test from "node:test";
import assert from "node:assert/strict";
import { createConcurrentReadGate } from "../src/utils/concurrent-read.js";
import {authMiddleware} from "../src/middleware/auth.middleware.js";
import {supabaseAuth,supabaseAdmin} from "../src/config/supabase.js";
import type { Request,Response } from "express";

test("simultaneous reads share one promise, with no resolved permission cache",async()=>{
 const gate=createConcurrentReadGate();let reads=0;
 const load=async()=>{reads++;await new Promise(r=>setTimeout(r,10));return reads;};
 assert.deepEqual(await Promise.all(Array.from({length:20},()=>gate("same",load))),Array(20).fill(1));
 assert.equal(await gate("same",load),2);
 await assert.rejects(gate("fail",async()=>{throw Error("denied");}));
 assert.equal(await gate("fail",async()=>"fresh"),"fresh");
});

test("auth bursts dedupe live reads; later requests recheck role/session and session IDs remain isolated",async()=>{
 const getUser=supabaseAuth.auth.getUser,from=supabaseAdmin.from,rpc=supabaseAdmin.rpc;let users=0,profiles=0,sessions=0,active=true;
 const id="00000000-0000-4000-8000-000000000001",session="a".repeat(43);
 (supabaseAuth.auth as any).getUser=async()=>{users++;await new Promise(r=>setTimeout(r,10));return {data:{user:{id}},error:null};};
 (supabaseAdmin as any).from=(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>{await new Promise(r=>setTimeout(r,10));if(table==="profiles"){profiles++;return{data:{id,role:"ADMIN"},error:null};}assert.equal(table,"admin_staff_session_days");sessions++;return {data:active?{profile_id:id,role:"ADMIN",expires_at:"2099-01-01"}:null,error:null};}};return q;};
 (supabaseAdmin as any).rpc=async()=>({data:"ACTIVE",error:null});
 const call=async(appSession=session)=>{const req={headers:{authorization:"Bearer fixture"},header:()=>appSession,get:()=>"Isolated browser"} as unknown as Request;let code=200,passed=false;const res={append(){},status(n:number){code=n;return this;},json(){return this;}} as unknown as Response;await authMiddleware(req,res,()=>{passed=true;});return {passed,code};};
 try{
  const results=await Promise.all(Array.from({length:10},()=>call()));assert.ok(results.every(x=>x.passed));assert.deepEqual({users,profiles,sessions},{users:1,profiles:1,sessions:1});
  await Promise.all([call(session),call("b".repeat(43))]);assert.equal(sessions,3,"different session identifiers must never share session verification");
  active=false;assert.deepEqual(await call(),{passed:false,code:401});assert.equal(users,3,"every later request validates Auth again");
 }finally{supabaseAuth.auth.getUser=getUser;supabaseAdmin.from=from;supabaseAdmin.rpc=rpc;}
});
