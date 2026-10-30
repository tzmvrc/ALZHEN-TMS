import {useEffect,useState} from "react";
import {AccountAvatar} from "../account/AccountUi";
import {invalidateUserWorkspace,loadUserSheet} from "../../services/user-workspace.service";
import {subscribeToAdminRealtime} from "../../services/realtime.service";
import type {MasterDataRow,MasterDataPage} from "../../services/master-data.service";

export default function UserDirectoryCards({token,category,search,revision,onOpen,onEdit,canEdit}:{token:string;category:string;search:string;revision:number;onOpen:(row:MasterDataRow)=>void;onEdit:(row:MasterDataRow)=>void;canEdit:boolean}){
 const [page,setPage]=useState(1),[data,setData]=useState<MasterDataPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[refresh,setRefresh]=useState(0);
 const [query,setQuery]=useState(search);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(1);},250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{let live=true;setLoading(true);setError("");loadUserSheet(token,category,query,page,"first_name","asc").then(value=>{if(live)setData(value);}).catch(()=>{if(live)setError("Users could not load. Please retry.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[token,category,query,page,revision,refresh]);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const stop=subscribeToAdminRealtime(event=>{const tables=event.kind==="batch"?event.tables:event.kind==="change"?[event.payload.table]:[];if(event.kind==="resume"||tables.some(table=>["profiles","drivers","trucks","trip_truck_assignments","trip_truck_crew_members"].includes(table))){clearTimeout(timer);timer=setTimeout(()=>{invalidateUserWorkspace();setRefresh(value=>value+1);},250);}});return()=>{stop();clearTimeout(timer);};},[]);
 return <div className="user-directory-cards" aria-busy={loading}>
  {error?<div role="alert" className="user-directory-empty">{error}<button type="button" onClick={()=>setRefresh(value=>value+1)}>Retry</button></div>:loading?<div role="status" className="user-directory-empty">Loading users…</div>:!data?.rows.length?<div className="user-directory-empty">No users match your search.</div>:<div className="user-directory-grid">{data.rows.map(row=>{const name=[row.first_name,row.last_name].filter(Boolean).join(" ")||"Unnamed user",role=String(row.role==="TRUCKER"?(row.crew_role||"Driver"):row.role||"User").toLowerCase().replaceAll("_"," ");return <article key={row.id} className="user-directory-card">
    <button type="button" className="user-directory-person" onClick={()=>onOpen(row)} aria-label={`View details for ${name}`}><span className="user-directory-avatar"><AccountAvatar url={typeof row.profile_picture_url==="string"?row.profile_picture_url:null} name={name} size="h-10 w-10"/></span><strong>{name}</strong><span className="user-directory-role">{role}</span>{category==="truckers"&&row.plate_number?<span className="user-directory-secondary">{String(row.plate_number)}</span>:null}</button>
    <details className="user-directory-menu"><summary aria-label={`Actions for ${name}`}>···</summary><div><button type="button" onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onOpen(row);}}>View details</button>{canEdit&&<button type="button" onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onEdit(row);}}>Edit user</button>}</div></details>
  </article>;})}</div>}
  <footer className="user-directory-footer"><span>{data?.pagination.total??0} users{loading?" · Loading…":""}</span><div><button type="button" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page} of {Math.max(1,data?.pagination.totalPages??1)}</span><button type="button" disabled={loading||page>=(data?.pagination.totalPages??1)} onClick={()=>setPage(value=>value+1)}>Next</button></div></footer>
 </div>;
}
