import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {io,type Socket} from "socket.io-client";
import {parseDraftPacket} from "../src/services/cell-draft.logic.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const target={table:"combined",source:"trip_stops",recordId:id(2),tripId:id(1),stopId:id(2),field:"dispatch_number"};
const packet=(sessionId=id(10),sequence=1,value="draft")=>({target,sessionId,sequence,value,phase:"editing"});
const event=(s:Socket,name:string)=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{s.off(name,receive);reject(Error(`Missing ${name}`));},1500);const receive=(value:unknown)=>{clearTimeout(timer);resolve(value);};s.once(name,receive);});
test("draft parser rejects identity/role spoofing, protected fields, invalid scope, size and sequence",()=>{
 assert.equal(parseDraftPacket(packet(),"STAFF").target.recordId,id(2));
 for(const change of [{name:"spoof"},{value:"a".repeat(8193)},{value:"😀".repeat(3000)},{sequence:0},{sequence:1.2},{target:{...target,source:"profiles",field:"password"}},{target:{...target,field:"stop_sequence"}},{target:{...target,table:"users:staff"}},{target:{...target,source:"trips",field:"subcon_rate_manual",table:"operations"}}])assert.throws(()=>parseDraftPacket({...packet(),...change},"ADMIN"));
 assert.throws(()=>parseDraftPacket(packet(),"TRUCKER"));
});
test("real socket draft transport isolates cells, authorizes once, rejects stale events and cleans up",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";process.env.WEB_CONCURRENCY="1";delete process.env.SOCKET_REDIS_URL;
 const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 let reads=0,allow=true;const http=createServer((_req,res)=>{res.statusCode=404;res.end();});
 const service=await attachCollaborationServer(http,{bridge:false,draftTtl:5000,sessionCheckMs:500,authenticate:async token=>{
  if(!["admin","staff","trucker"].includes(String(token)))throw Error("Invalid JWT");
  return {id:String(token),role:token==="admin"?"ADMIN":token==="staff"?"STAFF":"TRUCKER",name:`Trusted ${token}`,expiresAt:Date.now()+60000};
 },authorizeDraft:async cell=>{reads++;if(!allow||cell.tripId!==id(1)||![id(2),id(3)].includes(cell.recordId))throw Error("Scope denied");}});
 await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));
 const port=(http.address() as {port:number}).port,clients:Socket[]=[];
 const connect=async(token:string)=>{const s=io(`http://127.0.0.1:${port}`,{transports:["websocket"],reconnection:false,autoConnect:false,auth:{token,role:"ADMIN"}});clients.push(s);const ready=event(s,"connect");s.connect();await ready;return s;};
 try{
  const a=await connect("admin"),b=await connect("staff"),outsider=await connect("staff"),trucker=await connect("trucker");
  for(const s of [a,b])assert.equal((await s.emitWithAck("room:join",{kind:"table",key:"combined"})).ok,true);
  await outsider.emitWithAck("room:join",{kind:"table",key:"dispatch"});
  let leaked=0;outsider.on("cell:draft-changed",()=>leaked++);
  assert.equal((await trucker.emitWithAck("cell:edit-start",packet())).ok,false);
  const initial=event(b,"cell:draft-changed");assert.equal((await a.emitWithAck("cell:edit-start",packet())).ok,true);
  assert.equal((await initial).name,"Trusted admin");
  const baseline=reads;
  for(const [index,value]of ["L","Li","Liv","Live"].entries()){
   const remote=event(b,"cell:draft-changed");assert.equal((await a.emitWithAck("cell:draft-changed",packet(id(10),index+2,value))).ok,true);assert.equal((await remote).value,value);
  }
  assert.equal(reads,baseline,"typing performs no new record authorization queries");
  assert.equal((await a.emitWithAck("cell:draft-changed",packet(id(10),2,"stale"))).ok,false);
  const same=event(a,"cell:draft-changed");assert.equal((await b.emitWithAck("cell:edit-start",packet(id(11),1,"independent"))).ok,true);assert.equal((await same).userId,"staff");
  const sibling=event(b,"cell:draft-changed");await a.emitWithAck("cell:edit-start",{...packet(id(12)),target:{...target,recordId:id(3),stopId:id(3)}});assert.equal((await sibling).target.recordId,id(3));
  const ended=event(b,"cell:edit-ended");assert.equal((await a.emitWithAck("cell:edit-end",{sessionId:id(10),sequence:10})).ok,true);assert.equal((await ended).sessionId,id(10));
  assert.equal((await a.emitWithAck("cell:draft-changed",packet(id(10),11,"late"))).ok,false);
  await a.emitWithAck("cell:edit-end",{sessionId:id(99),sequence:2});assert.equal((await a.emitWithAck("cell:edit-start",packet(id(99)))).ok,false);
  assert.equal(leaked,0);
  allow=false;const revoked=event(b,"cell:edit-rejected");assert.equal((await revoked).sessionId,id(11));
  assert.equal((await b.emitWithAck("cell:draft-changed",packet(id(11),2,"revoked"))).ok,false);
 }finally{clients.forEach(s=>s.disconnect());await service.close();}
});
test("report draft allowlists follow real editable mappings rather than display/computed columns",async()=>{
 const {DRAFT_REPORT_FIELDS}=await import("../src/config/cell-draft-fields.js");
 const {getReportEditDefinition}=await import("../../frontend/src/services/report-editing.config.js");
 const {REPORT_DEFINITIONS}=await import("../src/config/reports.js");
 const source:Record<string,string>={trip:"trips",stop:"trip_stops",lineItem:"trip_line_items",assignment:"trip_truck_assignments",billing:"billings",storeCall:"store_calls",loadingReport:"loading_reports"};
 for(const table of ["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"]){
  for(const column of REPORT_DEFINITIONS[table]!.columns)for(const row of [{},{trip_stop_id:id(1)}]){
   const definition=getReportEditDefinition(table as any,column.key,row);if(!definition||definition.sourceField==="transmittal_ref")continue;
   assert.ok(DRAFT_REPORT_FIELDS[table]?.[source[definition.sourceEntity]!]?.includes(definition.sourceField),`${table}.${column.key}`);
  }
 }
});

