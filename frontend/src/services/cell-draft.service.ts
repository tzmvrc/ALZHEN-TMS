// Ephemeral per-cell store. This module has no HTTP, database or Storage client.
export type DraftTarget={table:string;source:string;recordId:string;field:string;tripId?:string;stopId?:string;reportId?:string};
export type RemoteDraft={target:DraftTarget;sessionId:string;sequence:number;value:string;phase:"editing"|"saving"|"failed";socketId:string;userId:string;name:string;color:string};
type Sender=(event:string,payload:unknown,ack?:(result:{ok:boolean})=>void)=>void;
type Local={target:DraftTarget;sessionId:string;sequence:number;value:string;phase:RemoteDraft["phase"];timer?:ReturnType<typeof setTimeout>;started:boolean;closed:boolean};
const locals=new Set<Local>(),remote=new Map<string,RemoteDraft>(),received=new Map<string,number>(),ended=new Map<string,number>(),listeners=new Map<string,Set<()=>void>>(),snapshots=new Map<string,readonly RemoteDraft[]>(),conflicts=new Map<string,string>();
const EMPTY:readonly RemoteDraft[]=Object.freeze([]);
let sender:Sender|null=null,connected=false;
export const draftCellKey=(t:DraftTarget)=>JSON.stringify([t.table,t.source,t.recordId,t.field,t.source==="flex_columns"?t.stopId??null:null]);
const changed=(key:string)=>{snapshots.delete(key);listeners.get(key)?.forEach(fn=>fn());};
export function subscribeCellDraft(t:DraftTarget,fn:()=>void){const key=draftCellKey(t),set=listeners.get(key)??new Set();set.add(fn);listeners.set(key,set);return()=>{set.delete(fn);if(!set.size){listeners.delete(key);snapshots.delete(key);}};}
export function cellDraftSnapshot(t:DraftTarget){const key=draftCellKey(t);if(!snapshots.has(key))snapshots.set(key,[...remote.values()].filter(d=>draftCellKey(d.target)===key));return snapshots.get(key)??EMPTY;}
export function localCellDraft(t:DraftTarget){return [...locals].some(d=>!d.closed&&draftCellKey(d.target)===draftCellKey(t));}
export function cellDraftConflict(t:DraftTarget){return conflicts.get(draftCellKey(t));}
function packet(d:Local){return {target:d.target,sessionId:d.sessionId,sequence:++d.sequence,value:d.value,phase:d.phase};}
function safeValue(value:string){return new TextEncoder().encode(value).length<=8192;}
function start(d:Local){
 if(!connected||!sender||d.closed)return;
 if(!safeValue(d.value)){conflicts.set(draftCellKey(d.target),"Live preview is limited to 8 KB. Your complete local draft is preserved.");changed(draftCellKey(d.target));return;}
 d.sessionId=crypto.randomUUID();d.sequence=0;d.started=false;
 const session=d.sessionId,initial=d.value,phase=d.phase;
 sender("cell:edit-start",packet(d),result=>{if(d.closed||!connected||d.sessionId!==session)return;d.started=result.ok;if(!result.ok){conflicts.set(draftCellKey(d.target),"Live preview is unavailable. Your local draft is preserved.");changed(draftCellKey(d.target));}else if(d.value!==initial||d.phase!==phase)flush(d);});
}
function flush(d:Local){clearTimeout(d.timer);d.timer=undefined;if(!safeValue(d.value)){
 if(connected&&sender&&d.started)sender("cell:edit-end",{sessionId:d.sessionId,sequence:++d.sequence});d.started=false;
 conflicts.set(draftCellKey(d.target),"Live preview is limited to 8 KB. Your complete local draft is preserved.");changed(draftCellKey(d.target));return;
 }if(connected&&sender&&d.started&&!d.closed)sender("cell:draft-changed",packet(d));}
