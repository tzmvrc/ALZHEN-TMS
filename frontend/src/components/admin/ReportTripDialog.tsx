import { useEffect, useRef, useState } from "react";
import OperationsEventSubmissionForm from "./OperationsEventSubmissionForm";
import { fetchAssignedOperations, getCachedOperations, type OperationsReportData } from "../../services/operations-report.service";

/** Uses the same form and protected APIs as management; choices are assignment-scoped. */
export default function ReportTripDialog({token,onClose,onComplete,onSubmitted}:{token:string;onClose:()=>void;onSubmitted:()=>void;onComplete:(message:string)=>void}) {
  const [data,setData]=useState<OperationsReportData|null>(()=>getCachedOperations(token,true));
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let cancelled=false;
    const previous=document.activeElement as HTMLElement|null;
    container.current?.querySelector<HTMLElement>("button,input,select")?.focus();
    void fetchAssignedOperations(token).then(value=>{if(!cancelled)setData(value);}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Unable to load assigned trips.");}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;previous?.focus();};
  },[token]);
  return <div className="fixed inset-0 z-[2200] flex items-center justify-center p-3 al-modal-backdrop" ref={container} onKeyDown={event=>{
    if(event.key!=="Tab")return;
    const items=Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]);
    if(!items.length)return;
    if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
  }}><div className="w-full max-w-2xl"><OperationsEventSubmissionForm token={token} assignedDispatch tripOptions={data?.trip_options??[]} tripsLoading={loading} tripsError={error} onCancel={onClose} onSubmitted={onSubmitted} onComplete={message=>onComplete(message??"Report submitted.")} /></div></div>;
}
