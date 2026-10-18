import test from "node:test";
import assert from "node:assert/strict";
import type {User} from "@supabase/supabase-js";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";process.env.SUPABASE_ANON_KEY="isolated";
delete process.env.SOCKET_REDIS_URL;process.env.WEB_CONCURRENCY="1";
import {createCurrentUserPasswordGuard,createDeletionPasswordGuard,type DeletionCredentials} from "../src/services/deletion-password.service.js";
import {createDeletionConfirmationLimit} from "../src/services/deletion-confirmation-limit.js";
import {createPasswordVerificationClient,supabaseAuth,supabaseAdmin} from "../src/config/supabase.js";
import {ApiError} from "../src/utils/api-response.js";

const id="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",actor={id,role:"ADMIN"};
function fixture(){
 const state={password:"correct test password",role:true,expired:false,signIns:0,signOuts:0,commits:0,roleReads:0,signOutFailure:false,wrongIdentity:false};
 const client={auth:{async signInWithPassword(input:{email:string;password:string}){
  state.signIns++;assert.equal(input.email,"admin@example.invalid");
  return input.password===state.password?{data:{user:{id:state.wrongIdentity?other:id},session:{access_token:"verification-only"}},error:null}:{data:{user:null,session:null},error:{status:400}};
 },async signOut(options:unknown){state.signOuts++;assert.deepEqual(options,{scope:"local"});return {error:state.signOutFailure?{message:"failed"}:null};}}} as unknown as ReturnType<typeof createPasswordVerificationClient>;
 const deps={createClient:()=>client,user:async()=>state.expired?null:({id,email:"admin@example.invalid"} as User),admin:async()=>{state.roleReads++;return state.role;},session:async()=>({expiresAt:"2099-01-01"}),enter:createDeletionConfirmationLimit()};
 const guard=createDeletionPasswordGuard(deps),credentials=(password:unknown=state.password):DeletionCredentials=>({password,accessToken:"original-bearer",appSessionId:"app-session"});
 return {state,deps,guard,credentials,commit:async()=>{state.commits++;return "committed";}};
}
test("password confirmation uses server-derived identity, an isolated Auth client and local verification-session revocation",async()=>{
 const f=fixture(),credentials=f.credentials();assert.equal(await f.guard(actor,credentials,f.commit),"committed");
 assert.equal(credentials.password,undefined);assert.equal(f.state.signIns,1);assert.equal(f.state.signOuts,1);assert.equal(f.state.roleReads,2);
 const client=createPasswordVerificationClient();assert.notEqual(client.auth,supabaseAuth.auth);
 assert.equal((client.auth as unknown as {persistSession:boolean}).persistSession,false);
 assert.equal((client.auth as unknown as {autoRefreshToken:boolean}).autoRefreshToken,false);
 assert.equal((client.auth as unknown as {detectSessionInUrl:boolean}).detectSessionInUrl,false);
});
test("missing/incorrect passwords and untrusted verification flags cannot authorize a mutation",async()=>{
 const f=fixture();for(const password of [undefined,null,"",123,"wrong"]){await assert.rejects(f.guard(actor,{...f.credentials(),password},f.commit));}
 await assert.rejects(f.guard(actor,{...f.credentials(""),passwordVerified:true} as DeletionCredentials,f.commit));assert.equal(f.state.commits,0);
});
test("expired original sessions and STAFF/TRUCKER are denied without attempting a password login",async()=>{
 const f=fixture();for(const role of ["STAFF","TRUCKER"])await assert.rejects(f.guard({...actor,role},f.credentials(),f.commit));
 f.state.expired=true;await assert.rejects(f.guard(actor,f.credentials(),f.commit),(e:unknown)=>(e as ApiError).statusCode===401);
 assert.equal(f.state.signIns,0);assert.equal(f.state.commits,0);
});
test("wrong verification identity, role changes and verification-session cleanup failures fail closed",async()=>{
 const f=fixture();f.state.wrongIdentity=true;await assert.rejects(f.guard(actor,f.credentials(),f.commit));assert.equal(f.state.signOuts,1);
 f.state.wrongIdentity=false;const changed=createDeletionPasswordGuard({...f.deps,admin:async()=>++f.state.roleReads===1});f.state.roleReads=0;
 await assert.rejects(changed(actor,f.credentials(),f.commit),/permission changed/);
 f.state.signOutFailure=true;await assert.rejects(f.guard(actor,f.credentials(),f.commit),/safely completed/);assert.equal(f.state.commits,0);
});
test("password confirmations are fresh, rate limited per Admin and never echoed in errors",async()=>{
 const f=fixture();for(let i=0;i<5;i++)await assert.rejects(f.guard(actor,f.credentials("secret-invalid-password"),f.commit),e=>!String(e).includes("secret-invalid-password"));
 await assert.rejects(f.guard(actor,f.credentials(),f.commit),(e:unknown)=>(e as ApiError).statusCode===429);assert.equal(f.state.signIns,5);
 const fresh=fixture();await fresh.guard(actor,fresh.credentials(),fresh.commit);await fresh.guard(actor,fresh.credentials(),fresh.commit);assert.equal(fresh.state.signIns,2);
});
test("same-Admin confirmations cannot overlap; rate windows expire; unconfigured multi-instance rate protection fails closed",async()=>{
 const priorRedis=process.env.SOCKET_REDIS_URL,priorWorkers=process.env.WEB_CONCURRENCY;delete process.env.SOCKET_REDIS_URL;process.env.WEB_CONCURRENCY="1";
 try{let now=0;const enter=createDeletionConfirmationLimit(()=>now),leave=await enter(id);await assert.rejects(enter(id),(e:unknown)=>(e as ApiError).statusCode===409);await leave();
  for(let i=0;i<4;i++)await (await enter(id))();await assert.rejects(enter(id),(e:unknown)=>(e as ApiError).statusCode===429);
  now=15*60*1000;await (await enter(id))();process.env.WEB_CONCURRENCY="2";await assert.rejects(enter(id),/Shared rate protection/);
 }finally{if(priorRedis===undefined)delete process.env.SOCKET_REDIS_URL;else process.env.SOCKET_REDIS_URL=priorRedis;if(priorWorkers===undefined)delete process.env.WEB_CONCURRENCY;else process.env.WEB_CONCURRENCY=priorWorkers;}
});
test("a bound immutable trip batch cannot be replaced while password authentication is pending",async()=>{
 const {createWholeTripDeleter,deleteWholeTrips}=await import("../src/services/whole-trip-deletion.service.js");
 const flag=process.env.WHOLE_TRIP_DELETE_ENABLED,old=supabaseAdmin.rpc;let begin!:()=>void,release!:()=>void;
 const began=new Promise<void>(r=>begin=r),held=new Promise<void>(r=>release=r),input=[id,id];let rpcTrips:unknown;
 const remove=createWholeTripDeleter(async(_actor,_credentials,commit)=>{begin();await held;return commit();});
 supabaseAdmin.rpc=(async(_name:string,args:{p_trip_ids:string[]})=>{rpcTrips=args.p_trip_ids;return {data:null,error:{code:"55000",message:"Protected attachment"}};}) as typeof old;
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";const pending=remove(actor,input);await began;input.splice(0,input.length,other);release();await assert.rejects(pending,/Protected attachment/);assert.deepEqual(rpcTrips,[id]);
  await assert.rejects(deleteWholeTrips(actor,[id]),/current account password/);
  delete process.env.WHOLE_TRIP_DELETE_ENABLED;await assert.rejects(deleteWholeTrips(actor,[id]),/disabled/);
 }finally{supabaseAdmin.rpc=old;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});

