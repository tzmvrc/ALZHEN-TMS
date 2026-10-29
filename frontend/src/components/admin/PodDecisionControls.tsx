import {useEffect,useMemo,useState,useRef} from "react";
import {CheckCircle2,TriangleAlert,LoaderCircle} from 'lucide-react';
import {snapshotOf} from '../../services/receipt-fields.service';
import {fetchPodReviewCapabilities,savePodDecision,type TripReceipt,type PodDecisionDraft} from "../../services/receipt.service";

export default function PodDecisionControls({token,receipt,reviewedFields,disabled,onSaved,receivingStore}:{token:string|null;receipt:TripReceipt;reviewedFields:Record<string,unknown>;disabled:boolean;onSaved:(row:TripReceipt)=>void;receivingStore?:string}){
 const scope=useMemo(()=>({receiptId:receipt.id,signedIn:Boolean(token)}),[token,receipt.id]);
 const [capability,setCapability]=useState<{scope:object;enabled:boolean}|null>(null);
 const [draft,setDraft]=useState<{scope:object;data:PodDecisionDraft}|null>(null);
 const savingLock=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");

 useEffect(()=>{let current=true;if(token)void fetchPodReviewCapabilities(token).then(value=>{if(current)setCapability({scope,enabled:value.enabled});},()=>{});return()=>{current=false;};},[token,scope]);
 if(capability?.scope!==scope||!capability.enabled)return null;
 if(receipt.pod_review_version==null)return <p role="status" className="mt-4 text-xs text-amber-800">POD review schema is unavailable. Manual OCR verification remains available.</p>;
 const current=draft?.scope===scope?draft.data:null;
 const open=(decision:"APPROVED"|"REJECTED")=>{setError("");setDraft({scope,data:{request_id:crypto.randomUUID(),decision,reason:"",reviewed_fields:{...reviewedFields},expected_review_version:receipt.pod_review_version!,expected_ocr_version:receipt.ocr_version}});};
 const save=async()=>{
  if(!token||!current||savingLock.current||disabled||current.decision==='REJECTED'&&!current.reason.trim())return;
  savingLock.current=true;setBusy(true);setError("");
  try{const result=await savePodDecision(token,receipt.trip_id,receipt.id,current);onSaved(result.receipt);setDraft(null);}
  catch(cause){setError(cause instanceof Error?cause.message:"POD decision failed. Retry the same request.");}
  finally{savingLock.current=false;setBusy(false);}
 };
 return <section aria-label="POD approval" className="mt-4 space-y-3 text-sm">
  {receipt.pod_rejection_reason&&<p>Rejection reason: {receipt.pod_rejection_reason}</p>}
  {receipt.pod_review_status!=="APPROVED"&&(!receipt.delivery_event_id||receipt.pod_review_status!=="REJECTED")&&!current&&<div className="flex gap-2">
   <button type="button" disabled={disabled||busy} onClick={()=>open("APPROVED")} className="min-h-11 rounded-lg bg-[#0b2341] px-3 py-2 text-white disabled:opacity-50">Confirm Receipt</button>
   <button type="button" disabled={disabled||busy} onClick={()=>open("REJECTED")} className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-rose-700 disabled:opacity-50">Reject POD</button>
  </div>}
  {disabled&&<p>Save or undo receipt edits before deciding.</p>}
  {current&&<DecisionModal label={current.decision==='REJECTED'?'Reject POD':'Confirm POD Approval'} onClose={()=>{if(!savingLock.current)setDraft(null);}}>
   <div className="pod-decision-icon" data-reject={current.decision==='REJECTED'}>{current.decision==='REJECTED'?<TriangleAlert size={28} aria-hidden/>:<CheckCircle2 size={28} aria-hidden/>}</div>
   <h2>{current.decision==='REJECTED'?'Reject POD':'Confirm POD Approval'}</h2>
   <div className="pod-decision-receipt"><strong>DR {receipt.dr_number||'Not provided'}</strong><span>{receivingStore||snapshotOf(receipt.ocr_text??'','').fields.receiver||'Receiving store not recorded'}</span></div>
   <p>{current.decision==='REJECTED'?'Explain what needs correcting. The trucker will be asked to upload a replacement.':'This POD will be marked Approved. Confirm that the receipt and received products are correct.'}</p>
   {current.decision==='REJECTED'&&<label className="pod-decision-reason">Rejection reason <span aria-hidden>*</span><textarea aria-label="POD rejection reason" maxLength={2000} autoFocus required disabled={busy} value={current.reason} placeholder="Describe what the trucker needs to correct" onChange={e=>{setError('');setDraft({scope,data:{...current,request_id:crypto.randomUUID(),reason:e.target.value}});}}/></label>}
   {error&&<p role="alert" className="text-rose-700">{error}</p>}
   <div className="pod-decision-actions"><button type="button" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>Cancel</button><button type="button" data-primary data-reject={current.decision==='REJECTED'} aria-busy={busy} disabled={busy||disabled||(current.decision==='REJECTED'&&!current.reason.trim())} onClick={()=>void save()}>{busy&&<LoaderCircle size={17} className="animate-spin" aria-hidden/>}{busy?'Saving decision...':current.decision==='REJECTED'?'Reject POD':'Approve POD'}</button></div>
  </DecisionModal>}
  {!current&&error&&<p role="alert" className="text-rose-700">{error}</p>}

 </section>;
}

function DecisionModal({label,onClose,children}:{label:string;onClose:()=>void;children:import('react').ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 return <dialog ref={dialog} aria-label={label} onCancel={e=>{e.preventDefault();onClose();}} className="pod-decision-modal">{children}</dialog>;
}
