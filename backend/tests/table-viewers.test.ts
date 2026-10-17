import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {io,type Socket} from "socket.io-client";
test("table viewers are authorized, include self, deduplicate tabs and leave exact rooms",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 const http=createServer(),service=await attachCollaborationServer(http,{bridge:false,authenticate:async token=>{if(typeof token!=="string")throw Error();return {id:token,role:token==="driver"?"TRUCKER":token==="admin"?"ADMIN":"STAFF",name:token,avatarUrl:token==="admin"?"https://example.invalid/avatar.png":null,expiresAt:Date.now()+60000};}});
 await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));const port=(http.address() as {port:number}).port,clients:Socket[]=[],snapshots=new Map<string,any>();
 const connect=async(id:string)=>{const s=io(`http://127.0.0.1:${port}`,{transports:["websocket"],auth:{token:id}});clients.push(s);s.on("table:viewers",v=>snapshots.set(`${s.id}:${v.table}`,v));await new Promise<void>(r=>s.once("connect",r));return s;};
 const wait=async(check:()=>boolean)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail("Viewer roster did not converge");};
 try{
  const a=await connect("admin"),b=await connect("staff"),other=await connect("other"),driver=await connect("driver");
  assert.equal((await driver.emitWithAck("room:join",{kind:"table",key:"trips"})).ok,false);
  assert.equal((await b.emitWithAck("room:join",{kind:"table",key:"users:staff"})).ok,false);
  assert.equal((await b.emitWithAck("room:join",{kind:"table",key:"invented"})).ok,false);
  for(const s of [a,b])assert.equal((await s.emitWithAck("room:join",{kind:"table",key:"trips"})).ok,true);
  await other.emitWithAck("room:join",{kind:"table",key:"combined"});
  await wait(()=>snapshots.get(`${b.id}:trips`)?.users.length===2);
  const roster=snapshots.get(`${b.id}:trips`).users;assert.deepEqual(roster.map((u:any)=>u.userId),["admin","staff"]);assert.equal(roster[0].avatarUrl,"https://example.invalid/avatar.png");assert.ok(!Object.hasOwn(roster[0],"role"));assert.ok(!Object.hasOwn(roster[0],"expiresAt"));
  const tab=await connect("admin");await tab.emitWithAck("room:join",{kind:"table",key:"trips"});await new Promise(r=>setTimeout(r,25));assert.equal(snapshots.get(`${b.id}:trips`).users.length,2);
  a.disconnect();await new Promise(r=>setTimeout(r,25));assert.equal(snapshots.get(`${b.id}:trips`).users.length,2);
  tab.disconnect();await wait(()=>snapshots.get(`${b.id}:trips`)?.users.length===1);
  await other.emitWithAck("room:join",{kind:"table",key:"trips"});await wait(()=>snapshots.get(`${b.id}:trips`)?.users.length===2);
  other.emit("room:leave",{kind:"table",key:"trips"});await wait(()=>snapshots.get(`${b.id}:trips`)?.users.length===1);
 }finally{clients.forEach(s=>s.disconnect());await service.close();}
});
test("a connected but silent viewer expires while a heartbeating viewer remains",async()=>{
 const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 const http=createServer(),service=await attachCollaborationServer(http,{bridge:false,viewTtl:120,presenceTtl:40,authenticate:async token=>({id:String(token),name:String(token),role:"STAFF",expiresAt:Date.now()+60000})});
 await new Promise<void>(r=>http.listen(0,"127.0.0.1",r));const port=(http.address() as {port:number}).port;
 const a=io(`http://127.0.0.1:${port}`,{transports:["websocket"],auth:{token:"silent"}}),b=io(`http://127.0.0.1:${port}`,{transports:["websocket"],auth:{token:"active"}});
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 try{
  await Promise.all([a,b].map(s=>new Promise<void>(r=>s.once("connect",r))));
  for(const s of [a,b])await s.emitWithAck("room:join",{kind:"table",key:"trips"});
  heartbeat=setInterval(()=>b.emit("table:heartbeat"),30);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Silent viewer did not expire")),1500);b.on("table:viewers",v=>{if(v.users.length===1&&v.users[0].userId==="active"){clearTimeout(timer);resolve();}});});
  assert.equal(a.connected,true);
 }finally{clearInterval(heartbeat);a.disconnect();b.disconnect();await service.close();}
});
