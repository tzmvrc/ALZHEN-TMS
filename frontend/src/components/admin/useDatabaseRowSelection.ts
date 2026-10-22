import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from "react";
import {readMasterDataSelection,type MasterDataKey,type MasterDataRow,type MasterDataSelection} from "../../services/master-data.service";

export type DatabaseQuerySelection = MasterDataSelection & {excluded:Set<string>};
/** Query-wide selection stores a scope and exceptions, not every row or record ID. */
export function useDatabaseRowSelection({rows,scope,active,enabled,token,resource,query,revision,onError}:{
 rows:MasterDataRow[];scope:string;active:boolean;enabled:boolean;token:string;resource:MasterDataKey;query:string;revision:string;onError:(message:string)=>void;
}){
 const [explicit,setExplicit]=useState(new Set<string>()),[all,setAll]=useState<DatabaseQuerySelection|null>(null),[busy,setBusy]=useState(false);
 const request=useRef(0),allRef=useRef(all);allRef.current=all;
 useEffect(()=>{request.current++;setBusy(false);if(enabled){allRef.current=null;setAll(null);setExplicit(new Set());}return()=>{request.current++;};},[scope,active,enabled]);
 useEffect(()=>{
  const snapshot=allRef.current;if(!enabled||!active||!snapshot)return;
  let live=true;
  void readMasterDataSelection(token,resource,{search:snapshot.search,before:snapshot.before,excluded:[...snapshot.excluded]}).then(result=>{
   if(!live)return;const total=result.total+snapshot.excluded.size;
   setAll(current=>current===snapshot&&current.total!==total?{...current,total}:current);
  }).catch(()=>{/* Preserve the selection; deletion revalidates the scope before confirmation. */});
  return()=>{live=false;};
 },[revision,scope,active,enabled,token,resource]);
 const selected=useMemo(()=>all?new Set(rows.filter(row=>typeof row.created_at==="string"&&Date.parse(row.created_at)<=Date.parse(all.before)&&!all.excluded.has(row.id)).map(row=>row.id)):explicit,[all,rows,explicit]);
 const setSelected:Dispatch<SetStateAction<Set<string>>>=update=>{request.current++;setBusy(false);setAll(null);setExplicit(previous=>typeof update==="function"?update(all?selected:previous):update);};
 const toggleExcluded=(id:string)=>{setAll(current=>{if(!current)return current;const excluded=new Set(current.excluded);if(excluded.has(id))excluded.delete(id);else excluded.add(id);return {...current,excluded};});};
 const toggleAll=async()=>{
  if(!enabled||busy)return;
  const generation=++request.current;setBusy(true);
  try{const snapshot=await readMasterDataSelection(token,resource,{search:query});if(request.current!==generation)return;setExplicit(new Set());setAll(snapshot.total?{...snapshot,excluded:new Set()}:null);}
  catch(error){if(request.current===generation)onError(error instanceof Error?error.message:"Unable to select matching rows.");}
  finally{if(request.current===generation)setBusy(false);}
 };
 const reconcileDeleted=(ids:string[])=>{const done=new Set(ids);setExplicit(previous=>new Set([...previous].filter(id=>!done.has(id))));setAll(current=>current?{...current,total:Math.max(0,current.total-ids.length)}:current);};
 return {selected,setSelected,all,reconcileDeleted,busy,toggleAll,toggleExcluded,count:all?Math.max(0,all.total-all.excluded.size): [...selected].filter(id=>!id.startsWith("virtual:")).length};
}