test("two backend replicas share one confirmation budget and lease through the mocked Redis protocol",async()=>{
 const prior=process.env.SOCKET_REDIS_URL;process.env.SOCKET_REDIS_URL="redis://mock.invalid";
 let attempts=0,held="";
 const factory=(()=>({isReady:true,on(){},async connect(){},async eval(script:string,{arguments:args}:{arguments:string[]}){
  if(script.includes("INCR")){if(++attempts>5)return 2;if(held)return 1;held=args[1];return 0;}
  if(held===args[0])held="";return 1;
 }})) as never;
 try{const first=createDeletionConfirmationLimit(Date.now,factory),second=createDeletionConfirmationLimit(Date.now,factory);
  const leave=await first(id);await assert.rejects(second(id),(e:unknown)=>(e as ApiError).statusCode===409);await leave();
  for(let i=0;i<3;i++)await(await second(id))();await assert.rejects(first(id),(e:unknown)=>(e as ApiError).statusCode===429);
 }finally{if(prior===undefined)delete process.env.SOCKET_REDIS_URL;else process.env.SOCKET_REDIS_URL=prior;}
});

test("Auth outage, timeout and provider rate-limit failures do not commit or retain password credentials",async()=>{
 for(const failure of [new Error("provider unavailable"),new DOMException("timed out","TimeoutError")]){
  const f=fixture(),client=f.deps.createClient();client.auth.signInWithPassword=(async()=>{throw failure;}) as typeof client.auth.signInWithPassword;
  const credentials=f.credentials();await assert.rejects(f.guard(actor,credentials,f.commit),(e:unknown)=>(e as ApiError).statusCode===503);assert.equal(credentials.password,undefined);assert.equal(f.state.commits,0);
 }
 const f=fixture(),client=f.deps.createClient();client.auth.signInWithPassword=(async()=>({data:{user:null,session:null},error:{status:429}})) as typeof client.auth.signInWithPassword;
 await assert.rejects(f.guard(actor,f.credentials(),f.commit),(e:unknown)=>(e as ApiError).statusCode===429);assert.equal(f.state.commits,0);
});

