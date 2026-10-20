import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {collaborationSnapshot,subscribeCollaboration,subscribeCollaborationEvents,joinCollaborationRoom,focusCollaborationCell,readCommittedRecord,rememberConfirmedVersion,type CellTarget,type Commit} from "../../services/collaboration.service";
export function useSpreadsheetCollaboration(table:string,token:string|null,userId:string|undefined,onRecord:(commit:Commit,record:Record<string,unknown>|null)=>void){
 const snapshot=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
 const presences=snapshot.presences;
 const peersByCell=useMemo(()=>{const map=new Map<string,typeof presences>();for(const peer of presences){if(peer.table!==table)continue;const key=`${peer.source}:${peer.recordId}:${peer.field}`;const list=map.get(key)??[];list.push(peer);map.set(key,list);}return map;},[presences,table]);
 const callback=useRef(onRecord);useLayoutEffect(()=>{callback.current=onRecord;},[onRecord]);
 const active=useRef<CellTarget|null>(null);
 const [notice,setNotice]=useState<{text:string;kind?:"refresh";latest?:unknown}|null>(null);
 useEffect(()=>{if(!token||!userId)return;const leave=joinCollaborationRoom("table",table);let live=true;
  const unsubscribe=subscribeCollaborationEvents(event=>{
   if(event.kind!=="commit")return;const commit=event.commit;
   if(commit.operation==="DELETE"){if(live)callback.current(commit,null);return;}
   void readCommittedRecord(token,commit).then(record=>{
    if(!live||!rememberConfirmedVersion(commit.source,commit.recordId,record.collaboration_version))return;
    callback.current(commit,record);
    const selected=active.current;
    if(commit.actorId!==userId&&selected?.source===commit.source&&selected.recordId===commit.recordId&&commit.fields.includes(selected.field))setNotice({text:"Another collaborator saved this cell. Your unsaved draft has not changed.",latest:record[selected.field]});
   }).catch(error=>{if(!live)return;if(error?.status===404)callback.current(commit,null);else { console.warn("Spreadsheet saved-update refresh failed", {table, source:commit.source, status:error?.status}); setNotice({kind:"refresh",text:"A saved update could not be refreshed. Your draft is preserved; retry the page refresh."}); } });
  });
  return()=>{live=false;unsubscribe();focusCollaborationCell(table,null);leave();};
 },[table,token,userId]);
 const focus=useCallback((target:CellTarget|null)=>{active.current=target;focusCollaborationCell(table,target);},[table]);
 return {connected:snapshot.connected,notice,dismissNotice:()=>setNotice(null),focus,peers:(target:CellTarget|null)=>target?peersByCell.get(`${target.source}:${target.recordId}:${target.field}`)??[]:[]};
}
