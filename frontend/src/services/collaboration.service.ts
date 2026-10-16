import { io,type Socket } from "socket.io-client";
import { apiGet,getAppSessionHeaders,type ApiResponse } from "./api.service";
export type CellTarget={table:string;source:string;recordId:string;tripId?:string;stopId?:string;field:string;status:"selected"|"editing"};
export type Presence=CellTarget&{socketId:string;userId:string;name:string;color:string};
export type Commit={eventId:string;source:string;recordId:string;tripId?:string;stopId?:string;fields:string[];version:number|null;actorId:string|null;operation?:"INSERT"|"UPDATE"|"DELETE"};
export const COLLABORATION_SOURCES=["trips","trip_stops","trip_line_items","trip_truck_assignments","store_calls","billings"] as const;
type Snapshot={connected:boolean;bridgeHealthy:boolean;presences:Presence[]};
type Event={kind:"commit";commit:Commit}|{kind:"trucker"}|{kind:"connected"}|{kind:"layout";table:string;column:string;revision:number}|{kind:"signal";topic:string;revision:string};
let socket:Socket|null=null,owner="",snapshot:Snapshot={connected:false,bridgeHealthy:false,presences:[]};
let stopCurrent:(()=>void)|null=null;
const watchers=new Set<()=>void>(),events=new Set<(event:Event)=>void>(),rooms=new Map<string,number>(),cells=new Map<string,CellTarget>(),versions=new Map<string,number>(),seen=new Set<string>();
const recordRequests=new Map<string,Promise<Record<string,unknown>>>();
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
 stopCurrent?.();stopCurrent=null;socket?.disconnect();socket=null;owner=next;versions.clear();seen.clear();recordRequests.clear();received.clear();
 snapshot={connected:false,bridgeHealthy:false,presences:[]};notify();
 if(!next)return()=>{};
 const endpoint=import.meta.env?.VITE_SOCKET_URL??new URL(import.meta.env?.VITE_API_URL??"http://localhost:5000/api").origin;
 const client=io(endpoint,{transports:["websocket"],path:import.meta.env?.VITE_SOCKET_PATH??"/socket.io",autoConnect:false,reconnectionDelay:1000,reconnectionDelayMax:10000,auth:cb=>cb({token,appSession:getAppSessionHeaders()["X-App-Session"]})});socket=client;
 const active=()=>socket===client&&owner===next;
 client.on("connect",()=>{if(!active())return;snapshot={...snapshot,connected:true};notify();for(const room of rooms.keys()){const [kind,...parts]=room.split(":");client.emit("room:join",{kind,key:parts.join(":")});}for(const cell of cells.values())client.emit("cell:presence",cell);emit({kind:"connected"});});
 client.on("disconnect",()=>{if(!active())return;snapshot={connected:false,bridgeHealthy:false,presences:[]};received.clear();notify();});
 client.on("connect_error",()=>{if(active()){snapshot={...snapshot,connected:false,bridgeHealthy:false};notify();}});
 client.on("bridge:status",value=>{if(active()){snapshot={...snapshot,bridgeHealthy:value?.healthy===true};notify();}});
 client.on("cell:presence",value=>{if(active())presence(value);});
 client.on("presence:snapshot",values=>{if(active()&&Array.isArray(values))values.forEach(presence);});
 client.on("cell:presence-leave",value=>{if(!active())return;received.delete(`${value?.table}:${value?.socketId}`);snapshot={...snapshot,presences:snapshot.presences.filter(p=>p.socketId!==value?.socketId||p.table!==value?.table)};notify();});
 const committed=(commit:Commit)=>{
  if(!active()||!commit||typeof commit.eventId!=="string"||!Array.isArray(commit.fields))return;
  const key=commit.eventId+":"+commit.fields.join(",");if(seen.has(key))return;seen.add(key);if(seen.size>5000)seen.delete(seen.values().next().value!);
  if(!rememberConfirmedVersion(commit.source,commit.recordId,commit.version))return;
  emit({kind:"commit",commit});
 };
 client.on("cell:committed",committed);client.on("table:invalidated",committed);
 client.on("table:layout-updated",value=>{if(active()&&typeof value?.table==="string"&&typeof value?.column==="string"&&Number.isSafeInteger(value.revision)){const key=`layout:${value.table}:${value.column}:${value.revision}`;if(seen.has(key))return;seen.add(key);if(seen.size>5000)seen.delete(seen.values().next().value!);emit({kind:"layout",table:value.table,column:value.column,revision:value.revision});}});
 client.on("datasets:invalidated",value=>{if(active()&&typeof value?.topic==="string"&&typeof value?.revision==="string")emit({kind:"signal",topic:value.topic,revision:value.revision});});
 client.on("trucker:changed",()=>{if(active())emit({kind:"trucker"});});
 const heartbeat=setInterval(()=>{if(!active())return;if(document.visibilityState==="visible"&&client.connected)for(const cell of cells.values())client.emit("cell:presence",cell);
  for(const [key,time] of received)if(time<Date.now()-45000)received.delete(key);
  const remaining=snapshot.presences.filter(p=>(received.get(`${p.table}:${p.socketId}`)??0)>Date.now()-45000);if(remaining.length!==snapshot.presences.length){snapshot={...snapshot,presences:remaining};notify();}
 },10000);
 client.connect();
 const stop=()=>{clearInterval(heartbeat);if(!active())return;client.disconnect();socket=null;owner="";versions.clear();seen.clear();recordRequests.clear();cells.clear();snapshot={connected:false,bridgeHealthy:false,presences:[]};notify();};stopCurrent=stop;return stop;
}
export function joinCollaborationRoom(kind:"table"|"trip",key:string){const room=`${kind}:${key}`;rooms.set(room,(rooms.get(room)??0)+1);if(socket?.connected)socket.emit("room:join",{kind,key});return()=>{const remaining=(rooms.get(room)??1)-1;if(remaining>0)rooms.set(room,remaining);else{rooms.delete(room);socket?.emit("room:leave",{kind,key});if(kind==="table")cells.delete(key);}};}
export function focusCollaborationCell(table:string,target:CellTarget|null){
 if(target)cells.set(table,target);else{cells.delete(table);socket?.emit("cell:presence-leave",{table});}
 if(presenceTimer)clearTimeout(presenceTimer);
 presenceTimer=setTimeout(()=>{presenceTimer=null;if(socket?.connected&&document.visibilityState==="visible")for(const cell of cells.values())socket.emit("cell:presence",cell);},120);
}
export function readCommittedRecord(token:string,commit:Commit){
 const key=`${token}:${commit.source}:${commit.recordId}:${commit.version??commit.eventId}`;const pending=recordRequests.get(key);if(pending)return pending;
 const request=apiGet<ApiResponse<Record<string,unknown>>>(`/realtime/records/${encodeURIComponent(commit.source)}/${encodeURIComponent(commit.recordId)}`,token).then(result=>{if(!result.success||!result.data)throw Error("Unable to confirm the latest record.");return result.data;}).finally(()=>{if(recordRequests.get(key)===request)recordRequests.delete(key);});
 recordRequests.set(key,request);return request;
}
