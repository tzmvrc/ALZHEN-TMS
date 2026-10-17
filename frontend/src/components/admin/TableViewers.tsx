import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {collaborationSnapshot,subscribeCollaboration,joinCollaborationRoom,type TableViewer} from "../../services/collaboration.service";

export function ViewerAvatar({user}:{user:TableViewer}){
 const [failed,setFailed]=useState(false);
 return <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-100 text-xs font-semibold" style={{color:user.color}}>{user.avatarUrl&&!failed?<img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="h-full w-full object-cover"/>:user.name.trim().slice(0,1).toLocaleUpperCase()||"?"}</span>;
}
export default function TableViewers({table}:{table:string}){
 const snapshot=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
 useEffect(()=>joinCollaborationRoom("table",table),[table]);
 return snapshot.connected?<ViewerGroup key={table} users={snapshot.viewers?.[table]??[]}/>:null;
}
export function ViewerGroup({users}:{users:TableViewer[]}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[open]);
 if(!users.length)return null;
 return <div ref={root} className="relative shrink-0" onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);root.current?.querySelector<HTMLButtonElement>("button")?.focus();}}}>
  <button type="button" aria-label={`${users.length} people viewing this table`} aria-expanded={open} aria-haspopup="dialog" title="People viewing this table" onClick={()=>setOpen(v=>!v)} className="flex -space-x-2 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{users.slice(0,3).map(user=><ViewerAvatar key={`${user.userId}:${user.avatarUrl}`} user={user}/>)}{users.length>3&&<span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-700">+{users.length-3}</span>}</button>
  {open&&<div role="dialog" aria-label="People viewing this table" className="absolute left-0 top-full z-[160] mt-2 max-h-64 w-60 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{users.map(user=><div key={user.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-800"><ViewerAvatar key={`${user.userId}:${user.avatarUrl}`} user={user}/><span className="truncate">{user.name}</span></div>)}</div>}
 </div>;
}
