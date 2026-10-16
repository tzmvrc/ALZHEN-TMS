import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {io,type Socket} from "socket.io-client";

const trip="123e4567-e89b-42d3-a456-000000000010",stop="123e4567-e89b-42d3-a456-000000000012";
function event(socket:Socket,name:string){return new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>{socket.off(name,receive);reject(Error(`Missing ${name}`));},2500);const receive=(value:unknown)=>{clearTimeout(timeout);resolve(value);};socket.once(name,receive);});}
test("real Socket.IO transport enforces identity/rooms, metadata presence, cleanup and confirmed-event deduplication",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 const http=createServer((_req,res)=>res.end("fixture"));
 const actors:Record<string,{id:string;role:string;name:string}>={admin:{id:"admin",role:"ADMIN",name:"Fixture Admin"},staff:{id:"staff",role:"STAFF",name:"Fixture Staff"},trucker:{id:"trucker",role:"TRUCKER",name:"Fixture Driver"}};
 const service=await attachCollaborationServer(http,{bridge:false,presenceTtl:150,sessionCheckMs:50,
  authenticate:async(token,session)=>{if(typeof token!=="string"||!actors[token]||session!=="fixture-session")throw Error("Invalid JWT/session");return {...actors[token],expiresAt:Date.now()+60000};},
  canTrip:async(actor,id)=>actor.role!=="TRUCKER"||id===trip,
  authorizeCell:async cell=>{if(cell.tripId!==trip||cell.recordId!==stop)throw Error("Wrong scope");},
 });
 await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));
 const address=http.address() as {port:number};const clients:Socket[]=[];
 const client=(token:string,extra={})=>{const socket=io(`http://127.0.0.1:${address.port}`,{transports:["websocket"],autoConnect:false,reconnection:false,auth:{token,appSession:"fixture-session",...extra}});clients.push(socket);return socket;};
 try {
  const invalid=client("forged",{role:"ADMIN",userId:"admin"});const rejected=event(invalid,"connect_error");invalid.connect();await rejected;assert.equal(invalid.connected,false);
  const admin=client("admin"),staff=client("staff"),trucker=client("trucker",{role:"ADMIN"});
  for(const socket of [admin,staff,trucker]){const connected=event(socket,"connect");socket.connect();await connected;}
  assert.equal((await trucker.emitWithAck("room:join",{kind:"table",key:"trips"})).ok,false);
  assert.equal((await trucker.emitWithAck("room:join",{kind:"trip",key:stop})).ok,false);
  assert.equal((await trucker.emitWithAck("room:join",{kind:"trip",key:trip})).ok,true);
  for(const socket of [admin,staff])assert.equal((await socket.emitWithAck("room:join",{kind:"table",key:"trips"})).ok,true);
  const cell={table:"trips",source:"trip_stops",recordId:stop,tripId:trip,stopId:stop,field:"dispatch_number",status:"editing"};
  const peer=event(staff,"cell:presence");assert.equal((await admin.emitWithAck("cell:presence",cell)).ok,true);const presence=await peer;
  assert.equal(presence.name,"Fixture Admin");assert.equal(presence.userId,"admin");assert.equal(presence.field,"dispatch_number");assert.ok(!Object.hasOwn(presence,"value"));
  assert.equal((await admin.emitWithAck("cell:presence",{...cell,draft:"private text"})).ok,false);
  assert.equal((await admin.emitWithAck("cell:presence",{...cell,recordId:trip})).ok,false);
  const other=event(admin,"cell:presence");await staff.emitWithAck("cell:presence",{...cell,field:"transaction_number",status:"selected"});const second=await other;assert.notEqual(presence.color,second.color);
  const expired=event(staff,"cell:presence-leave");await expired;
  let commits=0,truckerLeaks=0,truckerRefreshes=0;staff.on("cell:committed",()=>commits++);trucker.on("cell:committed",()=>truckerLeaks++);trucker.on("trucker:changed",()=>truckerRefreshes++);
  const committed=event(staff,"cell:committed");const metadata={eventId:"trip_stops:fixture:1",source:"trip_stops",recordId:stop,tripId:trip,fields:["dispatch_number"],actorId:"admin",version:1};
  admin.emit("cell:committed",{...metadata,value:"spoofed"});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(commits,0,"clients cannot publish persistence");
  service.publish(metadata);service.publish(metadata);assert.deepEqual(await committed,metadata);await new Promise(resolve=>setTimeout(resolve,50));assert.equal(commits,1);assert.equal(truckerLeaks,0);
  service.publish({...metadata,fields:[],actorId:null});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(truckerRefreshes,1,"overlapping Supabase and confirmed-write signals refresh the assigned Trucker once");
  const leaving=event(staff,"cell:presence-leave");await admin.emitWithAck("cell:presence",cell);admin.disconnect();await leaving;
  const revoked=event(staff,"disconnect");actors.staff.role="TRUCKER";await revoked;assert.equal(staff.connected,false);
 }finally{clients.forEach(client=>client.disconnect());await service.close();}
});
