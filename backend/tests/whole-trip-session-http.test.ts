import test from "node:test";
import assert from "node:assert/strict";
import {createServer,request} from "node:http";
import {createHash} from "node:crypto";

test("deletion HTTP contracts enforce live session roles, child versions, and explicit whole-trip scope without password reentry",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";process.env.SUPABASE_ANON_KEY="isolated";
 delete process.env.SOCKET_REDIS_URL;process.env.WEB_CONCURRENCY="1";
 const {supabaseAdmin:db,supabaseAuth}=await import("../src/config/supabase.js"),{default:app}=await import("../src/app.js");
 const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,id=uuid(9),trip=uuid(1),stop=uuid(2);
 const original={from:db.from,rpc:db.rpc,user:supabaseAuth.auth.getUser,login:supabaseAuth.auth.signInWithPassword,logout:supabaseAuth.auth.signOut,replace:supabaseAuth.auth.setSession,flag:process.env.WHOLE_TRIP_DELETE_ENABLED};
 let role="ADMIN",expired=false;const calls:string[]=[];
 supabaseAuth.auth.signInWithPassword=(async()=>{throw Error("Password reauthentication is forbidden");}) as typeof original.login;
 supabaseAuth.auth.signOut=(async()=>{throw Error("Original session must remain signed in");}) as typeof original.logout;
 supabaseAuth.auth.setSession=(async()=>{throw Error("Original session must not be replaced");}) as typeof original.replace;
 supabaseAuth.auth.getUser=(async()=>expired?{data:{user:null},error:{code:"expired",status:401,message:"expired"}}:{data:{user:{id,email:"admin@example.invalid"}},error:null}) as typeof original.user;
 db.from=((table:string)=>{const q={select(){return q;},eq(){return q;},async maybeSingle(){assert.ok(["profiles","admin_staff_session_days","trucker_active_sessions"].includes(table));return {data:table==="profiles"?{id,role}:table==="trucker_active_sessions"?{session_hash:createHash("sha256").update("a".repeat(43)).digest("hex")}:{profile_id:id,role,expires_at:"2099-01-01T00:00:00Z"},error:null};}};return q;}) as typeof original.from;
 db.rpc=(async(name:string,args:any)=>{calls.push(name);if(name==="delete_whole_trips_v1"){assert.deepEqual(args,{p_trip_ids:[trip],p_actor_id:id});return {data:null,error:{code:"55000",message:"Financial retention blocks this batch"}};}
  assert.equal(name,"delete_empty_trip_stop_v1");assert.deepEqual(args,{p_id:stop,p_actor:id,p_expected_version:4,p_trip:trip});return {data:{id:stop,trip_id:trip},error:null};}) as typeof original.rpc;
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as {port:number}).port;
 const send=(method:string,path:string,body:unknown={})=>new Promise<{status:number;body:string}>((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port,path,method,headers:{"content-type":"application/json","content-length":Buffer.byteLength(JSON.stringify(body)),authorization:"Bearer fixture-session-token","x-app-session":"a".repeat(43)}},res=>{let text="";res.on("data",part=>text+=part);res.on("end",()=>resolve({status:res.statusCode!,body:text}));});req.on("error",reject);req.end(JSON.stringify(body));});
 try{
  process.env.WHOLE_TRIP_DELETE_ENABLED="true";
  assert.equal((await send("POST","/api/trips/whole-delete",{trip_ids:[trip,trip]})).status,409);assert.deepEqual(calls,["delete_whole_trips_v1"]);
  const retired=await send("DELETE",`/api/trips/${trip}`);assert.equal(retired.status,410,retired.body);assert.equal(calls.length,1);
  assert.equal((await send("DELETE",`/api/trips/${trip}/stops/${stop}`)).status,400);assert.equal(calls.length,1);
  assert.equal((await send("DELETE",`/api/trips/${trip}/stops/${stop}`,{expected_version:4})).status,200);assert.equal(calls.at(-1),"delete_empty_trip_stop_v1");
  role="STAFF";assert.equal((await send("POST","/api/trips/whole-delete",{trip_ids:[trip]})).status,403);
  assert.equal((await send("DELETE",`/api/trips/${trip}/stops/${stop}/record-only`,{expected_version:4})).status,200);
  role="TRUCKER";assert.equal((await send("POST","/api/trips/whole-delete",{trip_ids:[trip]})).status,403);
  role="ADMIN";expired=true;assert.equal((await send("POST","/api/trips/whole-delete",{trip_ids:[trip]})).status,401);expired=false;
  delete process.env.WHOLE_TRIP_DELETE_ENABLED;assert.equal((await send("POST","/api/trips/whole-delete",{trip_ids:[trip]})).status,503);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.from=original.from;db.rpc=original.rpc;supabaseAuth.auth.getUser=original.user;supabaseAuth.auth.signInWithPassword=original.login;supabaseAuth.auth.signOut=original.logout;supabaseAuth.auth.setSession=original.replace;if(original.flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=original.flag;}
});
