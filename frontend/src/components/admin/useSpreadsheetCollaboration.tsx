import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {collaborationSnapshot,subscribeCollaboration,subscribeCollaborationEvents,joinCollaborationRoom,focusCollaborationCell,readCommittedRecord,rememberConfirmedVersion,type CellTarget,type Commit} from "../../services/collaboration.service";
// The record endpoint serves editable spreadsheet sources. Delivery events use
// their own authorized notification endpoint and must not enter this retry queue.
const EDITABLE_SOURCES=new Set(["trips","trip_stops","trip_line_items","trip_truck_assignments","trip_cargo_allocations","trip_assignment_stops","store_calls","billings"]);
export function useSpreadsheetCollaboration(table:string,token:string|null,userId:string|undefined,onRecord:(commit:Commit,record:Record<string,unknown>|null)=>void){
 const snapshot=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
 const presences=snapshot.presences;
 const peersByCell=useMemo(()=>{const map=new Map<string,typeof presences>();for(const peer of presences){if(peer.table!==table)continue;const key=`${peer.source}:${peer.recordId}:${peer.field}`;const list=map.get(key)??[];list.push(peer);map.set(key,list);}return map;},[presences,table]);
 const callback=useRef(onRecord);useLayoutEffect(()=>{callback.current=onRecord;},[onRecord]);
 const active=useRef<CellTarget|null>(null);
 const [notice,setNotice]=useState<{text:string;kind?:"refresh";latest?:unknown}|null>(null);
 useEffect(()=>{
  if(!token||!userId)return;const leave=joinCollaborationRoom("table",table);let live=true,running=0;
  type Pending={commit:Commit;attempt:number;ready:boolean;failed:boolean;timer?:ReturnType<typeof setTimeout>};
  const pending=new Map<string,Pending>(),key=(commit:Commit)=>`${commit.source}:${commit.recordId}`;
  const pump=()=>{
   if(!live)return;
   for(const [id,item] of pending){if(running>=4)break;if(!item.ready||item.failed)continue;item.ready=false;running++;
    void readCommittedRecord(token,item.commit).then(record=>{
     if(!live||pending.get(id)!==item)return;pending.delete(id);
     if(!rememberConfirmedVersion(item.commit.source,item.commit.recordId,record.collaboration_version))return;
     callback.current(item.commit,record);
     setNotice(current=>current?.kind==="refresh"?null:current);
     const selected=active.current;
     if(item.commit.actorId!==userId&&selected?.source===item.commit.source&&selected.recordId===item.commit.recordId&&item.commit.fields.includes(selected.field))setNotice({text:"Another collaborator saved this cell. Your unsaved draft has not changed.",latest:record[selected.field]});
    }).catch(error=>{
     if(!live||pending.get(id)!==item)return;
     if(error?.status===404){pending.delete(id);callback.current(item.commit,null);return;}
     if(![401,403].includes(error?.status)&&item.attempt<3){const delay=[500,1500,4000][item.attempt++];item.timer=setTimeout(()=>{item.timer=undefined;item.ready=true;pump();},delay);return;}
     item.failed=true;console.warn("Spreadsheet reconciliation deferred",{table,source:item.commit.source,status:error?.status});
     setNotice({kind:"refresh",text:"Some updates are delayed. Reopen this sheet to retry. Your unsaved edits are preserved."});
    }).finally(()=>{running--;pump();});
   }
  };
  const resume=()=>{if(!live)return;for(const item of pending.values())if(item.failed){item.failed=false;item.attempt=0;item.ready=true;}pump();};
  const unsubscribe=subscribeCollaborationEvents(event=>{
   if(event.kind==="connected"){resume();return;}if(event.kind!=="commit")return;const commit=event.commit;if(!EDITABLE_SOURCES.has(commit.source))return;const id=key(commit),prior=pending.get(id);
   if(prior&&prior.commit.version!==null&&commit.version!==null&&prior.commit.version>commit.version)return;
   if(prior?.timer)clearTimeout(prior.timer);
   if(commit.operation==="DELETE"){pending.delete(id);callback.current(commit,null);return;}
   if(pending.size>=200&&!pending.has(id)){callback.current(commit,null);return;}
   pending.set(id,{commit,attempt:0,ready:true,failed:false});pump();
  });
  window.addEventListener("online",resume);
  return()=>{live=false;for(const item of pending.values())clearTimeout(item.timer);pending.clear();window.removeEventListener("online",resume);unsubscribe();focusCollaborationCell(table,null);leave();};
 },[table,token,userId]);
 const focus=useCallback((target:CellTarget|null)=>{active.current=target;focusCollaborationCell(table,target);},[table]);
 return {connected:snapshot.connected,notice,dismissNotice:()=>setNotice(null),focus,peers:(target:CellTarget|null)=>target?peersByCell.get(`${target.source}:${target.recordId}:${target.field}`)??[]:[]};
}
