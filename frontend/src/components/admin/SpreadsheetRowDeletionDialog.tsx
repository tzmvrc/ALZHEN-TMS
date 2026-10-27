import { useEffect,useRef,useState } from "react";
import { LoaderCircle } from "lucide-react";
import { deleteSelectedLineItems,type LineItemDeletionTarget } from "../../services/trip.service";
import { useOptionalToast } from "../ui/toast-context";

/** The selected rows are a frozen list of verified line items, never parent trips. */
export function SpreadsheetRowDeletionDialog({token,targets,onClose,onDeleted}:{token:string;targets:LineItemDeletionTarget[];onClose:()=>void;onDeleted:(ids:string[])=>void}){
 const toast=useOptionalToast(),lock=useRef(false),alive=useRef(true);
 const [pending,setPending]=useState(targets),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const close=()=>{if(!lock.current)onClose();};
 const remove=async()=>{
  if(lock.current||!pending.length)return;lock.current=true;setBusy(true);setError("");
  try{
   const deleted:LineItemDeletionTarget[]=[],failed:LineItemDeletionTarget[]=[];
   for(let offset=0;offset<pending.length;offset+=20){
    try{const result=await deleteSelectedLineItems(token,pending.slice(offset,offset+20));deleted.push(...result.deleted);failed.push(...result.failed);}
    catch{failed.push(...pending.slice(offset));break;}
   }
   // Cache invalidation is independent of whether navigation kept this dialog mounted.
   if(!alive.current)return;
   if(deleted.length)onDeleted(deleted.map(target=>target.id));
   const message=failed.length?`${deleted.length} line items deleted; ${failed.length} could not be confirmed. Review the remaining selection before retrying.`:`${deleted.length} line items deleted.`;
   toast?.addToast({title:message,variant:failed.length?(deleted.length?"warning":"error"):"success",duration:4500});
   if(failed.length){setPending(failed);setError("Some line items could not be deleted. Check protected records or your connection before retrying.");}else onClose();
  }catch{if(alive.current){const message="Unable to delete the selected line items. Please try again.";setError(message);toast?.addToast({title:message,variant:"error"});}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 return <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section role="alertdialog" aria-modal="true" aria-label="Delete selected line items" aria-busy={busy} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}}} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
  <h2 className="text-sm font-semibold text-slate-900">Delete {pending.length} selected line item{pending.length===1?"":"s"}?</h2>
  <p className="mt-2 text-sm text-slate-600">Only the selected cargo line items will be removed. Trips and delivery stops will remain. This action cannot be undone.</p>
  {pending.length>20&&<p className="mt-2 text-xs text-slate-500">Deleted in batches of 20. Completed batches cannot be undone if a later batch fails.</p>}
  {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  <footer className="mt-4 flex justify-end gap-2"><button autoFocus type="button" disabled={busy} onClick={close} className="rounded border px-3 py-2 text-xs">Cancel</button><button type="button" disabled={busy} onClick={()=>void remove()} className="inline-flex items-center gap-2 rounded bg-rose-700 px-3 py-2 text-xs text-white disabled:opacity-50">{busy&&<LoaderCircle className="h-3 w-3 animate-spin"/>}{busy?"Deleting...":"Delete selected line items"}</button></footer>
 </section></div>;
}
