import type { Server as HttpServer } from "node:http";
import {withSupabaseDeadline} from '../utils/supabase-request-scope.js';
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { supabaseAdmin } from "../config/supabase.js";
import {trackingEvents} from "./tracking-runtime.service.js";
import { authenticateCollaboration,canJoinTrip,type SocketActor } from "./collaboration-auth.service.js";
import { canViewTable,SOURCE_FIELDS,collaborationColor,management,parseCellTarget,validVersion,type Commit } from "./collaboration.logic.js";
import { collaborationEvents,setCollaborationVersionsReady } from "./collaboration-events.js";
import { readCollaborationRecord } from "./collaboration-record.service.js";
import { isValidUuid } from "../utils/validation.js";
import {getTableAccess} from "./flexible-table.service.js";
import { attachCellDrafts } from "./cell-draft-server.js";
import { authorizeCellDraft } from "./cell-draft-authorization.js";
import type { DraftTarget } from "./cell-draft.logic.js";
import { authorizeTrackerDraftView } from "./transmittal-tracker.service.js";
import { notifyDriverActivity } from "./driver-notification.service.js";

type Options={authenticate?:typeof authenticateCollaboration;canTrip?:typeof canJoinTrip;authorizeCell?:(target:ReturnType<typeof parseCellTarget>)=>Promise<void>;authorizeDraft?:(target:DraftTarget)=>Promise<void>;draftTtl?:number;bridge?:boolean;presenceTtl?:number;viewTtl?:number;sessionCheckMs?:number;redisUrl?:string};
export async function attachCollaborationServer(http:HttpServer,options:Options={}){
 const origins=(process.env.SOCKET_ORIGINS??"http://localhost:5173,http://127.0.0.1:5173").split(",").map(v=>v.trim());
 const io=new Server(http,{transports:["websocket"],maxHttpBufferSize:16384,pingInterval:25000,pingTimeout:20000,cors:{origin:origins},allowRequest:(req,done)=>done(null,!req.headers.origin||origins.includes(req.headers.origin))});
 const redisUrl=options.redisUrl??process.env.SOCKET_REDIS_URL;
 const workers=Number(process.env.WEB_CONCURRENCY??1);
 if(!Number.isSafeInteger(workers)||workers<1||workers>1&&!redisUrl)throw Error("Valid worker topology and shared collaboration adapter are required");
 const pub=redisUrl?createClient({url:redisUrl}):null,sub=pub?.duplicate();
 if(pub&&sub){const unavailable=()=>io.emit("draft:availability",{available:false});pub.on("error",unavailable);sub.on("error",unavailable);const ready=()=>{if(pub.isReady&&sub.isReady)io.emit("draft:availability",{available:true});};pub.on("ready",ready);sub.on("ready",ready);await Promise.all([pub.connect(),sub.connect()]);io.adapter(createAdapter(pub,sub));}
 const auth=options.authenticate??authenticateCollaboration,canTrip=options.canTrip??canJoinTrip,ttl=options.presenceTtl??45000;
 const seen=new Map<string,number>(),truckerSeen=new Map<string,number>();let bridgeHealthy=false;
 const emitCommit=(event:Commit)=>{
  const key=event.eventId+(event.fields.length?":confirmed":":signal");
  if(seen.has(key))return;
  seen.set(key,Date.now());if(seen.size>5000)seen.delete(seen.keys().next().value!);
  if(event.draftOnly){io.to("management").emit("cell:saved-notice",event);return;}
  io.to("management").emit(event.version===null?"table:invalidated":"cell:committed",event);
  // Only locally connected authorized trip subscribers receive Trucker signals.
  // Every instance has the durable DB bridge; Redis relays management/presence.
  for(const socket of io.of("/").sockets.values()){
   const actor:SocketActor=socket.data.actor;
   if(actor.role!=="TRUCKER"||!event.tripId||!socket.rooms.has(`trip:${event.tripId}`))continue;
   const signalKey=`${socket.id}:${event.eventId}`;
   if(truckerSeen.has(signalKey))continue;truckerSeen.set(signalKey,Date.now());
   if(truckerSeen.size>5000)truckerSeen.delete(truckerSeen.keys().next().value!);
   void canTrip(actor,event.tripId).then(allowed=>{if(!socket.connected)return;if(!allowed)void socket.leave(`trip:${event.tripId}`);socket.emit("trucker:changed",{kind:allowed?"trip":"assignments"});}).catch(()=>{truckerSeen.delete(signalKey);});
  }
 };
 collaborationEvents.on("commit",emitCommit);
 const emitLayout=(value:{table:string;column:string;revision:number;eventId:string})=>io.to("management").emit("table:layout-updated",value);
 collaborationEvents.on("layout",emitLayout);
 const viewers=async(table:string)=>{
  const room=`table:${table}`,peers=await io.in(room).fetchSockets(),users=new Map<string,{userId:string;name:string;avatarUrl:string|null;color:string}>();
  for(const peer of peers){const actor=peer.data.actor as SocketActor;if(!actor||!canViewTable(actor.role,table)||!peer.data.tableViews?.[table])continue;users.set(actor.id,{userId:actor.id,name:actor.name,avatarUrl:actor.avatarUrl??null,color:collaborationColor(actor.id)});}
  io.to(room).emit("table:viewers",{table,users:[...users.values()].sort((a,b)=>a.userId.localeCompare(b.userId))});
 };
 const publishViewers=(table:string)=>{void viewers(table).catch(()=>{});};
 const attempts=new Map<string,{count:number;since:number}>();
 const draftBudgets=new Map<string,{count:number;since:number}>();
 io.use(async(socket,next)=>{try{
  const address=socket.handshake.address,now=Date.now();
  for(const [key,value] of attempts)if(value.since<now-60000)attempts.delete(key);
  const budget=attempts.get(address)??{count:0,since:now};
  if(++budget.count>60||attempts.size>=10000)throw Error("Authentication rate limit");
  attempts.set(address,budget);
  socket.data.actor=await auth(socket.handshake.auth.token,socket.handshake.auth.appSession);next();
 }catch{next(new Error("Authentication or application session is invalid"));}});
 io.on("connection",socket=>{
  socket.on("error",()=>{});
  const actor:SocketActor=socket.data.actor;
  socket.data.presences={};socket.data.tableViews={};socket.data.roomCount=0;
  const drafts=attachCellDrafts(io,socket,actor,{ttl:options.draftTtl??15000,
   authorize:options.authorizeDraft??(options.authorizeCell?(target=>options.authorizeCell!({...target,status:"editing"})):(target=>authorizeCellDraft(actor,target))),
   consume:async()=>{if(pub&&sub){if(!pub.isReady||!sub.isReady)return false;try{return Number(await pub.eval("local t=redis.call('TIME'); local w=redis.call('HGET',KEYS[1],'window'); if w~=t[1] then redis.call('HSET',KEYS[1],'window',t[1],'count',0) end; local n=redis.call('HINCRBY',KEYS[1],'count',1); redis.call('PEXPIRE',KEYS[1],2000); return n<=60 and 1 or 0",{keys:[`alzhen:cell-draft:${actor.id}`],arguments:[]}))===1;}catch{socket.emit("draft:availability",{available:false});return false;}}
    const now=Date.now(),current=draftBudgets.get(actor.id);const entry=current&&current.since>now-1000?current:{count:0,since:now};draftBudgets.set(actor.id,entry);return ++entry.count<=60;}});
  socket.emit("draft:availability",{available:!pub||Boolean(pub.isReady&&sub?.isReady)});
  void socket.join(`user:${actor.id}`);if(management(actor.role))void socket.join("management");
  socket.emit("bridge:status",{healthy:bridgeHealthy});
  let budget=0,windowStart=Date.now(),checking=false,draftBurst=0,draftWindow=Date.now();
  const expiry=setTimeout(()=>socket.disconnect(true),Math.max(0,actor.expiresAt-Date.now()));
  const sessionTimer=setInterval(()=>{if(checking)return;checking=true;void auth(socket.handshake.auth.token,socket.handshake.auth.appSession,false).then(next=>{if(next.id!==actor.id||next.role!==actor.role){socket.disconnect(true);return;}
   void drafts.revalidate();
   if(socket.rooms.has("table:transmittal-tracker")&&!options.authorizeDraft&&!options.authorizeCell)void authorizeTrackerDraftView({id:actor.id,role:actor.role as "ADMIN"|"STAFF"}).catch(()=>{leavePresence("transmittal-tracker");if(socket.data.tableViews["transmittal-tracker"]){delete socket.data.tableViews["transmittal-tracker"];socket.data.roomCount--;}void Promise.resolve(socket.leave("table:transmittal-tracker")).then(()=>publishViewers("transmittal-tracker"));socket.emit("table:access-revoked",{table:"transmittal-tracker"});socket.emit("table:viewers",{table:"transmittal-tracker",users:[]});});
   for(const table of Object.keys(socket.data.tableViews))if(table.startsWith("flex:"))void getTableAccess(table.slice(5),{id:actor.id,role:actor.role as "ADMIN"|"STAFF"},"view").catch(()=>{if(socket.data.tableViews[table]){delete socket.data.tableViews[table];socket.data.roomCount--;void Promise.resolve(socket.leave(`table:${table}`)).then(()=>publishViewers(table));socket.emit("table:viewers",{table,users:[]});}});}).catch(()=>socket.disconnect(true)).finally(()=>{checking=false;});},options.sessionCheckMs??30000);
  socket.use((_packet,next)=>{if(Date.now()>=actor.expiresAt){socket.disconnect(true);return;}if(["cell:edit-start","cell:draft-changed","cell:edit-end"].includes(_packet[0])){if(Date.now()-draftWindow>=1000){draftWindow=Date.now();draftBurst=0;}if(++draftBurst>120){next(new Error("Collaboration rate limit exceeded"));return;}next();return;}if(Date.now()-windowStart>10000){budget=0;windowStart=Date.now();}if(++budget>50){next(new Error("Collaboration rate limit exceeded"));return;}next();});
  socket.on("room:join",async(value,ack)=>{try{
   if(!value||typeof value!=="object"||Object.keys(value).some(k=>!["kind","key"].includes(k))||typeof value.key!=="string")throw Error("Invalid room");
   let room:string;
   if(value.kind==="table"&&canViewTable(actor.role,value.key)){
    if(value.key==="transmittal-tracker"&&!options.authorizeDraft&&!options.authorizeCell)await authorizeTrackerDraftView({id:actor.id,role:actor.role as "ADMIN"|"STAFF"});
    if(value.key.startsWith("flex:"))await getTableAccess(value.key.slice(5),{id:actor.id,role:actor.role as "ADMIN"|"STAFF"},"view");
    room=`table:${value.key}`;
   }
   else if(value.kind==="trip"&&isValidUuid(value.key)&&await canTrip(actor,value.key))room=`trip:${value.key}`;
   else throw Error("Room access denied");
   if(!socket.connected||Date.now()>=actor.expiresAt)throw Error("Session expired");
   if(!socket.rooms.has(room)&&socket.data.roomCount>=12)throw Error("Too many rooms");
   if(!socket.rooms.has(room))socket.data.roomCount++;
   await socket.join(room);
   if(value.kind==="table"){socket.data.tableViews[value.key]=Date.now();publishViewers(value.key);const peers=await io.in(room).fetchSockets();socket.emit("presence:snapshot",peers.flatMap(peer=>Object.values(peer.data.presences??{})));socket.emit("cell:draft-snapshot",peers.flatMap(peer=>Object.values(peer.data.drafts??{})).filter((draft:any)=>draft.target?.table===value.key).slice(-64));}
   if(typeof ack==="function")ack({ok:true});
  }catch{if(typeof ack==="function")ack({ok:false,error:"Room unavailable or access denied"});}});
  const leavePresence=(table:string)=>{drafts.leave(table);if(!socket.data.presences[table])return;delete socket.data.presences[table];io.to(`table:${table}`).emit("cell:presence-leave",{socketId:socket.id,table});};
  socket.on("room:leave",value=>{if(!value||!["table","trip"].includes(value.kind)||typeof value.key!=="string")return;const room=`${value.kind}:${value.key}`;if(socket.rooms.has(room)){if(value.kind==="table"){leavePresence(value.key);delete socket.data.tableViews[value.key];}socket.data.roomCount--;void Promise.resolve(socket.leave(room)).then(()=>{if(value.kind==="table")publishViewers(value.key);});}});
  socket.on("table:heartbeat",()=>{for(const table of Object.keys(socket.data.tableViews)){socket.data.tableViews[table]=Date.now();publishViewers(table);}});
  let presenceSerial=0;const validated=new Map<string,number>();
  socket.on("cell:presence",async(value,ack)=>{const serial=++presenceSerial;try{
   if(!management(actor.role))throw Error("Not permitted");const target=parseCellTarget(value);
   if(!socket.rooms.has(`table:${target.table}`))throw Error("Join table first");
   const key=JSON.stringify([target.source,target.recordId,target.tripId,target.stopId]);
   if((validated.get(key)??0)<Date.now()-15000){
    if(options.authorizeCell)await options.authorizeCell(target);
    else{const record=await readCollaborationRecord(target.source,target.recordId);if(target.tripId&&(target.source==="trips"?record.id:record.trip_id)!==target.tripId)throw Error("Wrong trip");if(target.stopId&&(target.source==="trip_stops"?record.id:record.trip_stop_id)!==target.stopId)throw Error("Wrong stop");}
    validated.clear();validated.set(key,Date.now());
   }
   if(serial!==presenceSerial||!socket.connected)return;
   const presence={...target,socketId:socket.id,userId:actor.id,name:actor.name,color:collaborationColor(actor.id),expiresAt:Date.now()+ttl};
   socket.data.presences[target.table]=presence;socket.to(`table:${target.table}`).emit("cell:presence",presence);
   if(typeof ack==="function")ack({ok:true});
  }catch{if(typeof ack==="function")ack({ok:false,error:"Cell presence unavailable"});}});
  socket.on("cell:presence-leave",value=>{presenceSerial++;if(typeof value?.table==="string")leavePresence(value.table);});
  const sweep=setInterval(()=>{for(const [table,at] of Object.entries(socket.data.tableViews) as Array<[string,number]>)if(at<Date.now()-(options.viewTtl??45000)){delete socket.data.tableViews[table];socket.emit("table:expired",{table});void Promise.resolve(socket.leave(`table:${table}`)).then(()=>publishViewers(table));socket.data.roomCount--;leavePresence(table);}for(const [table,presence] of Object.entries(socket.data.presences) as Array<[string,{expiresAt:number}]>)if(presence.expiresAt<Date.now())leavePresence(table);},Math.min(5000,ttl));
  socket.on("disconnect",()=>{presenceSerial++;clearTimeout(expiry);clearInterval(sessionTimer);clearInterval(sweep);for(const table of Object.keys(socket.data.presences))leavePresence(table);for(const table of Object.keys(socket.data.tableViews))publishViewers(table);});
 });
 const emitTracking=(value:{assignmentId:string})=>{
  if(!isValidUuid(value.assignmentId))return;
  // The local acknowledgement and database bridge may report the same fix.
  // Captures are throttled upstream; coalesce only their short echo window.
  const key=`tracking:${value.assignmentId}`,last=seen.get(key);
  if(last&&Date.now()-last<1000)return;
  seen.set(key,Date.now());
  io.to("management").emit("tracking:changed",{assignmentId:value.assignmentId});
 };
 trackingEvents.on("changed",emitTracking);
 const channel=options.bridge===false?null:supabaseAdmin.channel(`collaboration-server-${process.pid}-${Date.now()}`);
 if(channel){
  channel.on('postgres_changes',{schema:'public',table:'trip_operational_signals',event:'*'},payload=>{
   const row=payload.new as Record<string,unknown>;
   if(typeof row.trip_id!=='string'||typeof row.record_id!=='string'||typeof row.source!=='string'||typeof row.revision!=='string')return;
   emitCommit({source:row.source,recordId:row.record_id,tripId:row.trip_id,fields:[],actorId:null,version:null,eventId:`operation:${row.revision}`});
  });
  channel.on('postgres_changes',{schema:'public',table:'device_security_signals',event:'*'},payload=>{
   const row=payload.new as Record<string,unknown>;
   if(typeof row.profile_id!=='string'||typeof row.revision!=='string')return;
   io.to(`user:${row.profile_id}`).emit('security:changed',{revision:row.revision});
  });
  channel.on("postgres_changes",{schema:"public",table:"trip_tracking_locations",event:"*"},payload=>{
   const record=(payload.eventType==="DELETE"?payload.old:payload.new) as Record<string,unknown>;
   if(typeof record.assignment_id==='string')emitTracking({assignmentId:record.assignment_id});
  });
  channel.on("postgres_changes",{schema:"public",table:"admin_notifications",event:"*"},payload=>{
   const notice=payload.new as Record<string,unknown>;
   if(typeof notice?.id!=="string"||typeof notice.recipient_profile_id!=="string")return;
   const key=`notice:${notice.id}:${notice.read_at??notice.created_at??"changed"}`;
   if(seen.has(key))return;seen.set(key,Date.now());
   // No message, OCR, Storage path or other recipient's data in the socket event.
   io.to(`user:${notice.recipient_profile_id}`).emit("notification:changed",{id:notice.id,revision:String(notice.read_at??notice.created_at??"changed")});
  });
  channel.on("postgres_changes",{schema:"public",table:"admin_change_signals",event:"*"},payload=>{
   const signal=payload.new as Record<string,unknown>;
   if(typeof signal.topic==="string"&&signal.topic.length<=100&&typeof signal.revision==="string")io.to("management").emit("datasets:invalidated",{topic:signal.topic,revision:signal.revision});
   if(["trips","trip_stops","trip_truck_assignments","customer_stores"].includes(String(signal.topic)))trackingEvents.emit("routes");
  });
  channel.on("postgres_changes",{schema:"public",table:"trip_events",event:"*"},payload=>{
   const record=(payload.eventType==="DELETE"?payload.old:payload.new) as Record<string,unknown>;
   if(typeof record.id!=="string"||typeof record.trip_id!=="string")return;
   emitCommit({source:"trip_events",recordId:record.id,tripId:record.trip_id,fields:[],actorId:null,version:null,operation:payload.eventType,eventId:`delivery:${record.id}:${record.delivery_version??0}`});
   if(payload.eventType==="INSERT"&&!record.assignment_id)void notifyDriverActivity("trip_events",record.id).catch(error=>console.warn("Driver event notification deferred:",error instanceof Error?error.message:error));
  });
  for(const source of Object.keys(SOURCE_FIELDS))channel.on("postgres_changes",{schema:"public",table:source,event:"*"},payload=>{
   const record=(payload.eventType==="DELETE"?payload.old:payload.new) as Record<string,unknown>;
   if(typeof record.id!=="string")return;const version=validVersion(record.collaboration_version);
   emitCommit({source,recordId:record.id,tripId:source==="trips"?record.id:typeof record.trip_id==="string"?record.trip_id:undefined,stopId:source==="trip_stops"?record.id:typeof record.trip_stop_id==="string"?record.trip_stop_id:undefined,fields:[],actorId:null,version,operation:payload.eventType,eventId:`${source}:${record.id}:${payload.eventType==="DELETE"?"deleted":version??record.updated_at??"changed"}`});
   if(source==="trip_truck_assignments"&&typeof record.driver_id==="string")void supabaseAdmin.from("drivers").select("profile_id").eq("id",record.driver_id).maybeSingle().then(result=>{if(result.data?.profile_id)io.to(`user:${result.data.profile_id}`).emit("trucker:changed",{kind:"assignments"});});
  });
  channel.subscribe(status=>{bridgeHealthy=status==="SUBSCRIBED";io.emit("bridge:status",{healthy:bridgeHealthy});});
 }
 let versionChecking=false;
 const versionCheck=async()=>{if(versionChecking)return;versionChecking=true;try{const result=await withSupabaseDeadline(10_000,async()=>await supabaseAdmin.from("trips").select("collaboration_version").limit(1).retry(false));setCollaborationVersionsReady(!result.error);}catch{setCollaborationVersionsReady(false);}finally{versionChecking=false;}};
 if(options.bridge!==false)void versionCheck();
 const versionTimer=options.bridge===false?null:setInterval(()=>void versionCheck(),60000);
 const seenTimer=setInterval(()=>{for(const cache of [seen,truckerSeen])for(const [key,time] of cache)if(time<Date.now()-120000)cache.delete(key);for(const[key,value]of draftBudgets)if(value.since<Date.now()-60000)draftBudgets.delete(key);},60000);
 return {io,publish:emitCommit,close:async()=>{trackingEvents.off("changed",emitTracking);collaborationEvents.off("commit",emitCommit);collaborationEvents.off("layout",emitLayout);if(versionTimer)clearInterval(versionTimer);clearInterval(seenTimer);if(channel)await supabaseAdmin.removeChannel(channel);await new Promise<void>(resolve=>io.close(()=>resolve()));await Promise.all([pub?.quit(),sub?.quit()]);}};
}