test("revocation during password verification rechecks the original bearer and application session",async()=>{
 const f=fixture();let reads=0;
 const revoked=createDeletionPasswordGuard({...f.deps,user:async()=>++reads===1?({id,email:"admin@example.invalid"} as User):null});
 await assert.rejects(revoked(actor,f.credentials(),f.commit),(e:unknown)=>(e as ApiError).statusCode===401);assert.equal(f.state.signOuts,1);assert.equal(f.state.commits,0);
 const {AppSessionError}=await import("../src/services/app-session.service.js");
 const sessionExpired=createDeletionPasswordGuard({...f.deps,session:async()=>{throw new AppSessionError("Session expired","ADMIN_SESSION_EXPIRED",401);}});
 await assert.rejects(sessionExpired(actor,f.credentials(),f.commit),(e:unknown)=>(e as ApiError).statusCode===401);assert.equal(f.state.commits,0);
});

test("a failed verification releases its concurrency gate without creating reusable authorization",async()=>{
 const f=fixture();await assert.rejects(f.guard(actor,f.credentials("wrong"),f.commit));
 assert.equal(await f.guard(actor,f.credentials(),f.commit),"committed");assert.equal(f.state.signIns,2);
 await assert.rejects(f.guard(actor,{...f.credentials(),password:undefined},f.commit));assert.equal(f.state.commits,1);
});

test("password success cannot bypass a feature gate disabled while confirmation is processing",async()=>{
 const {createWholeTripDeleter}=await import("../src/services/whole-trip-deletion.service.js");
 const flag=process.env.WHOLE_TRIP_DELETE_ENABLED,rpc=supabaseAdmin.rpc;let calls=0;
 supabaseAdmin.rpc=(async()=>{calls++;throw Error("Must not reach RPC");}) as typeof rpc;
 const remove=createWholeTripDeleter(async(_actor,_credentials,commit)=>{delete process.env.WHOLE_TRIP_DELETE_ENABLED;return commit();});
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";await assert.rejects(remove(actor,[id]),/disabled/);assert.equal(calls,0);}
 finally{supabaseAdmin.rpc=rpc;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});

test("record deletion verifies the current Staff password without weakening Admin-only whole-trip policy",async()=>{
 const f=fixture(),staff={id,role:"STAFF"};
 const verify=createCurrentUserPasswordGuard(f.deps,async()=>"STAFF");
 assert.equal(await verify(staff,f.credentials(),f.commit),"committed");
 await assert.rejects(f.guard(staff,f.credentials(),f.commit),/Only ADMIN/);
 await assert.rejects(verify({...staff,role:"TRUCKER"},f.credentials(),f.commit));
 await assert.rejects(verify({...staff,id:other},f.credentials(),f.commit),/session/);
 assert.equal(f.state.commits,1);
});
test("record deletion rejects another account's identity and roles changed during authentication",async()=>{
 const f=fixture();let reads=0;
 const verify=createCurrentUserPasswordGuard(f.deps,async()=>++reads===1?"ADMIN":"STAFF");
 await assert.rejects(verify(actor,f.credentials(),f.commit),/not authorized/);
 f.state.wrongIdentity=true;const check=createCurrentUserPasswordGuard(f.deps,async()=>"ADMIN");
 await assert.rejects(check(actor,f.credentials(),f.commit),/password could not be verified/);
 assert.equal(f.state.commits,0);
});
