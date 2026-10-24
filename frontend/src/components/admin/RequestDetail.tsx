import {createContext,useContext,useEffect,useRef,useState} from "react";
import {createPortal,flushSync} from "react-dom";
import {Check,Mail,Plus,Search,Trash2,X} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import type {DispatchRequest,RequestLineItem} from "../../types/requests";
import {editableRequestFields,validateRequestDraft} from "../../services/request-draft";
import {searchRelationshipOptions,type RelationshipKind} from "../../services/lookup.service";
import {originalRequest,saveRequestDraft,setRequestStatus,sendRequestMessage,useRequests} from "./requestsStore";
import ImportPreviewInput from "./ImportPreviewInput";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import "./request-review.css";

const date=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("en-PH",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"}):"Not recorded";
const PendingCellContext=createContext<(pending:boolean)=>void>(()=>{});
const fields:Array<{key:keyof RequestLineItem;label:string;type?:"number";lookup?:RelationshipKind}>=[
  {key:"customerName",label:"Customer",lookup:"customers"},{key:"shipTo",label:"Store / destination",lookup:"stores"},
  {key:"address",label:"Delivery address"},{key:"city",label:"City"},{key:"province",label:"Province"},
  {key:"customerModel",label:"Product / model",lookup:"products"},{key:"productCategory",label:"Category"},
  {key:"qty",label:"Quantity",type:"number"},{key:"unitCbm",label:"Unit CBM",type:"number"},{key:"totalCbm",label:"Total CBM",type:"number"},
  {key:"dr",label:"DR No."},{key:"customerPo",label:"Customer PO"},{key:"soNo",label:"SO No."},{key:"sapSoNo",label:"SAP SO No."},{key:"dn",label:"DN"},
];

/** Existing spreadsheet lookups, constrained to read only: samples cannot create master records. */
function DraftCell({label,value,onCommit,lookup,disabled,type="text"}:{label:string;value:string;onCommit:(value:string)=>void;lookup?:RelationshipKind;disabled:boolean;type?:string}){
  const {accessToken}=useAuth();const [searching,setSearching]=useState(false);
  const setPending=useContext(PendingCellContext);
  if(searching&&lookup&&accessToken)return <SearchableRelationshipEditor token={accessToken} kind={lookup} value={value} optionLoader={query=>searchRelationshipOptions(accessToken,lookup,query)} onSelect={option=>{onCommit(lookup==="products"?option.values?.model_code||option.label:option.label);setSearching(false);}} onCommitBlur={()=>setSearching(false)} onCancel={()=>setSearching(false)}/>;
  return <span className="request-draft-cell"><ImportPreviewInput aria-label={label} type={type} step={type==="number"?"any":undefined} min={type==="number"?0:undefined} disabled={disabled} value={type==="date"?value.slice(0,10):value} onCommit={onCommit} onDraftChange={setPending}/>{lookup&&!disabled&&accessToken&&<button type="button" aria-label={`Find ${label}`} title="Search existing records (read only)" onClick={()=>setSearching(true)}><Search size={13}/></button>}</span>;
}

function RequestReview({request,onClose}:{request:DispatchRequest;onClose:()=>void}){
  const [draft,setDraft]=useState(()=>structuredClone(request));
  const [errors,setErrors]=useState<string[]>([]),[feedback,setFeedback]=useState("");
  const [pendingCell,setPendingCell]=useState(false);
  const [action,setAction]=useState<"approve"|"reject"|"discard"|null>(null),[reason,setReason]=useState(""),[message,setMessage]=useState("");
  const dialog=useRef<HTMLDivElement>(null),closeRef=useRef<()=>void>(()=>{}),dirtyRef=useRef(false),errorRef=useRef<HTMLDivElement>(null);
  const original=originalRequest(request.id);
  const dirty=JSON.stringify(editableRequestFields(draft))!==JSON.stringify(editableRequestFields(request));
  dirtyRef.current=dirty||!!message.trim()||action==="reject"&&!!reason.trim();
  const editable=request.status==="Pending";
  const [touched,setTouched]=useState(false);
  const issues=validateRequestDraft(draft);
  const saving=useRef(false);
  closeRef.current=()=>{
    // Backdrop mousedown occurs before blur: commit that last cell before checking dirty state.
    const focused=document.activeElement;
    if(focused instanceof HTMLInputElement&&dialog.current?.contains(focused))flushSync(()=>focused.blur());
    if(dirtyRef.current)setAction("discard");else onClose();
  };
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";dialog.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!event.defaultPrevented){event.preventDefault();closeRef.current();}
      if(event.key!=="Tab"||!dialog.current)return;
      const controls=[...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(!dialog.current.contains(document.activeElement)&&!(document.activeElement as HTMLElement|null)?.closest('[role="listbox"]')){event.preventDefault();(event.shiftKey?last:first)?.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirtyRef.current||[...dialog.current?.querySelectorAll<HTMLInputElement>("input[data-preview-value]")??[]].some(input=>input.value!==input.dataset.previewValue)){event.preventDefault();event.returnValue="";}};
    window.addEventListener("keydown",onKey);window.addEventListener("beforeunload",beforeUnload);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener("keydown",onKey);window.removeEventListener("beforeunload",beforeUnload);if(previous?.isConnected)previous.focus();};
  },[]);
  function change(patch:Partial<DispatchRequest>){setDraft(value=>({...value,...patch}));setPendingCell(false);setTouched(true);setFeedback("");setAction(null);setErrors([]);}
  function editItem(id:string,key:keyof RequestLineItem,value:string){
    const numeric=["qty","unitCbm","totalCbm"].includes(key);
    change({items:draft.items.map(item=>{
      if(item.id!==id)return item;
      const next={...item,[key]:numeric?(value===""&&key!=="qty"?undefined:Number(value)):value};
      if((key==="qty"||key==="unitCbm")&&next.unitCbm!==undefined)next.totalCbm=Math.round(next.qty*next.unitCbm*1000000)/1000000;
      return next;
    })});
  }
  function save(){
    if(!editable||saving.current)return false;
    saving.current=true;const saved=saveRequestDraft(draft);saving.current=false;
    setFeedback(saved?"Demo draft saved for this session. Reloading resets samples.":"This request can no longer be edited.");
    return saved;
  }
  function confirm(){
    if(saving.current)return;
    if(action==="discard"){onClose();return;}
    const invalid=action==="approve"?validateRequestDraft(draft):!reason.trim()?["A rejection reason is required."]:[];
    if(invalid.length){setErrors(invalid);requestAnimationFrame(()=>errorRef.current?.focus());return;}
    if(!save())return;
    saving.current=true;
    const changed=setRequestStatus(request.id,action==="approve"?"Approved":"Declined",action==="approve"?"Demo approval confirmed. No operational trip was created.":`Demo rejected: ${reason.trim()}`);
    saving.current=false;
    if(changed){setAction(null);setFeedback(action==="approve"?"Demo approved. No trip or dispatch was created.":"Demo rejected. The reason is preserved in this session’s review history.");}
    else setErrors(["The request changed. Close and reopen it before reviewing again."]);
  }
  const units=draft.items.reduce((sum,item)=>sum+Number(item.qty||0),0),cbm=draft.items.reduce((sum,item)=>sum+Number(item.totalCbm||0),0);
  return createPortal(<PendingCellContext.Provider value={setPendingCell}><div className="request-review-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeRef.current();}}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="request-review-title" aria-describedby="request-demo-notice" tabIndex={-1} className="request-review-modal">
      <header className="request-review-header"><div><p className="request-review-kicker"><Mail size={14}/>Email request review <span>Demo</span><span>{request.status}</span></p><h2 id="request-review-title">{request.emailSubject||request.reference}</h2><p>{request.fromName||request.fromEmail} · {request.fromEmail} · {date(request.receivedAt)} PHT</p></div><button type="button" aria-label="Close request review" onClick={()=>closeRef.current()}><X size={20}/></button></header>
      <p id="request-demo-notice" className="request-demo-notice">Session-only sample. Edits and review actions update this browser session; they do not create trips, send email, or save to Supabase.</p>
      <div className="request-review-scroll">
        <div className="request-review-summary"><div><small>Requested loading</small><strong>{draft.dispatchDate?.slice(0,10)||"Not set"}</strong></div><div><small>Route</small><strong>{draft.warehouse||"Origin needed"} → {[...new Set(draft.items.map(item=>item.shipTo).filter(Boolean))].join(" / ")||"Destination needed"}</strong></div><div><small>Requested cargo</small><strong>{units.toLocaleString()} units / {cbm.toLocaleString(undefined,{maximumFractionDigits:3})} CBM</strong></div></div>
        <section className="request-review-section"><h3>Trip & dispatch draft</h3><p>Enter or blur commits a cell to the open draft. Save Draft keeps it for this session.</p><div className="request-header-fields">
          {([{key:"reference",label:"Request reference"},{key:"fromName",label:"Customer / sender",lookup:"customers"},{key:"warehouse",label:"Warehouse",lookup:"warehouses"},{key:"dispatchDate",label:"Requested loading date",type:"date"},{key:"deliveryDate",label:"Estimated delivery date",type:"date"},{key:"courier",label:"Trucking company",lookup:"trucking-companies"},{key:"truckAssignment",label:"Truck assignment"}] as const).map(field=><label key={field.key}><span>{field.label}</span><DraftCell label={field.label} value={draft[field.key]??""} type={"type" in field?field.type:"text"} lookup={"lookup" in field?field.lookup:undefined} disabled={!editable} onCommit={value=>change({[field.key]:value})}/></label>)}
          <label><span>Region</span><select aria-label="Region" disabled={!editable} value={draft.region} onChange={event=>change({region:event.target.value as DispatchRequest["region"]})}>{["Luzon","Cebu","CDO","Davao"].map(region=><option key={region}>{region}</option>)}</select></label>
          <label><span>Priority</span><select aria-label="Priority" disabled={!editable} value={draft.priority} onChange={event=>change({priority:event.target.value as DispatchRequest["priority"]})}>{["High","Normal","Low"].map(value=><option key={value}>{value}</option>)}</select></label>
        </div></section>
        <section className="request-review-section"><div className="request-section-heading"><div><h3>Delivery stops & cargo</h3><p>One row per product and destination. Repeated destinations remain part of the same stop.</p></div>{editable&&<button type="button" onClick={()=>change({items:[...draft.items,{id:crypto.randomUUID(),customerName:draft.fromName,shipTo:"",customerModel:"",qty:1}]})}><Plus size={14}/>Add row</button>}</div>
          <div className="request-grid-scroll" role="region" aria-label="Editable request cargo" tabIndex={0}><table className="request-cargo-table"><thead><tr><th>#</th>{fields.map(field=><th key={field.key}>{field.label}</th>)}<th>Actions</th></tr></thead><tbody>{draft.items.map((item,index)=><tr key={item.id}><td>{index+1}</td>{fields.map(field=><td key={field.key}><DraftCell label={`${field.label} row ${index+1}`} value={String(item[field.key]??"")} type={field.type} lookup={field.lookup} disabled={!editable} onCommit={value=>editItem(item.id,field.key,value)}/></td>)}<td>{editable&&<button type="button" aria-label={`Remove cargo row ${index+1}`} onClick={()=>change({items:draft.items.filter(row=>row.id!==item.id)})}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table></div>
          {!draft.items.length&&<p>Add a cargo row to start the draft.</p>}
          {editable&&touched&&issues.length>0&&<p className="request-validation-note" role="status">{issues.length} item{issues.length===1?"":"s"} need correction before approval. {issues[0]}</p>}
        </section>
        <section className="request-review-section"><label className="request-remarks"><span>Additional instructions & remarks</span><textarea aria-label="Request remarks" disabled={!editable} value={draft.remarks??""} onChange={event=>change({remarks:event.target.value})} rows={2}/></label></section>
        <details className="request-review-section"><summary>Original email & extracted data (read only)</summary><p>{original?.emailSubject||original?.reference} · {original?.fromEmail}</p>{original?.messageThread.filter(message=>!message.self).map(message=><blockquote key={message.id}>{message.body}</blockquote>)}<p>{original?.remarks}</p><div className="request-original-scroll"><pre>{JSON.stringify(original?{warehouse:original.warehouse,dispatchDate:original.dispatchDate,deliveryDate:original.deliveryDate,items:original.items}:null,null,2)}</pre></div></details>
        <details className="request-review-section"><summary>Review history & internal notes ({request.messageThread.length})</summary>{request.messageThread.map(entry=><blockquote key={entry.id}><small>{entry.from} · {date(entry.at)}</small><p>{entry.body}</p></blockquote>)}<form onSubmit={event=>{event.preventDefault();if(message.trim()){sendRequestMessage(request.id,message.trim());setMessage("");}}}><label>Session-only internal note<textarea aria-label="Review note" value={message} onChange={event=>setMessage(event.target.value)} rows={2}/></label><button type="submit" disabled={!message.trim()}>Add note</button></form></details>
      </div>
      <footer className="request-review-footer">
        {feedback&&<p role="status">{feedback}</p>}
        {errors.length>0&&<div ref={errorRef} tabIndex={-1} role="alert" className="request-review-errors"><strong>Review needs attention</strong><ul>{errors.map(error=><li key={error}>{error}</li>)}</ul></div>}
        {action&&<div className="request-confirm" role="group" aria-label="Confirm review action"><strong>{action==="approve"?"Approve this sample request?":action==="reject"?"Reject this sample request?":"Discard unsaved changes?"}</strong><p>{action==="discard"?"Changes since your last Save Draft and unsubmitted notes will be lost.":"This is a demo review only. No operational records will be created or modified."}</p>{action==="reject"&&<label>Reason (required)<textarea autoFocus aria-label="Rejection reason" value={reason} onChange={event=>setReason(event.target.value)} rows={2}/></label>}<div><button type="button" onClick={()=>{setAction(null);setErrors([]);}}>Keep reviewing</button><button type="button" className="request-primary" onClick={confirm}>{action==="discard"?"Discard changes":action==="approve"?"Confirm demo approval":"Confirm demo rejection"}</button></div></div>}
        {!action&&<div className="request-review-actions"><span>{dirty||pendingCell?"Unsaved draft changes":editable?"No unsaved changes":"Reviewed sample · read only"}</span><button type="button" onClick={()=>closeRef.current()}>Close</button>{editable&&<><button type="button" disabled={!dirty&&!pendingCell} onClick={save}>Save Draft</button><button type="button" onClick={()=>{setErrors([]);setAction("reject");}}>Reject Request</button><button type="button" className="request-primary" onClick={()=>{const invalid=validateRequestDraft(draft);setErrors(invalid);if(!invalid.length)setAction("approve");else requestAnimationFrame(()=>errorRef.current?.focus());}}><Check size={15}/>Approve Request</button></>}</div>}
      </footer>
    </div>
  </div></PendingCellContext.Provider>,document.body);
}

/** One modal owner for Home and Requests; both use the same session-only sample store. */
export default function RequestReviewModal(){
  const {profile}=useAuth();const {requests,selectedId,select}=useRequests();
  const request=requests.find(row=>row.id===selectedId);
  if(!request||!["ADMIN","STAFF"].includes(profile?.role??""))return null;
  return <RequestReview key={request.id} request={request} onClose={()=>select(null)}/>;
}
