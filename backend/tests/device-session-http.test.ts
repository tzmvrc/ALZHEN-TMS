import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';process.env.SUPABASE_ANON_KEY='isolated-test';
test('device revocation and account locking deny all protected operations despite an otherwise valid bearer token',async()=>{
 const {supabaseAdmin:db,supabaseAuth}=await import('../src/config/supabase.js');
 const {authMiddleware}=await import('../src/middleware/auth.middleware.js');
 const {default:securityRouter}=await import('../src/routes/device-session.routes.js');
 const {sha256SessionIdentifier}=await import('../src/utils/session-rules.js');
 const original={from:db.from,rpc:db.rpc,getUser:supabaseAuth.auth.getUser};
 const id='00000000-0000-4000-8000-000000000001',session='S'.repeat(43);let role='TRUCKER',locked=false,device='ACTIVE',calls=0;
 supabaseAuth.auth.getUser=(async()=>({data:{user:{id}},error:null})) as any;
 db.from=((table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({error:null,data:table==='profiles'?{id,role,locked_at:locked?'2026-10-26T00:00:00Z':null}:table==='trucker_active_sessions'?{session_hash:sha256SessionIdentifier(session)}:{profile_id:id,role,expires_at:new Date(Date.now()+3600000).toISOString()}})};return q;}) as any;
 db.rpc=(async(name:string)=>({data:name==='check_device_session_v1'?device:null,error:null})) as any;
 const app=express();app.use(express.json());app.use('/users',securityRouter);app.use(authMiddleware);app.all('/protected/:operation',(_req,res)=>{calls++;res.json({success:true});});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
 const request=(operation:string,method='GET')=>fetch(`http://127.0.0.1:${address.port}/protected/${operation}`,{method,headers:{Authorization:'Bearer valid-but-revocable','X-App-Session':session}});
 try{
  assert.equal((await request('trips')).status,200);
  device='SESSION_REVOKED';for(const operation of ['trips','milestones','pod','reports','gps','admin']){const r=await request(operation,operation==='trips'?'GET':'POST');assert.equal(r.status,401);assert.equal((await r.json()).code,'SESSION_REVOKED');}assert.equal(calls,1);
  device='ACTIVE';locked=true;const lockedResult=await request('trips');assert.equal(lockedResult.status,403);assert.equal((await lockedResult.json()).code,'ACCOUNT_LOCKED');
  locked=false;device='SESSION_REVOKED';assert.equal((await request('trips')).status,401);device='ACTIVE';assert.equal((await request('trips')).status,200);
  const denied=await fetch(`http://127.0.0.1:${address.port}/users/${id}/device-security`,{method:'POST',headers:{Authorization:'Bearer valid','X-App-Session':session,'Content-Type':'application/json'},body:JSON.stringify({action:'lock',confirmed:true})});assert.equal(denied.status,403);
  role='ADMIN';const unconfirmed=await fetch(`http://127.0.0.1:${address.port}/users/${id}/device-security`,{method:'POST',headers:{Authorization:'Bearer valid','X-App-Session':session,'Content-Type':'application/json'},body:JSON.stringify({action:'lock'})});assert.equal(unconfirmed.status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.from=original.from;db.rpc=original.rpc;supabaseAuth.auth.getUser=original.getUser;}
});
