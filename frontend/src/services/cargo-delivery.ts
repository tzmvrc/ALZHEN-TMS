import {deliveryEventLabel,type DeliveryCargo,type DeliveryWorkspace,type DeliveryEvent} from './delivery.service';
import type {TripReceipt} from './receipt.service';
import type {TripEvent} from './trip.service';
import {cargoPodReceipt,podSubmissions} from './pod-submissions';

/** Physical completion and document review remain independent projections. */
export function cargoDeliveryState(cargo:DeliveryCargo,pod:TripReceipt|undefined,workspace:DeliveryWorkspace){
 const atStop=workspace.milestones.filter(e=>e.trip_stop_id===cargo.line.trip_stop_id&&(!e.assignment_id||e.assignment_id===workspace.assignment.id));
 const complete=Number(cargo.quantity)>0&&Number(cargo.remaining)<=0&&atStop.some(e=>e.event_type==='STOP_DEPARTURE');
 const unloading=atStop.some(e=>e.event_type==='UNLOADING_STARTED')||Number(cargo.delivered)>0;
 const review=pod?.pod_review_status??null;
 const delivered=complete&&review==='APPROVED';
 return {complete,delivered,review,label:complete?(delivered?'Delivered':review==='REJECTED'?'Delivered — POD Rejected':review==='PENDING'?'Delivered — POD Pending':'Delivered — POD Not Submitted'):unloading?'Unloading':'On Truck'};
}

export function productDeliveryHistory(cargo:DeliveryCargo,workspace:DeliveryWorkspace,receipts:TripReceipt[],events:TripEvent[]){
 const {id:assignment,trip_id:trip}=workspace.assignment,stop=cargo.line.trip_stop_id;
 const stopDrs=Object.fromEntries(workspace.stops.map(s=>[s.id,s.dr_number]));
 const submissions=podSubmissions(receipts.filter(r=>r.trip_id===trip&&r.assignment_id===assignment&&r.trip_stop_id===stop)).filter(pages=>cargoPodReceipt(cargo,pages,assignment,stopDrs,workspace.cargo));
 const pages=submissions.flat(),receiptIds=new Set(pages.map(p=>p.id)),submissionIds=new Set(pages.map(p=>p.delivery_event_id).filter(Boolean));
 type Entry={id:string;time:string;title:string;kind:'physical'|'submission'|'review';reason?:string|null;status?:string|null;actor?:string|null;photos:TripReceipt[]};
 const confirmed=new Map(events.map(event=>[event.id,event]));
 for(const milestone of workspace.milestones)if(!confirmed.has(milestone.id))confirmed.set(milestone.id,{...milestone,trip_id:trip,assignment_id:assignment});
 const recorded=[...confirmed.values()];
 const rows:Entry[]=[];
 if(cargo.created_at&&Number.isFinite(Date.parse(cargo.created_at)))rows.push({id:`allocation:${cargo.id}`,time:cargo.created_at,title:'Assigned to Truck',kind:'physical',photos:[]});
 for(const e of recorded){
  if(e.trip_id!==trip||e.assignment_id!==assignment||!Number.isFinite(Date.parse(e.event_time)))continue;
  const review=e.delivery_metadata?.pod_review_event_id;
  const receiptId=e.delivery_metadata?.receipt_id;
  const photos=pages.filter(p=>p.delivery_event_id===e.id);
  if(review){if(!receiptId||!receiptIds.has(receiptId))continue;rows.push({id:e.id,time:e.event_time,title:e.event_type==='POD_APPROVED'&&pages.find(p=>p.id===receiptId)?.replaces_receipt_id?'Replacement POD Approved':deliveryEventLabel({event_type:e.event_type,delivery_metadata:e.delivery_metadata??{}}),kind:'review',reason:e.notes,status:e.event_type==='POD_REJECTED'?'REJECTED':'APPROVED',photos:[],actor:[(e as TripEvent&Partial<DeliveryEvent>).actor?.first_name,(e as TripEvent&Partial<DeliveryEvent>).actor?.last_name].filter(Boolean).join(' ')||pages.find(p=>p.id===receiptId)?.pod_reviewer_name});continue;}
  if(e.event_type==='POD_SUBMITTED'){if(!submissionIds.has(e.id))continue;rows.push({id:e.id,time:e.event_time,title:photos.some(p=>p.replaces_receipt_id)?'Replacement POD Submitted':'POD Submitted',kind:'submission',status:photos[0]?.pod_review_status,photos,actor:photos[0]?.uploader_name});continue;}
  if((e.event_type==='WAREHOUSE_DEPARTURE'&&!e.trip_stop_id)||(e.trip_stop_id===stop&&['IN_TRANSIT','ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'].includes(e.event_type)))rows.push({id:e.id,time:e.event_time,title:deliveryEventLabel({event_type:e.event_type,delivery_metadata:e.delivery_metadata??{}}),kind:'physical',photos:[]});
 }
 // Legacy documents still have persisted upload/review timestamps without event links.
 for(const submission of submissions){const p=submission[0];
  if(!rows.some(row=>row.photos.some(photo=>photo.id===p.id))&&p.uploaded_at)rows.push({id:`upload:${p.id}`,time:p.uploaded_at,title:p.replaces_receipt_id?'Replacement POD Submitted':'POD Submitted',kind:'submission',status:p.pod_review_status,actor:p.uploader_name,photos:submission});
  if(p.pod_reviewed_at&&['APPROVED','REJECTED'].includes(p.pod_review_status??'')&&!recorded.some(e=>e.assignment_id===assignment&&e.trip_id===trip&&e.delivery_metadata?.receipt_id&&submission.some(photo=>photo.id===e.delivery_metadata?.receipt_id)))rows.push({id:`review:${p.id}`,time:p.pod_reviewed_at,title:p.pod_review_status==='REJECTED'?'POD Rejected':p.replaces_receipt_id?'Replacement POD Approved':'POD Approved',kind:'review',status:p.pod_review_status,reason:p.pod_rejection_reason,actor:p.pod_reviewer_name,photos:[]});
 }
 return rows.filter(row=>Number.isFinite(Date.parse(row.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.id.localeCompare(b.id));
}
