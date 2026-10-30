import {useEffect,useRef,useState} from "react";
import {LoaderCircle} from "lucide-react";
import {deleteSelectedLineItems,type LineItemDeletionTarget} from "../../services/trip.service";
import {deleteMasterListStop} from "../../services/master-list-hierarchy.service";
import {deleteWholeTripSelection,fetchWholeTripImpact,type WholeTripImpact} from "../../services/whole-trip-deletion";
import {wholeTripBlockerMessage} from "../../services/whole-trip-deletion-feedback";

export type MasterListDeletePlan={
  dispatches:string[];
  drGroups:number;
  trips:string[];
  stops:Array<{tripId:string;stopId:string;label:string}>;
  lines:LineItemDeletionTarget[];
};

export default function MasterListDeleteDialog({token,plan,onClose,onChanged}:{token:string;plan:MasterListDeletePlan;onClose:()=>void;onChanged:()=>void}){
  const [pending,setPending]=useState(plan),[impact,setImpact]=useState<WholeTripImpact|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),cancel=useRef<HTMLButtonElement>(null);
  const tripIdentity=pending.trips.join(",");
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;cancel.current?.focus();return()=>previous?.focus();},[]);
  useEffect(()=>{
    if(!tripIdentity){setImpact(null);return;}
    let active=true;const controller=new AbortController();
    queueMicrotask(()=>{if(active){setImpact(null);setError("");}});
    void fetchWholeTripImpact(token,tripIdentity.split(","),controller.signal)
      .then(result=>{if(active)setImpact(result);})
      .catch(()=>{if(active)setError("Unable to check the selected trips. Close and reload before retrying.");});
    return()=>{active=false;controller.abort();};
  },[token,tripIdentity]);
  const close=()=>{if(!inFlight.current)onClose();};
  const remove=async()=>{
    if(inFlight.current||pending.trips.length&&!impact?.can_delete)return;
    inFlight.current=true;setBusy(true);setError("");
    let deleted=0;
    const next:MasterListDeletePlan={...pending,trips:[...pending.trips],stops:[...pending.stops],lines:[...pending.lines]};
    try{
      if(next.trips.length){
        const result=await deleteWholeTripSelection(token,next.trips);
        deleted+=result.deleted_trips;next.trips=result.remaining_trip_ids;
        if(next.trips.length)throw new Error(result.stopped_error??"Trip deletion stopped. Reload before retrying the remaining rows.");
      }
      for(const stop of pending.stops){
        await deleteMasterListStop(token,stop.tripId,stop.stopId);
        deleted++;next.stops=next.stops.filter(item=>item.stopId!==stop.stopId);
      }
      for(let index=0;index<pending.lines.length;index+=20){
        const batch=pending.lines.slice(index,index+20),result=await deleteSelectedLineItems(token,batch);
        deleted+=result.deleted.length;
        next.lines=[...result.failed,...pending.lines.slice(index+20)];
        if(result.failed.length)throw new Error(`${result.failed.length} product row${result.failed.length===1?" was":"s were"} not deleted. Reload before retrying.`);
      }
      if(deleted)onChanged();
      onClose();
    }catch(cause){
      if(deleted)next.dispatches=[];
      setPending(next);
      setError((cause instanceof Error?cause.message:"Deletion could not be confirmed.")+(deleted?` ${deleted} selected record${deleted===1?" was":"s were"} deleted; the remaining selection is still listed here.`:""));
      if(deleted)onChanged();
    }finally{inFlight.current=false;setBusy(false);}
  };
  const ready=!pending.trips.length||Boolean(impact?.can_delete);
  const total=pending.trips.length+pending.stops.length+pending.lines.length;
  return <div className="ml-confirm-backdrop"><div role="alertdialog" aria-modal="true" aria-labelledby="ml-delete-title" aria-describedby="ml-delete-description" className="ml-confirm" onKeyDown={event=>{if(event.key==="Escape"&&!busy){event.preventDefault();close();}}}>
    <h2 id="ml-delete-title">Delete selected rows?</h2>
    <p id="ml-delete-description">{pending.dispatches.length>0&&`${pending.dispatches.length} dispatch${pending.dispatches.length===1?"":"es"} (${pending.trips.length} trip${pending.trips.length===1?"":"s"}), `}{pending.stops.length} whole DR stop{pending.stops.length===1?"":"s"}, {pending.drGroups} DR group{pending.drGroups===1?"":"s"}, and {pending.lines.length} product row{pending.lines.length===1?"":"s"} are selected. Dispatch deletion includes its trips, stops, products, reports, and attachments. Whole DR stop deletion includes its products and may remove its trip if it was the last stop. A DR group that shares a stop deletes only its own product rows. This cannot be undone.</p>
    {impact&&pending.trips.length>0&&<p className="mt-2 text-xs text-slate-600">Trip impact: {impact.counts.trip_stops??0} stops and {impact.counts.trip_line_items??0} product rows.</p>}
    {busy&&<p role="status" className="mt-2 text-xs text-slate-600">Deleting selected records…</p>}
    {(error||impact&&!impact.can_delete)&&<p role="alert" className="mt-2 text-xs text-rose-700">{error||wholeTripBlockerMessage(impact?.blockers??[])}</p>}
    <div><button ref={cancel} type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy||!ready||!total} onClick={()=>void remove()}>{busy?<><LoaderCircle size={14} className="animate-spin"/> Deleting…</>:"Delete selected"}</button></div>
  </div></div>;
}
