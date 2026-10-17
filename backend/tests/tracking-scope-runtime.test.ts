import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
test("acceptance scope filters feed/route jobs by profile and assignment and skips global retention pruning",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js");
 const {trackingFeed,startTrackingWorker}=await import("../src/services/tracking-runtime.service.js");
 const profile="00000000-0000-4000-8000-000000000001",assignment="00000000-0000-4000-8000-000000000002",other="00000000-0000-4000-8000-000000000003";
 const originalFrom=db.from,originalRpc=db.rpc,old={TRACKING_ENABLED:process.env.TRACKING_ENABLED,TRACKING_TEST_PROFILE_ID:process.env.TRACKING_TEST_PROFILE_ID,TRACKING_TEST_ASSIGNMENT_ID:process.env.TRACKING_TEST_ASSIGNMENT_ID};
 const context={id:assignment,profileId:profile,tripId:profile,context_token:"synthetic",active:true,plate_number:"TEST",origin:{latitude:10,longitude:123,accuracy_meters:1,captured_at:new Date().toISOString()},destinations:[]};
 const rows=[{context,cache:null},{context:{...context,id:other},cache:null},{context:{...context,profileId:other},cache:null}];
 const routeReads:string[]=[],rpcNames:string[]=[];
 db.rpc=(async(name:string)=>{rpcNames.push(name);assert.equal(name,"tracking_feed_v1");return {data:rows,error:null};}) as typeof originalRpc;
 db.from=((table:string)=>{assert.ok(["profiles","trip_route_cache"].includes(table));const q={select:()=>q,in:()=>q,order:()=>q,limit:()=>q,eq:(_k:string,id:string)=>{routeReads.push(id);return q;},maybeSingle:async()=>({data:table==="profiles"?{id:profile}:null,error:null})};return q;}) as typeof originalFrom;
 let stop:()=>void=()=>{};
 try{
  process.env.TRACKING_ENABLED="true";process.env.TRACKING_TEST_PROFILE_ID=profile;process.env.TRACKING_TEST_ASSIGNMENT_ID=assignment;
  assert.deepEqual((await trackingFeed(profile,null)).rows.map((r:{assignmentId:string})=>r.assignmentId),[assignment]);
  stop=startTrackingWorker();
  for(let n=0;n<30&&!routeReads.length;n++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(routeReads,[assignment]);assert.ok(rpcNames.length>=2);assert.ok(!rpcNames.includes("prune_tracking_v1"));
 }finally{stop();db.from=originalFrom;db.rpc=originalRpc;for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