test("draft authorization checks physical parents, converted reports and existing child ownership without writes",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js"),{authorizeCellDraft}=await import("../src/services/cell-draft-authorization.js");
 const original=supabaseAdmin.from;let converted=false;
 const rows:Record<string,any>={trips:{id:id(1),archived_at:null},trip_stops:{id:id(2),trip_id:id(1)},loading_reports:{id:id(4),trip_id:id(1)},offloads:{id:id(5),trip_id:id(1),trip_stop_id:id(2)},offload_items:{id:id(6),offload_id:id(5)}};
 (supabaseAdmin as any).from=(table:string)=>{
  const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:rows[table]??null,error:null}),limit:async()=>({data:converted?[{id:id(7)}]:[],error:null})};return chain;
 };
 const actor={id:"staff",role:"STAFF",name:"Staff",expiresAt:Date.now()+10000};
 try{
  await authorizeCellDraft(actor,target);
  await assert.rejects(authorizeCellDraft(actor,{...target,tripId:id(9)}),/owner/);
  await assert.rejects(authorizeCellDraft(actor,{...target,stopId:id(3)}),/owner/);
  await authorizeCellDraft(actor,{table:"combined",source:"loading_reports",recordId:id(4),tripId:id(1),field:"loading_start_at"});
  await authorizeCellDraft(actor,{table:"operations",source:"offloads",recordId:id(5),tripId:id(1),stopId:id(2),field:"item.quantity"});
  await authorizeCellDraft(actor,{table:"operations",source:"offload_items",recordId:id(6),tripId:id(1),stopId:id(2),reportId:id(5),field:"quantity"});
  await assert.rejects(authorizeCellDraft(actor,{table:"operations",source:"offload_items",recordId:id(6),tripId:id(1),reportId:id(9),field:"quantity"}),/report/);
  converted=true;await assert.rejects(authorizeCellDraft(actor,{table:"operations",source:"offloads",recordId:id(5),field:"comments"}),/read-only/);
  rows.trip_stops.archived_at="now";await assert.rejects(authorizeCellDraft(actor,target),/unavailable/);
 }finally{supabaseAdmin.from=original;}
});

test("draft expiry, cancellation during authorization, disconnect and per-user budgets fail safely",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";process.env.WEB_CONCURRENCY="1";delete process.env.SOCKET_REDIS_URL;
 const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 let release:(()=>void)|undefined,slow=false;
 const http=createServer(),service=await attachCollaborationServer(http,{bridge:false,draftTtl:200,sessionCheckMs:60000,authenticate:async token=>({id:String(token),role:"STAFF",name:"Trusted",expiresAt:Date.now()+60000}),authorizeDraft:async()=>{if(slow)await new Promise<void>(resolve=>{release=resolve;});}});
 await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));const clients:Socket[]=[];
 const connect=async(token:string)=>{const s=io(`http://127.0.0.1:${(http.address() as any).port}`,{transports:["websocket"],reconnection:false,autoConnect:false,auth:{token}});clients.push(s);const ready=event(s,"connect");s.connect();await ready;await s.emitWithAck("room:join",{kind:"table",key:"combined"});return s;};
 try{
  const a=await connect("one"),b=await connect("two");
  const timeout=event(b,"cell:edit-ended");await a.emitWithAck("cell:edit-start",packet());assert.equal((await timeout).reason,"expired");
  slow=true;const starting=a.emitWithAck("cell:edit-start",packet(id(11)));while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  await a.emitWithAck("cell:edit-end",{sessionId:id(11),sequence:2});release!();assert.equal((await starting).ok,false);slow=false;
  await a.emitWithAck("cell:edit-start",packet(id(12)));const disconnected=event(b,"cell:edit-ended");a.disconnect();assert.equal((await disconnected).sessionId,id(12));
  const c=await connect("budget"),d=await connect("budget");
  await c.emitWithAck("cell:edit-start",packet(id(20)));
  let rejected=0;for(let seq=2;seq<=65;seq++)if(!(await c.emitWithAck("cell:draft-changed",packet(id(20),seq))).ok)rejected++;
  assert.ok(rejected>0,"typing is rate limited");assert.equal((await d.emitWithAck("cell:edit-start",packet(id(21)))).ok,false,"same user cannot evade budget with another tab");
  assert.equal((await c.emitWithAck("cell:edit-end",{sessionId:id(20),sequence:100})).ok,true,"cleanup remains possible after exhausting budget");
 }finally{clients.forEach(s=>s.disconnect());await service.close();}
});
