import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,Clock,FileText,Package,ShieldCheck,Truck,X} from 'lucide-react';
import {cargoDeliveryState,productDeliveryHistory} from '../../services/cargo-delivery';
import {phTime,type DeliveryCargo,type DeliveryWorkspace} from '../../services/delivery.service';
import {cargoPodReceipt} from '../../services/pod-submissions';
import type {TripReceipt} from '../../services/receipt.service';
import type {TripEvent} from '../../services/trip.service';
import ImagePreview from '../ui/ImagePreview';
import {useDialogViewport} from '../ui/useDialogViewport';
import './product-delivery-timeline.css';

export default function ProductDeliveryTimeline({cargo,workspace,receipts,events,onClose}:{cargo:DeliveryCargo;workspace:DeliveryWorkspace;receipts:TripReceipt[];events:TripEvent[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[preview,setPreview]=useState<string|null>(null);
 useDialogViewport(dialog);
 useEffect(()=>{const node=dialog.current,previous=document.activeElement as HTMLElement|null;node?.showModal();return()=>{node?.close();previous?.focus({preventScroll:true});};},[]);
 const stop=workspace.stops.find(s=>s.id===cargo.line.trip_stop_id),dr=cargo.line.dr_number||stop?.dr_number||'Not recorded';
 const pod=cargoPodReceipt(cargo,receipts,workspace.assignment.id,Object.fromEntries(workspace.stops.map(s=>[s.id,s.dr_number])),workspace.cargo);
 const state=cargoDeliveryState(cargo,pod,workspace),history=productDeliveryHistory(cargo,workspace,receipts,events),photos=history.flatMap(row=>row.photos),index=photos.findIndex(p=>p.id===preview),photo=photos[index];
 const {assignment}=workspace;
 const facts=[['DR number',dr],['Truck / driver',[assignment.truck?.plate_number,[assignment.driver?.first_name,assignment.driver?.last_name].filter(Boolean).join(' ')].filter(Boolean).join(' / ')||'Not recorded'],['Destination',stop?.store?.name||'Not recorded'],['Assigned quantity / CBM',`${cargo.quantity} units / ${cargo.allocated_cbm} CBM`],['Delivery status',state.label],['POD review',state.review?state.review.charAt(0)+state.review.slice(1).toLowerCase():'Not submitted']];
 return createPortal(<><dialog className="product-delivery-dialog" ref={dialog} aria-labelledby="product-delivery-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <header><span className="product-delivery-symbol"><Package size={24} aria-hidden/></span><div><small>Product delivery history</small><h2 id="product-delivery-title">{cargo.line.customer_model||cargo.line.product?.model_code||'Product'}</h2></div><button type="button" aria-label="Close product delivery history" onClick={onClose}><X size={21}/></button></header>
  <div className="product-delivery-body"><dl className="product-delivery-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   <h3>Delivery timeline</h3><p className="product-delivery-caption">Recorded activity for this allocation and destination. Admin reviews are shown separately from delivery milestones.</p>
   {history.length===0?<p>No recorded delivery events for this allocation.</p>:<ol className="product-delivery-history">{history.map(row=><li key={row.id} data-kind={row.kind} data-status={row.status??''}><span className="product-delivery-dot">{row.kind==='review'?<ShieldCheck size={17}/>:row.kind==='submission'?<FileText size={17}/>:<Truck size={17}/>}</span><article><div className="product-delivery-event-title"><strong>{row.title}</strong>{row.status&&<span className="product-delivery-badge" data-status={row.status}>{row.status==='PENDING'?<Clock size={12}/>:row.status==='APPROVED'?<Check size={12}/>:<X size={12}/>} {row.status.charAt(0)+row.status.slice(1).toLowerCase()}</span>}</div><time dateTime={row.time}>{phTime(row.time)}</time>{row.kind==='review'&&<small>Admin review{row.actor?` · ${row.actor}`:''}</small>}{row.kind==='submission'&&row.actor&&<small>Submitted by {row.actor}</small>}{row.reason&&<p>{row.reason}</p>}{row.photos.length>0&&<div className="product-delivery-photos">{row.photos.map(p=><button type="button" key={p.id} disabled={!p.signed_url} aria-label={`Preview ${p.file_name||'POD photo'}`} onClick={()=>setPreview(p.id)}>{p.signed_url&&p.mime_type!=='application/pdf'?<img src={p.signed_url} alt={p.file_name||'POD receipt'} loading="lazy"/>:<FileText size={22}/>}</button>)}</div>}</article></li>)}</ol>}
   {state.review==='PENDING'&&<p className="product-delivery-pending"><Clock size={16} aria-hidden/>Admin POD review pending</p>}
  </div><footer><button type="button" onClick={onClose}>Done</button></footer>
 </dialog>{photo&&<ImagePreview key={photo.id} file={{id:photo.id,file_name:photo.file_name||'POD photo',url:photo.signed_url,mime_type:photo.mime_type}} onClose={()=>setPreview(null)} onPrevious={photos.length>1?()=>setPreview(photos[(index-1+photos.length)%photos.length].id):undefined} onNext={photos.length>1?()=>setPreview(photos[(index+1)%photos.length].id):undefined}/>}</>,document.body);
}
