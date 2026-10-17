import {useEffect,useMemo,useState} from "react";
import {fetchPodReviewCapabilities,fetchPodDecisionHistory,savePodDecision,type TripReceipt,type PodDecisionDraft,type PodReviewEvent} from "../../services/receipt.service";

export default function PodDecisionControls({token,receipt,reviewedFields,disabled,onSaved}:{token:string|null;receipt:TripReceipt;reviewedFields:Record<string,unknown>;disabled:boolean;onSaved:(row:TripReceipt)=>void}){
 const scope=useMemo(()=>({receiptId:receipt.id,signedIn:Boolean(token)}),[token,receipt.id]);
 const [capability,setCapability]=useState<{scope:object;enabled:boolean}|null>(null);
 const [draft,setDraft]=useState<{scope:object;data:PodDecisionDraft}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [history,setHistory]=useState<{scope:object;rows:PodReviewEvent[]}|null>(null);
 useEffect(()=>{let current=true;if(token)void fetchPodReviewCapabilities(token).then(value=>{if(current)setCapability({scope,enabled:value.enabled});},()=>{});return()=>{current=false;};},[token,scope]);
 if(capability?.scope!==scope||!capability.enabled)return null;
 if(receipt.pod_review_version==null)return <p role="status" className="mt-4 text-xs text-amber-800">POD review schema is unavailable. Manual OCR verification remains available.</p>;
 const current=draft?.scope===scope?draft.data:null;
 const open=(decision:"APPROVED"|"REJECTED")=>{setError("");setDraft({scope,data:{request_id:crypto.randomUUID(),decision,reason:"",reviewed_fields:{...reviewedFields},expected_review_version:receipt.pod_review_version!,expected_ocr_version:receipt.ocr_version}});};
 const save=async()=>{
  if(!token||!current||busy)return;
  setBusy(true);setError("");
  try{const result=await savePodDecision(token,receipt.trip_id,receipt.id,current);onSaved(result.receipt);setDraft(null);}
  catch(cause){setError(cause instanceof Error?cause.message:"POD decision failed. Retry the same request.");}
  finally{setBusy(false);}
 };
 return <section aria-label="POD approval" className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
  <p className="font-semibold">POD decision: {receipt.pod_review_status??"PENDING"}</p>
  <p>Approval records this document against its exact transaction and notifies the responsible trucker. It does not change delivery or billing values.</p>
  {receipt.pod_reviewed_at&&<p>Last decision: {new Date(receipt.pod_reviewed_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</p>}
  {receipt.pod_rejection_reason&&<p>Rejection reason: {receipt.pod_rejection_reason}</p>}
  {receipt.pod_review_status!=="APPROVED"&&!current&&<div className="flex gap-2">
   <button type="button" disabled={disabled||busy} onClick={()=>open("APPROVED")} className="rounded-lg bg-[#0b2341] px-3 py-2 text-white disabled:opacity-50">Approve POD</button>
   <button type="button" disabled={disabled||busy} onClick={()=>open("REJECTED")} className="rounded-lg border border-rose-200 px-3 py-2 text-rose-700 disabled:opacity-50">Reject POD</button>
  </div>}
  {disabled&&<p>Save or cancel OCR edits before deciding.</p>}
  {current&&<div role="group" aria-label="Confirm POD decision" className="space-y-2">
   <p>Confirm {current.decision.toLowerCase()} for DR {receipt.dr_number||"not provided"}?</p>
   {current.decision==="REJECTED"&&<label className="block">Rejection reason<textarea aria-label="POD rejection reason" maxLength={2000} disabled={busy} value={current.reason} onChange={e=>setDraft({scope,data:{...current,request_id:crypto.randomUUID(),reason:e.target.value}})} className="mt-1 block w-full rounded-lg border p-2"/></label>}
   <div className="flex gap-2"><button type="button" disabled={busy||disabled||(current.decision==="REJECTED"&&!current.reason.trim())} onClick={()=>void save()} className="rounded-lg bg-[#0b2341] px-3 py-2 text-white disabled:opacity-50">{busy?"Saving decision…":"Confirm decision"}</button>
    <button type="button" disabled={busy} onClick={()=>{setDraft(null);setError("");}} className="rounded-lg border px-3 py-2">Cancel decision</button></div>
  </div>}
  {error&&<p role="alert" className="text-rose-700">{error}</p>}
  <button type="button" onClick={()=>{if(token)void fetchPodDecisionHistory(token,receipt.trip_id,receipt.id).then(rows=>setHistory({scope,rows}),()=>setError("Review history could not be loaded. Retry."));}} className="underline">View latest 50 decisions</button>
  {history?.scope===scope&&<ul className="max-h-40 space-y-2 overflow-auto">{history.rows.length?history.rows.map(event=><li key={event.id}>{event.actor_snapshot}: {event.decision} · {new Date(event.created_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}{event.reason&&<p>{event.reason}</p>}</li>):<li>No decisions recorded yet.</li>}</ul>}
 </section>;
}
