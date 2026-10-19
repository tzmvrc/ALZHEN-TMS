import type { Server, Socket } from "socket.io";
import type { SocketActor } from "./collaboration-auth.service.js";
import { draftKey, parseDraftPacket, type DraftPacket, type DraftTarget } from "./cell-draft.logic.js";
import { isValidUuid } from "../utils/validation.js";
export function attachCellDrafts(io:Server,socket:Socket,actor:SocketActor,options:{authorize:(target:DraftTarget)=>Promise<void>;ttl:number;consume:()=>boolean|Promise<boolean>}){
 const sessions=new Map<string,{sequence:number;ended:boolean;at:number}>();
 let generation=0;
 socket.data.drafts={};
 const end=(sessionId:string,sequence:number,reason:string)=>{
  const prior=socket.data.drafts[sessionId];
  sessions.set(sessionId,{sequence,ended:true,at:Date.now()});
  if(prior){delete socket.data.drafts[sessionId];io.to(`table:${prior.target.table}`).emit("cell:edit-ended",{target:prior.target,sessionId,socketId:socket.id,sequence,reason});}
 };
 const leave=(table?:string)=>{generation++;for(const [id,draft] of Object.entries(socket.data.drafts) as Array<[string,DraftPacket]>)if(!table||draft.target.table===table)end(id,draft.sequence+1,"released");};
 socket.on("cell:edit-start",async(input,ack)=>{
  const epoch=generation;
  try{
   if(!await options.consume())throw Error("Draft rate limit");
   const packet=parseDraftPacket(input,actor.role);
   if(!socket.rooms.has(`table:${packet.target.table}`)||sessions.has(packet.sessionId))throw Error("Invalid editor session");
   if(sessions.size>=256)throw Error("Editor session budget reached");
   // Tombstone immediately so duplicate/overlapping starts cannot race auth.
   sessions.set(packet.sessionId,{sequence:packet.sequence,ended:true,at:Date.now()});
   if(Object.keys(socket.data.drafts).length>=4)throw Error("Too many editors");
   await options.authorize(packet.target);
   if(epoch!==generation||sessions.get(packet.sessionId)?.sequence!==packet.sequence||!socket.connected||!socket.rooms.has(`table:${packet.target.table}`)||Date.now()>=actor.expiresAt)throw Error("Editor scope changed");
   for(const old of Object.values(socket.data.drafts) as DraftPacket[])if(draftKey(old.target)===draftKey(packet.target))end(old.sessionId,old.sequence+1,"replaced");
   sessions.set(packet.sessionId,{sequence:packet.sequence,ended:false,at:Date.now()});
   const draft={...packet,socketId:socket.id,userId:actor.id,name:actor.name,color:color(actor.id),expiresAt:Date.now()+options.ttl};
   socket.data.drafts[packet.sessionId]=draft;
   socket.to(`table:${packet.target.table}`).emit("cell:draft-changed",draft);
   if(typeof ack==="function")ack({ok:true});
  }catch{if(typeof ack==="function")ack({ok:false,error:"Draft preview unavailable or access denied"});}
 });
 socket.on("cell:draft-changed",async(input,ack)=>{try{
  if(!await options.consume())throw Error("Draft rate limit");
  const packet=parseDraftPacket(input,actor.role),prior=socket.data.drafts[packet.sessionId],state=sessions.get(packet.sessionId);
  if(!prior||!state||state.ended||packet.sequence<=state.sequence||draftKey(packet.target)!==draftKey(prior.target)||!socket.rooms.has(`table:${packet.target.table}`))throw Error("Stale editor");
  state.sequence=packet.sequence;state.at=Date.now();
  const draft={...prior,value:packet.value,phase:packet.phase,sequence:packet.sequence,expiresAt:Date.now()+options.ttl};
  socket.data.drafts[packet.sessionId]=draft;const viewers=socket.to(`table:${packet.target.table}`);(packet.phase==="editing"?viewers.volatile:viewers).emit("cell:draft-changed",draft);
  if(typeof ack==="function")ack({ok:true});
 }catch{if(typeof input?.sessionId==="string"&&sessions.has(input.sessionId))socket.emit("cell:edit-rejected",{sessionId:input.sessionId});if(typeof ack==="function")ack({ok:false,error:"Invalid or expired draft"});}});
 socket.on("cell:edit-end",async(input,ack)=>{try{
  // Cleanup must still work when a typing budget has been exhausted.
  if(!input||Object.keys(input).some(k=>!["sessionId","sequence"].includes(k))||typeof input.sessionId!=="string"||!isValidUuid(input.sessionId)||!Number.isSafeInteger(input.sequence)||input.sequence<1)throw Error("Invalid end");
  const state=sessions.get(input.sessionId);
  if(state&&input.sequence<=state.sequence||!state&&sessions.size>=256)throw Error("Stale end");
  end(input.sessionId,input.sequence,"released");if(typeof ack==="function")ack({ok:true});
 }catch{if(typeof ack==="function")ack({ok:false});}});
 const timer=setInterval(()=>{
  for(const [id,draft] of Object.entries(socket.data.drafts) as Array<[string,DraftPacket&{expiresAt:number}]>)if(draft.expiresAt<Date.now())end(id,draft.sequence+1,"expired");
  for(const [id,state] of sessions)if(state.at<Date.now()-120000)sessions.delete(id);
 },Math.min(options.ttl,5000));
 socket.on("disconnect",()=>{leave();clearInterval(timer);});
 return {leave,revalidate:async()=>{for(const draft of Object.values(socket.data.drafts) as DraftPacket[])try{await options.authorize(draft.target);}catch{end(draft.sessionId,draft.sequence+1,"access-revoked");socket.emit("cell:edit-rejected",{sessionId:draft.sessionId});}}};
}
// Same identity-derived palette as the existing presence system.
import { collaborationColor as color } from "./collaboration.logic.js";
