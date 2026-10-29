import { io,type Socket } from "socket.io-client";
import { apiGet,getAppSessionHeaders,type ApiResponse } from "./api.service";
import { configureDraftTransport,draftConnection,clearCellDrafts,receiveCellDraft,endRemoteCellDraft,noteDraftCommit,forgetTableDrafts,heartbeatCellDrafts,rejectLocalDraft } from "./cell-draft.service";
export type CellTarget={table:string;source:string;recordId:string;tripId?:string;assignmentId?:string;stopId?:string;field:string;status:"selected"|"editing"};
export type Presence=CellTarget&{socketId:string;userId:string;name:string;color:string};
export type Commit={eventId:string;source:string;recordId:string;tripId?:string;assignmentId?:string;stopId?:string;fields:string[];version:number|null;actorId:string|null;operation?:"INSERT"|"UPDATE"|"DELETE"};
export const COLLABORATION_SOURCES=["trips","trip_stops","trip_line_items","trip_truck_assignments","store_calls","billings"] as const;
export type TableViewer={userId:string;name:string;avatarUrl:string|null;color:string};
type Snapshot={connected:boolean;bridgeHealthy:boolean;presences:Presence[];viewers?:Record<string,TableViewer[]>};
type Event={kind:"security"}|{kind:"commit";commit:Commit}|{kind:"tracking";assignmentId?:string}|{kind:"trucker";scope?:"assignments"|"trip";assignmentId?:string}|{kind:"notification"}|{kind:"connected"}|{kind:"layout";table:string;column:string;revision:number}|{kind:"signal";topic:string;revision:string};
let socket:Socket|null=null,owner="",snapshot:Snapshot={connected:false,bridgeHealthy:false,presences:[]};
let stopCurrent:((preserveDrafts?:boolean)=>void)|null=null;
const watchers=new Set<()=>void>(),events=new Set<(event:Event)=>void>(),rooms=new Map<string,number>(),cells=new Map<string,CellTarget>(),versions=new Map<string,number>(),seen=new Set<string>();
const recordRequests=new Map<string,Promise<Record<string,unknown>>>();
const confirmedRecords=new Map<string,Record<string,unknown>>();
export function rememberConfirmedRecord(source:string,id:string,record:Record<string,unknown>){if(record.id!==id||typeof record.collaboration_version!=="number")return;const key=`${source}:${id}`,before=confirmedRecords.get(key);if(typeof before?.collaboration_version==="number"&&before.collaboration_version>record.collaboration_version)return;confirmedRecords.set(key,record);if(confirmedRecords.size>1000)confirmedRecords.delete(confirmedRecords.keys().next().value!);}
const received=new Map<string,number>();let presenceTimer:ReturnType<typeof setTimeout>|null=null;
const notify=()=>watchers.forEach(fn=>fn());
const emit=(event:Event)=>events.forEach(fn=>fn(event));
export const collaborationSnapshot=()=>snapshot;
export const subscribeCollaboration=(fn:()=>void)=>{watchers.add(fn);return()=>{watchers.delete(fn);};};
export const subscribeCollaborationEvents=(fn:(event:Event)=>void)=>{events.add(fn);return()=>{events.delete(fn);};};
export function rememberConfirmedVersion(source:string,id:string,version:unknown){
 if(typeof version!=="number"||!Number.isSafeInteger(version))return true;
 const key=`${source}:${id}`,current=versions.get(key)??-1;
 if(version<current)return false;versions.set(key,version);return true;
}
function presence(value:Presence){
 if(!value||typeof value.socketId!=="string"||typeof value.table!=="string"||typeof value.name!=="string")return;
 if(value.socketId===socket?.id)return;
 const key=`${value.table}:${value.socketId}`;received.set(key,Date.now());
 const existing=snapshot.presences.find(p=>`${p.table}:${p.socketId}`===key);
 if(existing&&existing.source===value.source&&existing.recordId===value.recordId&&existing.field===value.field&&existing.status===value.status&&existing.userId===value.userId&&existing.name===value.name&&existing.color===value.color)return;
 snapshot={...snapshot,presences:[...snapshot.presences.filter(p=>`${p.table}:${p.socketId}`!==key),value].slice(-500)};notify();
}
export function startCollaboration(token:string|null,profileId:string|undefined,role:string|undefined){
 const next=token&&profileId&&["ADMIN","STAFF","TRUCKER"].includes(role??"")?`${profileId}:${role}:${token}`:"";
 if(next===owner)return()=>{};
 const samePrincipal=Boolean(next&&owner.startsWith(`${profileId}:${role}:`));
 stopCurrent?.(samePrincipal);stopCurrent=null;socket?.disconnect();socket=null;owner=next;versions.clear();seen.clear();recordRequests.clear();confirmedRecords.clear();received.clear();if(samePrincipal)draftConnection(false);else clearCellDrafts();
 snapshot={connected:false,bridgeHealthy:false,presences:[]};notify();
 if(!next)return()=>{};
 const endpoint=import.meta.env?.VITE_SOCKET_URL??new URL(import.meta.env?.VITE_API_URL??"http://localhost:5000/api").origin;
 const client=io(endpoint,{transports:["websocket"],path:import.meta.env?.VITE_SOCKET_PATH??"/socket.io",autoConnect:false,reconnectionDelay:1000,reconnectionDelayMax:10000,auth:cb=>cb({token,appSession:getAppSessionHeaders()["X-App-Session"]})});socket=client;
 const active=()=>socket===client&&owner===next;
 let draftRoomsReady=false,draftRelayReady=true;
 configureDraftTransport((event,payload,ack)=>{if(!active()||!client.connected)return;if(event==="cell:draft-changed"&&(payload as {phase?:string})?.phase==="editing")client.volatile.emit(event,payload);else client.emit(event,payload,ack);});
 client.on("cell:draft-changed",value=>{if(active()&&rooms.has(`table:${value?.target?.table}`)&&value?.socketId!==client.id)receiveCellDraft(value);});
 client.on("cell:draft-snapshot",values=>{if(active()&&Array.isArray(values))for(const value of values)if(rooms.has(`table:${value?.target?.table}`)&&value.socketId!==client.id)receiveCellDraft(value);});
 client.on("cell:edit-ended",value=>{if(active()){endRemoteCellDraft(value);if(value?.socketId===client.id&&value?.reason==="expired")rejectLocalDraft(value.sessionId);}});
 client.on("cell:edit-rejected",value=>{if(active()&&typeof value?.sessionId==="string")rejectLocalDraft(value.sessionId);});
 client.on("draft:availability",value=>{if(active()){draftRelayReady=value?.available===true;draftConnection(draftRelayReady&&draftRoomsReady&&client.connected);}});
 client.on("cell:saved-notice",value=>{if(active()&&typeof value?.source==="string"&&typeof value?.recordId==="string"&&Array.isArray(value?.fields))noteDraftCommit(value,profileId!);});
 client.on("table:access-revoked",value=>{if(active()&&typeof value?.table==="string")forgetTableDrafts(value.table);});
 let retryTimer:ReturnType<typeof setTimeout>|undefined;
 client.on("connect",()=>{if(!active())return;snapshot={...snapshot,connected:true};notify();const joining=[...rooms.keys()].map(room=>new Promise<void>(resolve=>{const [kind,...parts]=room.split(":");client.timeout(5000).emit("room:join",{kind,key:parts.join(":")},()=>resolve());}));void Promise.all(joining).then(()=>{if(!active()||!client.connected)return;draftRoomsReady=true;draftConnection(draftRelayReady);for(const cell of cells.values())client.emit("cell:presence",cell);});emit({kind:"connected"});});
 client.on("disconnect",reason=>{if(!active())return;draftRoomsReady=false;draftConnection(false);snapshot={connected:false,bridgeHealthy:false,presences:[]};received.clear();notify();if(reason==="io server disconnect"){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(active())client.connect();},1500);}});
 client.on("connect_error",()=>{if(active()){snapshot={...snapshot,connected:false,bridgeHealthy:false};notify();}});
 client.on("bridge:status",value=>{if(active()){const recovered=!snapshot.bridgeHealthy&&value?.healthy===true;snapshot={...snapshot,bridgeHealthy:value?.healthy===true};notify();if(recovered&&snapshot.connected)emit({kind:'connected'});}});
 client.on('security:changed',value=>{if(active()&&typeof value?.revision==='string')emit({kind:'security'});});
 client.on("table:expired",value=>{if(active()&&typeof value?.table==="string"&&rooms.has(`table:${value.table}`))client.emit("room:join",{kind:"table",key:value.table});});
 client.on("table:viewers",value=>{if(!active()||typeof value?.table!=="string"||!rooms.has(`table:${value.table}`)||!Array.isArray(value.users))return;const users=value.users.filter((u:TableViewer)=>u&&typeof u.userId==="string"&&typeof u.name==="string").slice(0,500);snapshot={...snapshot,viewers:{...snapshot.viewers,[value.table]:users}};notify();});
 client.on("cell:presence",value=>{if(active())presence(value);});
 client.on("presence:snapshot",values=>{if(active()&&Array.isArray(values))values.forEach(presence);});
 client.on("cell:presence-leave",value=>{if(!active())return;received.delete(`${value?.table}:${value?.socketId}`);snapshot={...snapshot,presences:snapshot.presences.filter(p=>p.socketId!==value?.socketId||p.table!==value?.table)};notify();});
 const committed=(commit:Commit)=>{
  if(!active()||!commit||typeof commit.eventId!=="string"||!Array.isArray(commit.fields))return;
  const key=(commit.operation==="DELETE"?`${commit.source}:${commit.recordId}:deleted`:commit.eventId)+":"+commit.fields.join(",");if(seen.has(key))return;seen.add(key);if(seen.size>5000)seen.delete(seen.values().next().value!);
  if(!rememberConfirmedVersion(commit.source,commit.recordId,commit.version))return;
  noteDraftCommit(commit,profileId!);
  emit({kind:"commit",commit});
 };
 client.on("cell:committed",committed);client.on("table:invalidated",committed);
 client.on("table:layout-updated",value=>{if(active()&&typeof value?.table==="string"&&typeof value?.column==="string"&&Number.isSafeInteger(value.revision)){const key=`layout:${value.table}:${value.column}:${value.revision}`;if(seen.has(key))return;seen.add(key);if(seen.size>5000)seen.delete(seen.values().next().value!);emit({kind:"layout",table:value.table,column:value.column,revision:value.revision});}});
 client.on("datasets:invalidated",value=>{if(active()&&typeof value?.topic==="string"&&typeof value?.revision==="string")emit({kind:"signal",topic:value.topic,revision:value.revision});});
 client.on("trucker:changed",value=>{if(active())emit({kind:"trucker",scope:value?.kind==="assignments"?"assignments":"trip",assignmentId:typeof value?.assignmentId==="string"?value.assignmentId:undefined});});
 client.on("tracking:changed",value=>{if(active())emit({kind:"tracking",assignmentId:typeof value?.assignmentId==="string"?value.assignmentId:undefined});});
 client.on("notification:changed",value=>{
  if(!active()||typeof value?.id!=="string"||typeof value?.revision!=="string"||value.id.length>100||value.revision.length>100)return;
  const key=`notice:${value.id}:${value.revision}`;if(seen.has(key))return;seen.add(key);
  if(seen.size>5000)seen.delete(seen.values().next().value!);
  emit({kind:"notification"});
 });
 const heartbeat=setInterval(()=>{if(!active())return;if(client.connected)client.emit("table:heartbeat");if(document.visibilityState==="visible"&&client.connected){heartbeatCellDrafts();for(const cell of cells.values())client.emit("cell:presence",cell);}
  for(const [key,time] of received)if(time<Date.now()-45000)received.delete(key);
  const remaining=snapshot.presences.filter(p=>(received.get(`${p.table}:${p.socketId}`)??0)>Date.now()-45000);if(remaining.length!==snapshot.presences.length){snapshot={...snapshot,presences:remaining};notify();}
 },10000);
 const wakeDrafts=()=>{if(active()&&client.connected&&document.visibilityState==="visible")heartbeatCellDrafts();};
 document.addEventListener("visibilitychange",wakeDrafts);
 client.connect();
 const stop=(preserveDrafts=false)=>{clearInterval(heartbeat);clearTimeout(retryTimer);document.removeEventListener("visibilitychange",wakeDrafts);if(!active())return;if(preserveDrafts)draftConnection(false);else clearCellDrafts();configureDraftTransport(null);client.disconnect();socket=null;owner="";versions.clear();seen.clear();recordRequests.clear();confirmedRecords.clear();if(!preserveDrafts)cells.clear();snapshot={connected:false,bridgeHealthy:false,presences:[]};notify();};stopCurrent=stop;return stop;
}
export function joinCollaborationRoom(kind:"table"|"trip",key:string){const room=`${kind}:${key}`,before=rooms.get(room)??0;rooms.set(room,before+1);if(!before&&socket?.connected)socket.emit("room:join",{kind,key});return()=>{const remaining=(rooms.get(room)??1)-1;if(remaining>0)rooms.set(room,remaining);else{rooms.delete(room);if(kind==="table"){forgetTableDrafts(key);const viewers={...snapshot.viewers};delete viewers[key];snapshot={...snapshot,viewers};notify();}socket?.emit("room:leave",{kind,key});if(kind==="table")cells.delete(key);}};}
export function focusCollaborationCell(table:string,target:CellTarget|null){
 if(target)cells.set(table,target);else{cells.delete(table);socket?.emit("cell:presence-leave",{table});}
 if(presenceTimer)clearTimeout(presenceTimer);
 presenceTimer=setTimeout(()=>{presenceTimer=null;if(socket?.connected&&document.visibilityState==="visible")for(const cell of cells.values())socket.emit("cell:presence",cell);},120);
}
export function readCommittedRecord(token:string,commit:Commit){
 const cached=confirmedRecords.get(`${commit.source}:${commit.recordId}`);if(typeof cached?.collaboration_version==="number"&&commit.version!==null&&cached.collaboration_version>=commit.version)return Promise.resolve(cached);
 const requestOwner=owner;
 const key=`${token}:${commit.source}:${commit.recordId}:${commit.version??commit.eventId}`;const pending=recordRequests.get(key);if(pending)return pending;
 const request=apiGet<ApiResponse<Record<string,unknown>>>(`/realtime/records/${encodeURIComponent(commit.source)}/${encodeURIComponent(commit.recordId)}`,token).then(result=>{if(!result.success||!result.data)throw Error("Unable to confirm the latest record.");if(owner!==requestOwner)throw new DOMException("Session changed","AbortError");rememberConfirmedRecord(commit.source,commit.recordId,result.data);return result.data;}).finally(()=>{if(recordRequests.get(key)===request)recordRequests.delete(key);});
 recordRequests.set(key,request);return request;
}
