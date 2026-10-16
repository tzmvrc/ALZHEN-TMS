import assert from "node:assert/strict";
import test from "node:test";
test("socket authentication uses validated JWT identity, database role and existing app-session guards",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin,supabaseAuth}=await import("../src/config/supabase.js");
 const {authenticateCollaboration}=await import("../src/services/collaboration-auth.service.js");
 const {sha256SessionIdentifier}=await import("../src/utils/session-rules.js");
 const originalUser=supabaseAuth.auth.getUser,originalFrom=supabaseAdmin.from;
 const session="A".repeat(43),id="fixture-user";let role="STAFF",valid=true,revoked=false;
 const token=`header.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,role:"ADMIN",sub:"forged-client-id"})).toString("base64url")}.signature`;
 (supabaseAuth.auth as any).getUser=async()=>({data:{user:valid?{id}:null},error:valid?null:{message:"invalid"}});
 (supabaseAdmin as any).from=(table:string)=>{const filters:Record<string,unknown>={};const chain:any={select:()=>chain,eq:(key:string,value:unknown)=>{filters[key]=value;return chain;},maybeSingle:async()=>{
  if(table==="profiles"){assert.equal(filters.id,id);return {data:{id,role,first_name:"Server",last_name:"Identity"},error:null};}
  if(table==="admin_staff_session_days"){assert.equal(filters.session_hash,sha256SessionIdentifier(session));return {data:{profile_id:id,role,expires_at:new Date(Date.now()+(revoked?-1000:60000)).toISOString()},error:null};}
  if(table==="trucker_active_sessions")return {data:{session_hash:revoked?"replaced":sha256SessionIdentifier(session)},error:null};
  throw Error("Unexpected table "+table);
 }};return chain;};
 try {
  const actor=await authenticateCollaboration(token,session);assert.equal(actor.id,id);assert.equal(actor.role,"STAFF");assert.equal(actor.name,"Server Identity");assert.ok(actor.expiresAt<Date.now()+61000);
  valid=false;await assert.rejects(authenticateCollaboration(token,session),/Invalid or expired/);valid=true;
  await assert.rejects(authenticateCollaboration(token,"missing"),/sign in/);
  revoked=true;await assert.rejects(authenticateCollaboration(token,session),/midnight/);revoked=false;
  role="TRUCKER";assert.equal((await authenticateCollaboration(token,session)).role,"TRUCKER");revoked=true;await assert.rejects(authenticateCollaboration(token,session),/another device/);
 }finally{supabaseAuth.auth.getUser=originalUser;supabaseAdmin.from=originalFrom;}
});
