import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
import {collaborationSnapshot,subscribeCollaboration,joinCollaborationRoom,type TableViewer} from "../../services/collaboration.service";

type AnimatedViewer={user:TableViewer;animation:"enter"|"leave"|null};
const noViewers:TableViewer[]=[];

export function ViewerAvatar({user,animation=null}:{user:TableViewer;animation?:"enter"|"leave"|null}){
 const [failed,setFailed]=useState(false);
 return <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${animation==="enter"?"viewer-pop-in":animation==="leave"?"viewer-pop-out":""}`} style={{color:user.color,borderColor:user.color,backgroundColor:`color-mix(in srgb, ${user.color} 18%, white)`}}>
  <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full">{user.avatarUrl&&!failed?<img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="h-full w-full object-cover"/>:user.name.trim().slice(0,1).toLocaleUpperCase()||"?"}</span>
  {animation&&<span aria-hidden="true" className={`viewer-confetti ${animation==="leave"?"viewer-confetti-out":""}`}>{Array.from({length:8},(_,index)=><i key={index}/>)}</span>}
 </span>;
}
export default function TableViewers({table,sidebar=false}:{table:string;sidebar?:boolean}){
 const snapshot=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
 useEffect(()=>joinCollaborationRoom("table",table),[table]);
 return snapshot.connected?<ViewerGroup key={table} users={snapshot.viewers?.[table]??noViewers} sidebar={sidebar}/>:null;
}
export function ViewerGroup({users,sidebar=false}:{users:TableViewer[];sidebar?:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null);
 const [menuPosition,setMenuPosition]=useState({left:0,top:0});
 const [animatedUsers,setAnimatedUsers]=useState<AnimatedViewer[]>(()=>users.map(user=>({user,animation:null})));
 useEffect(()=>{
  const timer=setTimeout(()=>setAnimatedUsers(current=>{
    const currentById=new Map(current.map(viewer=>[viewer.user.userId,viewer]));
    const next:AnimatedViewer[]=users.map(user=>{
     const previous=currentById.get(user.userId);
     currentById.delete(user.userId);
     return {user,animation:previous?(previous.animation==="leave"?"enter":previous.animation):"enter"};
    });
    for(const viewer of currentById.values())next.push({...viewer,animation:"leave"});
    return next;
   }),0);
  return()=>clearTimeout(timer);
 },[users]);
 useEffect(()=>{
  if(!animatedUsers.some(viewer=>viewer.animation))return;
  const timer=setTimeout(()=>setAnimatedUsers(current=>current.flatMap(viewer=>viewer.animation==="leave"?[]:[{...viewer,animation:null}])),620);
  return()=>clearTimeout(timer);
 },[animatedUsers]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))setOpen(false);};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[open]);
 if(!users.length&&!animatedUsers.length)return null;
 return <div ref={root} className="relative shrink-0" onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);root.current?.querySelector<HTMLButtonElement>("button")?.focus();}}}>
  <button type="button" aria-label={`${users.length} people viewing this table`} aria-expanded={open} aria-haspopup="dialog" title="People viewing this table" onClick={()=>{if(sidebar&&root.current){const rect=root.current.getBoundingClientRect();setMenuPosition({left:rect.right+10,top:Math.min(rect.top,window.innerHeight-270)});}setOpen(v=>!v);}} className={`flex rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${sidebar?"flex-col -space-y-2":"-space-x-2"}`}>{animatedUsers.slice(0,3).map(({user,animation})=><ViewerAvatar key={user.userId} user={user} animation={animation}/>)}{users.length>3&&<span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-200 text-xs font-semibold text-slate-700">+{users.length-3}</span>}</button>
  {open&&(sidebar?createPortal(<div ref={menu} role="dialog" aria-label="People viewing this table" style={menuPosition} className="fixed z-[1700] max-h-64 w-60 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{animatedUsers.map(({user})=><div key={user.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-800"><ViewerAvatar user={user}/><span className="truncate">{user.name}</span></div>)}</div>,document.body):<div role="dialog" aria-label="People viewing this table" className="absolute left-0 top-full z-[160] mt-2 max-h-64 w-60 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{animatedUsers.map(({user,animation})=><div key={user.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-800"><ViewerAvatar user={user} animation={animation}/><span className="truncate">{user.name}</span></div>)}</div>)}
 </div>;
}
