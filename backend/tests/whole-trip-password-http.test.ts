import test from "node:test";
import assert from "node:assert/strict";
import {createServer,request} from "node:http";
import {createHash} from "node:crypto";

test("protected bulk HTTP endpoint verifies fresh passwords, preserves the original session and never trusts client approval flags",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";process.env.SUPABASE_ANON_KEY="isolated";
 delete process.env.SOCKET_REDIS_URL;process.env.WEB_CONCURRENCY="1";
 const {supabaseAdmin:db,supabaseAuth}=await import("../src/config/supabase.js");
 const {default:app}=await import("../src/app.js");
 const id="00000000-0000-4000-8000-000000000009",trip="00000000-0000-4000-8000-000000000001";
 const original={fetch:globalThis.fetch,from:db.from,rpc:db.rpc,user:supabaseAuth.auth.getUser,login:supabaseAuth.auth.signInWithPassword,logout:supabaseAuth.auth.signOut,replace:supabaseAuth.auth.setSession,flag:process.env.WHOLE_TRIP_DELETE_ENABLED};
 supabaseAuth.auth.signInWithPassword=(async()=>{throw Error("Original application Auth client login must not be used");}) as typeof original.login;
 supabaseAuth.auth.signOut=(async()=>{throw Error("Original application Auth session must not be signed out");}) as typeof original.logout;
 supabaseAuth.auth.setSession=(async()=>{throw Error("Original application Auth session must not be replaced");}) as typeof original.replace;
 let role="ADMIN",expired=false,signIns=0,signOuts=0,mutations=0;
 supabaseAuth.auth.getUser=(async()=>expired?{data:{user:null},error:{code:"expired",status:401,message:"expired"}}:{data:{user:{id,email:"admin@example.invalid"}},error:null}) as typeof original.user;
 db.from=((table:string)=>{const q={select(){return q;},eq(){return q;},async maybeSingle(){assert.ok(["profiles","admin_staff_session_days","trucker_active_sessions"].includes(table));return {data:table==="profiles"?{id,role}:table==="trucker_active_sessions"?{session_hash:createHash("sha256").update("a".repeat(43)).digest("hex")}:{profile_id:id,role,expires_at:"2099-01-01T00:00:00Z"},error:null};}};return q;}) as typeof original.from;
 db.rpc=(async(name:string,args:unknown)=>{mutations++;assert.equal(name,"delete_whole_trips_v1");assert.deepEqual(args,{p_trip_ids:[trip],p_actor_id:id});return {data:null,error:{code:"55000",message:"Financial retention blocks the whole batch"}};}) as typeof original.rpc;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,"http://127.0.0.1:54321");
  if(url.pathname==="/auth/v1/token"){
   signIns++;const body=JSON.parse(String(init?.body));assert.equal(body.email,"admin@example.invalid");
   if(body.password!=="synthetic-correct")return new Response(JSON.stringify({error:"invalid_grant",error_description:"Invalid login credentials"}),{status:400});
   const jwt=`e30.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.signature`;
   return new Response(JSON.stringify({access_token:jwt,refresh_token:"verification-only-refresh",token_type:"bearer",expires_in:3600,user:{id,email:body.email}}),{status:200});
  }
  assert.equal(url.pathname,"/auth/v1/logout");assert.equal(url.searchParams.get("scope"),"local");signOuts++;return new Response(null,{status:204});
 };
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const port=(server.address() as {port:number}).port;
 const post=(body:unknown)=>new Promise<{status:number;body:string}>((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port,path:"/api/trips/whole-delete",method:"POST",headers:{"content-type":"application/json",authorization:"Bearer original-access-token","x-app-session":"a".repeat(43)}},res=>{let text="";res.on("data",b=>text+=b);res.on("end",()=>resolve({status:res.statusCode!,body:text}));});req.on("error",reject);req.end(JSON.stringify(body));});
 try{
  process.env.WHOLE_TRIP_DELETE_ENABLED="true";
  assert.equal((await post({trip_ids:[trip],passwordVerified:true})).status,400);
  const wrong=await post({trip_ids:[trip],current_password:"synthetic-wrong"});assert.equal(wrong.status,403);assert.ok(!wrong.body.includes("synthetic-wrong"));
  assert.equal((await post({trip_ids:[trip,trip],current_password:"synthetic-correct"})).status,409);assert.equal(mutations,1);assert.equal(signOuts,1);
  for(role of ["STAFF","TRUCKER"])assert.equal((await post({trip_ids:[trip],current_password:"synthetic-correct"})).status,403);
  role="ADMIN";expired=true;assert.equal((await post({trip_ids:[trip],current_password:"synthetic-correct"})).status,401);expired=false;
  delete process.env.WHOLE_TRIP_DELETE_ENABLED;assert.equal((await post({trip_ids:[trip],current_password:"synthetic-correct"})).status,503);assert.equal(signIns,2);assert.equal(mutations,1);
 }finally{
  await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=original.fetch;db.from=original.from;db.rpc=original.rpc;supabaseAuth.auth.getUser=original.user;supabaseAuth.auth.signInWithPassword=original.login;supabaseAuth.auth.signOut=original.logout;supabaseAuth.auth.setSession=original.replace;
  if(original.flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=original.flag;
 }
});
