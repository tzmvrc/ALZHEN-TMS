import {useEffect,useRef,useState} from "react";
import {Bell} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {fetchNotifications,markNotificationAsRead,type AdminNotification} from "../../services/notification.service";
import {invalidateApiCache} from "../../services/api.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {useToast} from '../ui/Toast';
import {notifyPodRejectionOnce} from '../../services/pod-feedback';

export default function TruckerNotifications(){
 const {accessToken,profile}=useAuth(),{addToast}=useToast();
 const [snapshot,setSnapshot]=useState<{token:string;items:AdminNotification[]}|null>(null),[open,setOpen]=useState(false),[error,setError]=useState("");
 const reading=useRef(false);
 useEffect(()=>{
  if(!accessToken)return;let current=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{void fetchNotifications(accessToken,true).then(data=>{if(current){setSnapshot({token:accessToken,items:data.notifications});setError("");}},()=>{if(current)setError("Notifications could not refresh. Reopen to retry.");});};
  refresh();const stop=subscribeCollaborationEvents(event=>{if(event.kind!=="notification"&&event.kind!=="connected")return;invalidateApiCache("/notifications");clearTimeout(timer);timer=setTimeout(refresh,150);});
  return()=>{current=false;clearTimeout(timer);stop();};
 },[accessToken,open]);
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[]);
 const items=snapshot?.token===accessToken?snapshot.items:[];
 useEffect(()=>{if(profile?.role!=='TRUCKER')return;for(const item of items)if(item.notification_type==='pod_rejected'&&!item.read_at)notifyPodRejectionOnce(addToast,profile.id,item.metadata.receipt_id??item.id,item.metadata.reason??item.message);},[items,profile?.id,profile?.role,addToast]);
 const read=async(item:AdminNotification)=>{if(!accessToken||item.read_at||reading.current)return;reading.current=true;try{const result=await markNotificationAsRead(accessToken,item.id);setSnapshot(current=>current?.token===accessToken?{...current,items:current.items.map(row=>row.id===item.id?{...row,read_at:result.read_at}:row)}:current);}catch{setError("Unable to mark this notification read. Retry.");}finally{reading.current=false;}};
 return <div className="relative">
  <button type="button" aria-label="POD notifications" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="relative flex h-10 w-10 items-center justify-center rounded-full border bg-white"><Bell className="h-4 w-4"/>{items.some(item=>!item.read_at)&&<span aria-label="Unread notifications" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500"/>}</button>
  {open&&<section aria-label="Your notifications" className="delivery-notifications-panel absolute right-0 top-full z-40 mt-2 w-[min(320px,85vw)] rounded-xl border bg-white p-3 shadow-xl"><h2 className="font-semibold">Your notifications</h2>
   {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
   {!snapshot?<p role="status" className="mt-2 animate-pulse rounded bg-slate-100 p-4">Loading notifications…</p>:!items.length?<p className="py-4 text-xs">No notifications yet.</p>:<ul className="max-h-72 overflow-auto">{items.map(item=><li key={item.id}><button type="button" onClick={()=>{void read(item);if(item.notification_type==='pod_rejected'){if(profile?.role==='TRUCKER')notifyPodRejectionOnce(addToast,profile.id,item.metadata.receipt_id??item.id,item.metadata.reason??item.message);window.dispatchEvent(new CustomEvent('pod-rejection-request',{detail:item.metadata}));setOpen(false);}}} className={`w-full rounded-lg px-2 py-3 text-left text-xs ${item.read_at?"text-slate-500":"bg-blue-50 font-semibold"}`}>{item.message}<span className="mt-1 block text-[10px] font-normal">{new Date(item.created_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</span></button></li>)}</ul>}
  </section>}
 </div>;
}