export function configureDraftTransport(send:Sender|null){sender=send;}
export function draftConnection(value:boolean){
 if(connected===value&&value)return;
 connected=value;
 if(!value){const keys=new Set([...remote.values()].map(d=>draftCellKey(d.target)));remote.clear();received.clear();keys.forEach(changed);}
 for(const d of locals){clearTimeout(d.timer);d.started=false;if(value)start(d);}
}
export function clearCellDrafts(){conflicts.clear();for(const d of locals){clearTimeout(d.timer);d.closed=true;changed(draftCellKey(d.target));}locals.clear();draftConnection(false);ended.clear();}
export function forgetTableDrafts(table:string){for(const [id,d]of remote)if(d.target.table===table){remote.delete(id);received.delete(id);changed(draftCellKey(d.target));}for(const d of [...locals])if(d.target.table===table)close(d);}
function close(d:Local){if(d.closed)return;clearTimeout(d.timer);if(connected&&sender)sender("cell:edit-end",{sessionId:d.sessionId,sequence:++d.sequence});d.closed=true;locals.delete(d);conflicts.delete(draftCellKey(d.target));changed(draftCellKey(d.target));}
export function beginCellDraft(target:DraftTarget,value:string,throttle=50){
 const d:Local={target,sessionId:crypto.randomUUID(),sequence:0,value,phase:"editing",started:false,closed:false};locals.add(d);changed(draftCellKey(target));start(d);
 return {
  update(next:string){if(d.closed||next===d.value)return;d.value=next;d.phase="editing";if(!d.timer)d.timer=setTimeout(()=>flush(d),Math.max(20,Math.min(throttle,250)));},
  state(phase:RemoteDraft["phase"]){if(d.closed)return;d.phase=phase;flush(d);},
  close:()=>close(d),
 };
}
export function receiveCellDraft(d:RemoteDraft){
 if(!d?.target||typeof d.socketId!=="string"||typeof d.sessionId!=="string"||typeof d.name!=="string"||typeof d.value!=="string"||!safeValue(d.value)||!Number.isSafeInteger(d.sequence))return;
 const id=`${d.socketId}:${d.sessionId}`;if(ended.has(id))return;
 const previous=remote.get(id);if(previous&&previous.sequence>=d.sequence)return;
 remote.set(id,d);received.set(id,Date.now());changed(draftCellKey(d.target));
 if(remote.size>256){const first=remote.keys().next().value!;const removed=remote.get(first)!;remote.delete(first);received.delete(first);changed(draftCellKey(removed.target));}
}
export function endRemoteCellDraft(value:{socketId:string;sessionId:string;sequence:number}){
 const id=`${value?.socketId}:${value?.sessionId}`,previous=remote.get(id);
 if(previous&&value.sequence<=previous.sequence)return;
 ended.set(id,Date.now());if(ended.size>2048)ended.delete(ended.keys().next().value!);
 if(previous){remote.delete(id);received.delete(id);changed(draftCellKey(previous.target));}
}
export function noteDraftCommit(commit:{source:string;recordId:string;fields:string[];actorId:string|null;stopId?:string},userId:string){
 if(!commit.actorId||commit.actorId===userId)return;
 for(const d of locals)if(d.target.source===commit.source&&d.target.recordId===commit.recordId&&commit.fields.includes(d.target.field)&&(d.target.source!=="flex_columns"||d.target.stopId===commit.stopId)){
  conflicts.set(draftCellKey(d.target),"Another collaborator saved this cell. Your unsaved input is preserved.");changed(draftCellKey(d.target));
 }
}
export function expireRemoteDrafts(socketId?:string){
 // Server expiry/end is authoritative. Disconnect is also immediate on client.
 if(socketId)for(const[id,d]of remote)if(d.socketId===socketId){remote.delete(id);received.delete(id);changed(draftCellKey(d.target));}
 for(const[id,at]of received)if(at<Date.now()-25000){const draft=remote.get(id);remote.delete(id);received.delete(id);if(draft)changed(draftCellKey(draft.target));}
 for(const[id,at]of ended)if(at<Date.now()-120000)ended.delete(id);
}
export function heartbeatCellDrafts(){if(!connected)return;for(const d of locals)if(d.started)flush(d);else start(d);expireRemoteDrafts();}
export function rejectLocalDraft(sessionId:string){for(const d of locals)if(d.sessionId===sessionId){d.started=false;conflicts.set(draftCellKey(d.target),"Live preview is unavailable. Your local draft is preserved.");changed(draftCellKey(d.target));}}
