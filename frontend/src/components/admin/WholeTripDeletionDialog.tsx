import {useEffect,useId,useRef,useState} from "react";
import {ApiError} from "../../services/api.service";
import {LoaderCircle} from "lucide-react";
import {wholeTripBlockerMessage,wholeTripDeletionErrorMessage} from "../../services/whole-trip-deletion-feedback";
import {useOptionalToast} from "../ui/toast-context";
import {fetchWholeTripImpact,deleteWholeTripSelection,type WholeTripImpact} from "../../services/whole-trip-deletion";

type Props={token:string;tripIds:string[];onClose:()=>void;onDeleted:(tripIds:string[])=>void};
export default function WholeTripDeletionDialog(props:Props){
 const identity=[...new Set(props.tripIds)].sort().join(",");
 return <Confirmation key={`${props.token}:${identity}`} {...props} tripIds={identity.split(",")}/>;
}
function Confirmation({token,tripIds,onClose,onDeleted}:Props){
 const toast=useOptionalToast(),inFlight=useRef(false),active=useRef(true),cancelButton=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
 const [impact,setImpact]=useState<WholeTripImpact|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [impactRevision,setImpactRevision]=useState(0);
 const [pendingIds,setPendingIds]=useState(tripIds);
 const identity=pendingIds.join(",");
 const notificationKey=useId();
 const actionLabel=pendingIds.length===1?"Delete Entire Trip":"Delete Selected Trips";
 useEffect(()=>{active.current=true;const previous=document.activeElement as HTMLElement|null;cancelButton.current?.focus();return()=>{active.current=false;previous?.focus();};},[]);
 useEffect(()=>{let current=true;const controller=new AbortController();void fetchWholeTripImpact(token,identity.split(","),controller.signal).then(data=>{if(current)setImpact(data);}).catch(()=>{if(current)setError("Unable to check the selected trips. Please close and try again.");});return()=>{current=false;controller.abort();};},[token,identity,impactRevision]);
 const close=()=>{if(inFlight.current)return;onClose();};
 const remove=async()=>{
  if(inFlight.current||busy||!impact?.can_delete)return;
  inFlight.current=true;setBusy(true);dialog.current?.focus();setError("");
  let committed=false;
  try{
   const result=await deleteWholeTripSelection(token,identity.split(","));
   committed=true;
   if(!active.current)return;
   const count=result.deleted_trips;
   if(result.remaining_trip_ids.length){
    setPendingIds(result.remaining_trip_ids);setImpact(null);
    setImpactRevision(value=>value+1);
    const message=wholeTripDeletionErrorMessage(new ApiError(result.stopped_error??"Deletion stopped",result.stopped_status??503));
    setError(`${count} trips deleted. ${result.remaining_trip_ids.length} trips remain unconfirmed. ${message}`);
    toast?.addToast({notificationKey,duration:6000,title:"Trip deletion stopped",description:`${count} deleted; ${result.remaining_trip_ids.length} remain unconfirmed.${result.cleanup_pending?" Image cleanup is pending for completed trips.":""}`,variant:"warning"});
    if(count)onDeleted(result.deleted_trip_ids);
    return;
   }
   toast?.addToast({notificationKey,duration:4500,title:result.cleanup_pending?`${count} trip${count===1?"":"s"} deleted — cleanup pending`:count===1?"Trip deleted successfully":"Trips deleted successfully",variant:result.cleanup_pending?"warning":"success",description:result.cleanup_pending?"Database deletion is confirmed; image cleanup is pending in the existing retry queue.":count===1?"The trip and its related records have been deleted.":`Successfully deleted ${count} trips and their related records.`});
   // Rendering/reconciliation errors after commit must never be reported as a
   // failed database deletion. Always close the confirmed operation's dialog.
   try{onDeleted(result.deleted_trip_ids);}finally{onClose();}
  }catch(e){if(!committed&&active.current){const message=wholeTripDeletionErrorMessage(e);setError(message);toast?.addToast({notificationKey,title:"Unable to delete trip",description:message,variant:"error",duration:4500});}}
  finally{inFlight.current=false;if(active.current){setBusy(false);}}
 };
 return <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4 al-modal-backdrop"><section
  ref={dialog} tabIndex={-1} role="alertdialog" aria-modal="true" aria-busy={busy} aria-labelledby="whole-trip-delete-title" aria-describedby="whole-trip-delete-warning"
  onKeyDown={event=>{
   if(event.key==="Escape"){event.stopPropagation();event.preventDefault();if(!busy)close();}
   if(event.key==="Tab"){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));const first=controls[0],last=controls.at(-1);if(!controls.length){event.preventDefault();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }} className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
  <h2 id="whole-trip-delete-title" className="font-semibold text-slate-900">{actionLabel}</h2>
  <p className="mt-2 text-sm font-semibold text-slate-800">{pendingIds.length} trip{pendingIds.length===1?"":"s"} selected</p>
  {pendingIds.length>20&&<p className="mt-2 text-sm text-slate-600">Trips are deleted in batches. Completed batches cannot be undone if a later batch fails.</p>}
  <p id="whole-trip-delete-warning" className="mt-3 text-sm text-slate-600">Are you sure you want to delete the selected trip(s)? This will permanently delete the trips and all their related data, including transmittals, reports, PODs, receipts, and attachments.</p>
  <p className="mt-2 text-sm font-medium text-rose-800">This action cannot be undone.</p>
  {busy&&<p role="status" className="mt-3 text-sm text-slate-600">Deleting {pendingIds.length} trip{pendingIds.length===1?"":"s"} and related records. Keep this window open.</p>}
  {(error || (impact && !impact.can_delete)) && <p role="alert" className="mt-3 text-sm text-rose-800">{error || wholeTripBlockerMessage(impact?.blockers ?? [])}</p>}
  <footer className="mt-5 flex justify-end gap-2"><button ref={cancelButton} type="button" disabled={busy} onClick={close} className="rounded-lg border px-3 py-2">Cancel</button><button type="button" disabled={busy||!impact?.can_delete} onClick={()=>void remove()} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-white disabled:opacity-60">{busy&&<LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none"/>}{busy?(pendingIds.length===1?"Deleting...":"Deleting selected trips..."):actionLabel}</button></footer>
 </section></div>;
}
