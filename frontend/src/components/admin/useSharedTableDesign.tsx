import {useCallback,useEffect,useState,useSyncExternalStore} from "react";
import {emptyDesign,readSharedDesign,subscribeSharedDesign,refreshSharedDesign,saveSharedDesign,retrySharedDesign,type ColumnDesign} from "../../services/shared-table-design";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {subscribeToAdminRealtime} from "../../services/realtime.service";
export function useSharedTableDesign(table:string,token:string|null,enabled=true,paused=false){
 const active=enabled&&Boolean(token);
 const snapshot=useSyncExternalStore(fn=>active?subscribeSharedDesign(token!,table,fn):()=>{},()=>active?readSharedDesign(token!,table):emptyDesign);
 const owner=`${token}:${table}`;
 const [applied,setApplied]=useState(()=>({owner,snapshot}));
 useEffect(()=>{let live=true;if(!paused)queueMicrotask(()=>{if(live)setApplied({owner,snapshot});});return()=>{live=false;};},[owner,snapshot,paused]);
 useEffect(()=>{if(!active)return;let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;void refreshSharedDesign(token!,table);},150);};refresh();
  const socket=subscribeCollaborationEvents(event=>{if(event.kind==="connected"||event.kind==="layout"&&event.table===table)refresh();});
  const signals=subscribeToAdminRealtime(event=>{if(event.kind==="resume"||event.kind==="batch"&&event.tables.includes("shared_table_column_widths"))refresh();});
  return()=>{clearTimeout(timer);socket();signals();};
 },[active,table,token]);
 const save=useCallback((column:string,patch:ColumnDesign,width:number)=>active?saveSharedDesign(token!,table,column,patch,width):Promise.resolve(),[active,table,token]);
 return {...snapshot,columns:applied.owner===owner?applied.snapshot.columns:{},loaded:applied.owner===owner&&applied.snapshot.loaded,save,feedback:snapshot.error?<p role="alert" className="text-xs text-amber-800">{snapshot.error} <button type="button" className="underline" onClick={()=>void retrySharedDesign(token!,table)}>Retry shared design</button></p>:snapshot.saving?<span role="status" className="text-xs text-slate-500">Saving shared design…</span>:null};
}
