import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";

test("POD HTTP reads accept Admin/Staff, deny Trucker access to administrative receipts and validate rejection before RPC",async()=>{
 const {supabaseAdmin:db,supabaseAuth}=await import("../src/config/supabase.js");
 const {sha256SessionIdentifier}=await import("../src/utils/session-rules.js");
 const {default:router}=await import("../src/routes/trip.routes.js");
 const trip="00000000-0000-4000-8000-000000000010",stop="00000000-0000-4000-8000-000000000020",receipt="00000000-0000-4000-8000-000000000030";
 const names=["admin","staff","owner","other"];
 const profiles=names.map((name,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,role:i===0?"ADMIN":i===1?"STAFF":"TRUCKER",name}));
 const sessions=names.map((_,i)=>String(i+1).repeat(43));
 const data:Record<string,Record<string,unknown>[]>={profiles,
  admin_staff_session_days:profiles.slice(0,2).map((p,i)=>({profile_id:p.id,role:p.role,session_hash:sha256SessionIdentifier(sessions[i]),expires_at:new Date(Date.now()+86400000).toISOString()})),
  trucker_active_sessions:profiles.slice(2).map((p,i)=>({profile_id:p.id,session_hash:sha256SessionIdentifier(sessions[i+2])})),
  trip_images:[{id:receipt,trip_id:trip,trip_stop_id:stop,kind:"receipt",storage_path:"synthetic-only.png",dr_number:"2468",ocr_text:"DR 2468",ocr_version:1,pod_review_status:"PENDING"}]};
 const before=JSON.stringify(data.trip_images),original=db.from,rpc=db.rpc,getUser=supabaseAuth.auth.getUser,storage=db.storage.from,flag=process.env.POD_REVIEW_ENABLED;
 let signed=0,rpcCalls=0;
 supabaseAuth.auth.getUser=(async(token:string)=>({data:{user:profiles.find(p=>p.name===token)??null},error:null})) as typeof getUser;
 db.from=((table:string)=>{
  assert.ok(table in data,`Unexpected table: ${table}`);const filters:Array<(row:Record<string,unknown>)=>boolean>=[];let single=false;
  const q={select:()=>q,order:()=>q,eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return q;},maybeSingle:()=>{single=true;return q;},then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>{const rows=data[table].filter(row=>filters.every(f=>f(row)));return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);}};return q;
 }) as typeof original;
 db.rpc=(async(name:string)=>{if(name==='check_device_session_v1')return {data:'ACTIVE',error:null};rpcCalls++;throw Error("No review writes expected");}) as typeof rpc;
 db.storage.from=(()=>({createSignedUrl:async()=>{signed++;return {data:{signedUrl:"https://isolated.test/synthetic-only"},error:null};}})) as typeof storage;
 const app=express();app.use(express.json());app.use(router);const server=createServer(app);
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw Error("port");
 const base=`http://127.0.0.1:${address.port}`;
 const call=(name:string,path:string,body?:object)=>fetch(base+path,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${name}`,"X-App-Session":sessions[names.indexOf(name)],"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
 try{
  process.env.POD_REVIEW_ENABLED="true";
  assert.equal((await fetch(`${base}/${trip}/receipts`)).status,401);
  for(const name of ["admin","staff"]){assert.equal((await call(name,"/pod-review-capabilities")).status,200);const response=await call(name,`/${trip}/receipts`);assert.equal(response.status,200);assert.equal((await response.json()).data[0].trip_stop_id,stop);}
  assert.equal(signed,2);
  for(const name of ["owner","other"]){assert.equal((await call(name,`/${trip}/receipts`)).status,403);assert.equal((await call(name,`/${trip}/receipts/${receipt}/decision`,{decision:"APPROVED"})).status,403);}
  assert.equal((await call("staff",`/${trip}/receipts/${receipt}/decision`,{request_id:"00000000-0000-4000-8000-000000000099",decision:"REJECTED",reason:" ",reviewed_fields:{},expected_review_version:0,expected_ocr_version:1})).status,400);
  assert.equal(rpcCalls,0);assert.equal(signed,2);assert.equal(JSON.stringify(data.trip_images),before);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.from=original;db.rpc=rpc;db.storage.from=storage;supabaseAuth.auth.getUser=getUser;if(flag===undefined)delete process.env.POD_REVIEW_ENABLED;else process.env.POD_REVIEW_ENABLED=flag;}
});
