import type {TripReceipt} from './receipt.service';
import type {DeliveryCargo} from './delivery.service';
import {snapshotOf,splitSaved} from './receipt-fields.service';
import type {TripEvent} from './trip.service';
export type PodCargoReview=Pick<TripReceipt,'id'|'trip_id'|'assignment_id'|'trip_stop_id'|'dr_number'|'ocr_text'|'pod_review_status'|'pod_review_version'|'delivery_event_id'|'display_order'|'uploaded_at'>;

/** Merge a confirmed receipt response without waiting for the socket round trip. */
export function eventsWithPodReviews(events:TripEvent[],receipts:TripReceipt[]){
 return events.map(event=>{
  const pages=receipts.filter(r=>r.delivery_event_id===event.id&&r.trip_id===event.trip_id&&r.assignment_id===event.assignment_id&&r.trip_stop_id===event.trip_stop_id);
  if(!pages.length)return event;
  const attachments=new Map((event.attachments??[]).map(page=>[page.id,page]));
  for(const page of pages){const old=attachments.get(page.id);if(Number(old?.pod_review_version??-1)>Number(page.pod_review_version??0))continue;attachments.set(page.id,{...old,id:page.id,file_name:page.file_name||'POD photo',kind:'receipt',pod_review_status:page.pod_review_status??undefined,pod_review_version:page.pod_review_version??undefined});}
  return {...event,attachments:[...attachments.values()]};
 });
}

export function orderedPodCargo(cargo:DeliveryCargo[],receipts:TripReceipt[],assignment:string,stopDrNumbers:Record<string,string|null>={}){
 const rows=cargo.map(item=>({cargo:item,receipt:cargoPodReceipt(item,receipts,assignment,stopDrNumbers,cargo)}));
 return [...rows.filter(row=>row.receipt?.pod_review_status==='APPROVED'),...rows.filter(row=>row.receipt?.pod_review_status!=='APPROVED')];
}

/** A DR is a label, never a submission identity. Legacy photos remain independent. */
export function podSubmissions<T extends Pick<TripReceipt,'id'|'delivery_event_id'|'display_order'|'uploaded_at'>>(receipts:T[]){
 const groups=new Map<string,T[]>();
 for(const receipt of receipts){const key=receipt.delivery_event_id||receipt.id;groups.set(key,[...(groups.get(key)??[]),receipt]);}
 return [...groups.values()].map(pages=>pages.sort((a,b)=>(a.display_order??0)-(b.display_order??0)||(a.uploaded_at??'').localeCompare(b.uploaded_at??'')||a.id.localeCompare(b.id)));
}
export function podLabel(receipt:TripReceipt,stopLabels:Record<string,string>){
 const snapshot=snapshotOf(receipt.ocr_text??'',receipt.dr_number??'');
 return `${snapshot.fields.dr||'No DR'} — ${receipt.trip_stop_id&&stopLabels[receipt.trip_stop_id]||snapshot.fields.receiver||'Store not recorded'}`;
}

/** Only explicit replacement links form a history; independent same-DR PODs stay separate. */
export function podReviewThreads(receipts:TripReceipt[]){
 const submissions=podSubmissions(receipts),byPage=new Map(submissions.flatMap(group=>group.map(page=>[page.id,group] as const)));
 const threads=new Map<string,TripReceipt[][]>();
 for(const group of submissions){let root=group;const visited=new Set<string>();while(root[0].replaces_receipt_id&&!visited.has(root[0].id)){visited.add(root[0].id);const prior=byPage.get(root[0].replaces_receipt_id);if(!prior||prior[0].assignment_id!==group[0].assignment_id||prior[0].trip_stop_id!==group[0].trip_stop_id||prior[0].dr_number!==group[0].dr_number)break;root=prior;}const key=root[0].id;threads.set(key,[...(threads.get(key)??[]),group]);}
 return [...threads.values()].map(attempts=>attempts.sort((a,b)=>(a[0].uploaded_at??'').localeCompare(b[0].uploaded_at??'')));
}
/** Only explicit submitted models/quantities, matched to this truck, stop and DR. */
export function submittedPodProducts(receipt:TripReceipt,cargo:DeliveryCargo[],stopDrNumbers:Record<string,string|null>={}):Array<{model:string;dr:string|null;quantity:number|null;allocationId?:string}>{
 const saved=splitSaved(receipt.ocr_text??''),models=(saved.header.models??'').split(',').map(m=>m.trim()).filter(Boolean);
 const dr=(receipt.dr_number||saved.header.dr||'').trim();
 const eligible=cargo.filter(c=>c.line.trip_stop_id===receipt.trip_stop_id&&(c.line.dr_number||c.line.stop_dr_number||stopDrNumbers[c.line.trip_stop_id])?.trim()===dr);
 if(saved.productSelections!==undefined)return saved.productSelections.filter(selection=>selection.assignment_id===receipt.assignment_id&&selection.trip_stop_id===receipt.trip_stop_id&&selection.dr_number.trim()===dr&&eligible.some(item=>item.id===selection.allocation_id&&item.line.id===selection.line_item_id&&[item.line.customer_model,item.line.product?.model_code].includes(selection.model)&&(selection.product_id==null||selection.product_id===item.line.product_id))).map(selection=>({model:selection.model,dr:selection.dr_number,quantity:selection.quantity,allocationId:selection.allocation_id}));
 return [...new Set(models)].filter(model=>eligible.some(c=>[c.line.customer_model,c.line.product?.model_code].includes(model))).map(model=>({model,dr:dr||null,quantity:saved.modelQuantities?.[model]??null}));
}
export function cargoPodReceipt<T extends PodCargoReview>(cargo:DeliveryCargo,receipts:T[],assignment:string,stopDrNumbers:Record<string,string|null>={},allCargo?:DeliveryCargo[]){
 const names=[cargo.line.customer_model,cargo.line.product?.model_code].filter((value):value is string=>!!value),dr=(cargo.line.dr_number||cargo.line.stop_dr_number||stopDrNumbers[cargo.line.trip_stop_id])?.trim();
 return podSubmissions(receipts.filter(r=>r.assignment_id===assignment&&r.trip_stop_id===cargo.line.trip_stop_id&&r.dr_number?.trim()===dr)).map(p=>p[0]).filter(receipt=>{
  const saved=splitSaved(receipt.ocr_text??'');
  if(saved.productSelections!==undefined)return saved.productSelections.some(selection=>selection.allocation_id===cargo.id&&selection.line_item_id===cargo.line.id&&selection.assignment_id===assignment&&selection.trip_stop_id===cargo.line.trip_stop_id&&selection.dr_number.trim()===dr);
  const models=(saved.header.models??'').split(',').map(model=>model.trim());
  return names.some(name=>models.includes(name)&&(!allCargo||allCargo.filter(item=>item.line.trip_stop_id===cargo.line.trip_stop_id&&(item.line.dr_number||item.line.stop_dr_number||stopDrNumbers[item.line.trip_stop_id])?.trim()===dr&&[item.line.customer_model,item.line.product?.model_code].includes(name)).length===1));
 }).sort((a,b)=>(b.uploaded_at??'').localeCompare(a.uploaded_at??''))[0];
}
