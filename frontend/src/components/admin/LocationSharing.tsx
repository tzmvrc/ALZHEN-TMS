import {useEffect,useState,useRef} from "react";
import {createLocationCapture} from "../../services/location-capture";
import {ownTrackingAssignments,trackingAvailable,trackingMutation} from "../../services/tracking-api.service";
export default function LocationSharing({token,tripId}:{token:string;tripId:string}){
 const [assignment,setAssignment]=useState<string|null>(null);
 const [status,setStatus]=useState<{token:string;tripId:string;value:string}|null>(null);
 const state=status?.token===token&&status.tripId===tripId?status.value:"STOPPED";
 const setState=(value:string)=>setStatus({token,tripId,value});
 const [busyScope,setBusyScope]=useState<{token:string;tripId:string}|null>(null);
 const busy=busyScope?.token===token&&busyScope.tripId===tripId;
 const setBusy=(value:boolean)=>setBusyScope(value?{token,tripId}:null);
 const [options,setChoices]=useState<{token:string;tripId:string;rows:Array<{id:string;plate_number:string|null}>}|null>(null);
 const choices=options?.token===token&&options.tripId===tripId?options.rows:[];
 const controller=useRef<ReturnType<typeof createLocationCapture>|null>(null);
 const mounted=useRef(false);
 const generation=useRef(0);
 useEffect(()=>{
  let current=true;mounted.current=true;const epoch=++generation.current;
  void trackingAvailable(token).then(async enabled=>{
   if(!enabled)return;const rows=(await ownTrackingAssignments(token)).filter(r=>r.trip_id===tripId);
   if(current){setChoices({token,tripId,rows});setAssignment(rows.length===1?rows[0].id:null);}
  }).catch(()=>{});
  const unload=()=>void controller.current?.stop();window.addEventListener("pagehide",unload);
  return()=>{current=false;mounted.current=false;generation.current=epoch+1;window.removeEventListener("pagehide",unload);void controller.current?.stop();controller.current=null;};
 },[token,tripId]);
 const start=async()=>{
  if(!assignment||busy||!choices.some(c=>c.id===assignment))return;
  if(!navigator.geolocation||!window.isSecureContext){setState("Secure HTTPS location access required");return;}setBusy(true);
  const beforeStop=generation.current;
  const stopped=await controller.current?.stop();
  if(!mounted.current||generation.current!==beforeStop)return;
  if(stopped===false){setBusy(false);return;}
  const epoch=generation.current;
  controller.current=createLocationCapture({geolocation:navigator.geolocation,onState:value=>{if(mounted.current&&generation.current===epoch)setState(value);},api:{
   begin:()=>trackingMutation(token,assignment,"start",{consent:true}),
   send:async(session,fix,signal)=>{if(signal.aborted)return;await trackingMutation(token,assignment,"fixes",{session_id:session,...fix},signal);},
   stop:async session=>{await trackingMutation(token,assignment,"stop",{session_id:session});},
  }});
  try{await controller.current.start();}finally{if(mounted.current&&generation.current===epoch)setBusy(false);}
 };
 if(!choices.length)return null;
 const sharing=["SHARING","LOCATION_NOT_SAVED","LOCATION_UNAVAILABLE","STOP_CONFIRMATION_PENDING","REQUESTING_PERMISSION"].includes(state);
 return <section className="rounded-xl border bg-white p-4 text-sm" aria-label="Location sharing">
  <strong>Location sharing</strong><p role="status">{state.replaceAll("_"," ").toLowerCase()}</p>
  {choices.length>1&&<label className="block">Truck assignment<select aria-label="Tracking truck assignment" disabled={sharing||busy} value={assignment??""} onChange={e=>setAssignment(e.target.value||null)}><option value="">Select assigned truck</option>{choices.map(c=><option key={c.id} value={c.id}>{c.plate_number??"Truck"} ({c.id.slice(0,8)})</option>)}</select></label>}
  <p className="my-2 text-xs text-slate-500">Only while this page is open and location permission is allowed. Phone lock or browser suspension may pause updates.</p>
  <button type="button" disabled={busy||!assignment} onClick={()=>sharing?void controller.current?.stop():void start()} className="rounded-lg bg-[#0b2341] px-3 py-2 text-white disabled:opacity-50">{busy?"Enabling…":sharing?"Stop location sharing":"Share my location"}</button>
 </section>;
}
