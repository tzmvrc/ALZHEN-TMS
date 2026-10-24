import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-login";
process.env.SUPABASE_ANON_KEY="isolated-login";

test("login reports Auth and profile database outages as service unavailable, preserving invalid-credential responses",async()=>{
 const {supabaseAuth,supabaseAdmin}=await import("../src/config/supabase.js");
 const {login}=await import("../src/controllers/auth.controller.js");
 const signIn=supabaseAuth.auth.signInWithPassword,from=supabaseAdmin.from;
 const request={body:{email:"fixture@example.test",password:"isolated-only"}};
 const attempt=async()=>{
  let status=0,payload:any;
  const response:any={status:(value:number)=>{status=value;return response;},json:(value:unknown)=>{payload=value;return response;}};
  await login(request as any,response);return {status,payload};
 };
 try{
  for(const upstream of [{status:503,name:"AuthApiError",code:"unexpected_failure",message:"Database error authenticating user"},{status:522,name:"AuthRetryableFetchError",message:"Origin connection timed out"},{status:0,name:"AuthRetryableFetchError",message:"fetch failed"}]){
   (supabaseAuth.auth as any).signInWithPassword=async()=>({data:{user:null,session:null},error:upstream});
   const result=await attempt();assert.equal(result.status,503);assert.equal(result.payload.code,"AUTH_SERVICE_UNAVAILABLE");assert.match(result.payload.message,/temporarily unavailable/);assert.doesNotMatch(result.payload.message,/Invalid email|isolated-only/);
  }
  (supabaseAuth.auth as any).signInWithPassword=async()=>{throw new TypeError("fetch failed");};
  assert.equal((await attempt()).status,503);
  (supabaseAuth.auth as any).signInWithPassword=async()=>({data:{user:null,session:null},error:{status:400,name:"AuthApiError",code:"invalid_credentials",message:"Invalid login credentials"}});
  const denied=await attempt();assert.equal(denied.status,401);assert.equal(denied.payload.message,"Invalid email or password.");
  (supabaseAuth.auth as any).signInWithPassword=async()=>({data:{user:{id:"fixture"},session:{access_token:"isolated"}},error:null});
  (supabaseAdmin as any).from=(table:string)=>{
   assert.equal(table,"profiles");const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:{code:"57014",message:"statement timeout"}})};return q;
  };
  const profile=await attempt();assert.equal(profile.status,503);assert.equal(profile.payload.code,"AUTH_SERVICE_UNAVAILABLE");
 }finally{supabaseAuth.auth.signInWithPassword=signIn;supabaseAdmin.from=from;}
});
