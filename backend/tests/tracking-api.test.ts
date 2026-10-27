import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";process.env.SUPABASE_ANON_KEY="isolated";
test("tracking HTTP endpoints enforce JWT/app-session/roles, activation and server-derived write identity",async()=>{
 const {supabaseAdmin:db,supabaseAuth}=await import("../src/config/supabase.js"),{sha256SessionIdentifier}=await import("../src/utils/session-rules.js");
 const {default:router}=await import("../src/routes/tracking.routes.js");
 const session="s".repeat(43),driver="00000000-0000-4000-8000-000000000002",admin="00000000-0000-4000-8000-000000000001",assignment="00000000-0000-4000-8000-000000000050";
 const original=db.from,rpc=db.rpc,getUser=supabaseAuth.auth.getUser,flag=process.env.TRACKING_ENABLED,plannedFlag=process.env.PLANNED_ROUTES_ENABLED;
 const calls:Array<{name:string;args:Record<string,unknown>}>=[];
 supabaseAuth.auth.getUser=(async(token:string)=>({data:{user:{id:token==="staff"?admin:driver}},error:null})) as typeof getUser;
 db.from=((table:string)=>{
  let profile=driver;const q={select:()=>q,eq:(key:string,value:string)=>{if(key==="id")profile=value;return q;},maybeSingle:async()=>({error:null,data:table==="profiles"?{id:profile,role:profile===admin?"STAFF":"TRUCKER"}:table==="trucker_active_sessions"?{session_hash:sha256SessionIdentifier(session)}:{profile_id:admin,role:"STAFF",expires_at:new Date(Date.now()+86400000).toISOString()}})};return q;
 }) as typeof original;
 db.rpc=(async(name:string,args:Record<string,unknown>)=>{if(name==="check_device_session_v1")return {data:"ACTIVE",error:null};calls.push({name,args});return {error:null,data:name==="tracking_assignment_v1"?{id:assignment,tripId:admin,profileId:driver,active:true,revision:4}:name==="tracking_feed_v1"?[]:true};}) as typeof rpc;
 const app=express();app.use(express.json());app.use(router);const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();if(!address||typeof address==="string")throw Error("port");
 const request=(path:string,role="driver",body?:object)=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${role}`,"X-App-Session":session,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
 try{
  process.env.PLANNED_ROUTES_ENABLED="false";
  process.env.TRACKING_ENABLED="false";assert.equal((await fetch(`http://127.0.0.1:${address.port}/active`)).status,401);
  assert.equal((await request(`/roads?trip_ids=${assignment}`)).status,403);
  assert.equal((await request("/roads?trip_ids=invalid","staff")).status,400);
  assert.equal((await request(`/roads/${assignment}/planned`,"driver",{})).status,403);
  assert.equal((await request(`/roads/${assignment}/planned`,"staff",{})).status,503);
  assert.equal((await request("/active")).status,403);assert.equal((await request(`/assignments/${assignment}/start`,"staff",{consent:true})).status,403);
  assert.equal((await request(`/assignments/${assignment}/start`,"driver",{consent:true})).status,503);assert.equal(calls.length,0);
  process.env.TRACKING_ENABLED="true";
  const started=await request(`/assignments/${assignment}/start`,"driver",{consent:true,profile_id:admin});assert.equal(started.status,200);
  const data=await started.json();const write=calls.find(c=>c.name==="tracking_write_v1")!;assert.equal(write.args.p_actor,driver);assert.equal(write.args.p_revision,4);
  const fix=await request(`/assignments/${assignment}/fixes`,"driver",{session_id:data.data.session_id,latitude:10,longitude:123,accuracy_meters:4,captured_at:new Date().toISOString(),profile_id:admin});assert.equal(fix.status,200);
  assert.equal((await request(`/assignments/${assignment}/stop`,"driver",{session_id:data.data.session_id})).status,200);
  assert.equal((await request("/active?after=invalid","staff")).status,400);assert.equal((await request("/active","staff")).status,200);
  const oldProfile=process.env.TRACKING_TEST_PROFILE_ID,oldAssignment=process.env.TRACKING_TEST_ASSIGNMENT_ID;
  try{
   process.env.TRACKING_TEST_PROFILE_ID=driver;process.env.TRACKING_TEST_ASSIGNMENT_ID=assignment;
   assert.equal((await request("/capabilities")).status,200);
   const before=calls.length;
   assert.equal((await request(`/assignments/${admin}/start`,"driver",{consent:true})).status,403);assert.equal(calls.length,before);
   process.env.TRACKING_TEST_PROFILE_ID=admin;
   assert.equal((await (await request("/capabilities")).json()).data.enabled,false);
   assert.equal((await request(`/assignments/${assignment}/fixes`,"driver",{session_id:data.data.session_id})).status,403);
   // Explicit stop is permitted for a previously owned session even after scope changes.
   assert.equal((await request(`/assignments/${assignment}/stop`,"driver",{session_id:data.data.session_id})).status,200);
   delete process.env.TRACKING_TEST_ASSIGNMENT_ID;
   assert.equal((await request("/active","staff")).status,503);
  }finally{for(const [key,value] of Object.entries({TRACKING_TEST_PROFILE_ID:oldProfile,TRACKING_TEST_ASSIGNMENT_ID:oldAssignment})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.from=original;db.rpc=rpc;supabaseAuth.auth.getUser=getUser;if(flag===undefined)delete process.env.TRACKING_ENABLED;else process.env.TRACKING_ENABLED=flag;if(plannedFlag===undefined)delete process.env.PLANNED_ROUTES_ENABLED;else process.env.PLANNED_ROUTES_ENABLED=plannedFlag;}
});
