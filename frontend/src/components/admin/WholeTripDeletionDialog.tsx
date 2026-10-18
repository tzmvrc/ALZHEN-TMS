import {useEffect,useRef,useState} from "react";
import {useOptionalToast} from "../ui/toast-context";
import {fetchWholeTripImpact,deleteWholeTrips,type WholeTripImpact} from "../../services/whole-trip-deletion";

type Props={token:string;tripIds:string[];selectedRowCount?:number;onClose:()=>void;onDeleted:()=>void};
export default function WholeTripDeletionDialog(props:Props){
 const identity=[...new Set(props.tripIds)].sort().join(",");
 return <Confirmation key={`${props.token}:${identity}`} {...props} tripIds={identity.split(",")}/>;
}
function Confirmation({token,tripIds,selectedRowCount=tripIds.length,onClose,onDeleted}:Props){
 const toast=useOptionalToast(),inFlight=useRef(false),active=useRef(true),cancelButton=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
 const [impact,setImpact]=useState<WholeTripImpact|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[password,setPassword]=useState("");
 const identity=tripIds.join(",");
 useEffect(()=>{active.current=true;const previous=document.activeElement as HTMLElement|null;cancelButton.current?.focus();return()=>{active.current=false;previous?.focus();};},[]);
 useEffect(()=>{let current=true;void fetchWholeTripImpact(token,identity.split(",")).then(data=>{if(current)setImpact(data);}).catch(()=>{if(current)setError("Impact preview could not be loaded. Close and retry; nothing was deleted.");});return()=>{current=false;};},[token,identity]);
 const close=()=>{if(inFlight.current)return;setPassword("");onClose();};
 const remove=async()=>{
  if(inFlight.current||busy||!password||!impact?.can_delete)return;
  inFlight.current=true;setBusy(true);dialog.current?.focus();setError("");const enteredPassword={value:password};setPassword("");
  try{
   const result=await deleteWholeTrips(token,identity.split(","),enteredPassword.value);
   if(!active.current)return;
   const count=identity.split(",").length;
   toast?.addToast({title:`${count} trip${count===1?"":"s"} deleted`,variant:result.cleanup_pending?"warning":"success",description:result.cleanup_pending?"Database deletion is confirmed; image cleanup is pending in the existing retry queue.":undefined});
   onDeleted();onClose();
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Deletion could not be confirmed. Check the selected trips before retrying.");}
  finally{enteredPassword.value="";inFlight.current=false;if(active.current){setPassword("");setBusy(false);}}
 };
 return <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-900/30 p-4"><section
  ref={dialog} tabIndex={-1} role="alertdialog" aria-modal="true" aria-busy={busy} aria-labelledby="whole-trip-delete-title" aria-describedby="whole-trip-delete-warning"
  onKeyDown={event=>{
   if(event.key==="Escape"&&!busy){event.stopPropagation();close();}
   if(event.key==="Tab"){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));const first=controls[0],last=controls.at(-1);if(!controls.length){event.preventDefault();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
  <h2 id="whole-trip-delete-title" className="font-semibold text-slate-900">Permanently delete entire trips?</h2>
  <p id="whole-trip-delete-warning" className="mt-2 text-sm text-rose-800">Warning: This action permanently deletes the selected trips and their related operational records across Trips, Combined Report, Transmittal Tracker, Offload Report, POD and other linked reports. This action cannot be undone without a recoverable backup. Protected financial, historical and attachment dependencies prevent deletion.</p>
  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold"><span>{selectedRowCount} selected row{selectedRowCount===1?"":"s"} on this page</span><span>{tripIds.length} selected unique trip{tripIds.length===1?"":"s"}</span></div>
  {!impact&&!error&&<p role="status" className="mt-3 animate-pulse rounded bg-slate-100 p-3">Calculating dependent records…</p>}
  {impact&&<><ul className="mt-3 space-y-1 text-sm">{impact.trips.map(t=><li key={t.id}>{t.dispatch_number||"No dispatch"} · <span className="break-all text-xs text-slate-500">{t.id}</span></li>)}</ul><dl className="my-3 grid grid-cols-2 gap-2 text-sm">{Object.entries(impact.counts).map(([key,value])=><div key={key}><dt className="text-slate-500">{key.replaceAll("_"," ")}</dt><dd>{value}</dd></div>)}</dl>{impact.blockers.map(message=><p key={message} className="mt-2 text-sm text-amber-800">{message}</p>)}</>}
  <label className="mt-4 block text-sm font-medium">Current account password<input type="password" autoComplete="current-password" maxLength={1024} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void remove();}}} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-rose-600"/></label>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
  <footer className="mt-5 flex justify-end gap-2"><button ref={cancelButton} type="button" disabled={busy} onClick={close} className="rounded-lg border px-3 py-2">Cancel</button><button type="button" disabled={busy||!password||!impact?.can_delete} onClick={()=>void remove()} className="rounded-lg bg-rose-700 px-3 py-2 text-white disabled:opacity-40">{busy?"Verifying and deleting…":"Confirm Permanent Deletion"}</button></footer>
 </section></div>;
}
