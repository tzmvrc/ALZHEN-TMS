import test from "node:test";
import assert from "node:assert/strict";
import {supabaseAuth} from "../src/config/supabase.js";
import {authMiddleware} from "../src/middleware/auth.middleware.js";
test("identity-provider outages fail closed without expiring the user's valid session",async()=>{
 const original=supabaseAuth.auth.getUser;
 try{for(const status of [0,500,503]){
  supabaseAuth.auth.getUser=async()=>({data:{user:null},error:{name:"AuthRetryableFetchError",status,message:"isolated outage"}} as any);
  let responseStatus=0,response:any,next=false;
  const req={headers:{authorization:"Bearer isolated-test"}},res={append:()=>{},status:(value:number)=>{responseStatus=value;return res;},json:(value:any)=>{response=value;return res;}};
  await authMiddleware(req as any,res as any,()=>{next=true;});
  assert.equal(responseStatus,503);assert.equal(response.code,"AUTH_VERIFICATION_UNAVAILABLE");assert.equal(next,false);
 }
 supabaseAuth.auth.getUser=async()=>({data:{user:null},error:{name:"AuthApiError",status:401,message:"invalid token"}} as any);
 let status=0;const res={append:()=>{},status:(value:number)=>{status=value;return res;},json:()=>res};
 await authMiddleware({headers:{authorization:"Bearer isolated-invalid"}} as any,res as any,()=>assert.fail("Invalid JWT must not authenticate"));assert.equal(status,401);
 }finally{supabaseAuth.auth.getUser=original;}
});
