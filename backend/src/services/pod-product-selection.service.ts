import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';

/** Review metadata only: no OCR body, Storage path, signed URL or other assignment. */
export async function readPodCargoReviews(assignment:string,trip:string){
 const records:Record<string,any>[]=[];
 for(let offset=0;offset<=6000;offset+=1000){
  const result=await db.from('trip_images').select('id,trip_id,assignment_id,trip_stop_id,dr_number,ocr_text,pod_review_status,pod_review_version,delivery_event_id,display_order,created_at').eq('trip_id',trip).eq('assignment_id',assignment).eq('kind','receipt').or('delivery_upload_state.eq.READY,delivery_upload_state.is.null').order('id').range(offset,offset+999);
  if(result.error)throw new ApiError('POD product review status could not refresh. Please retry.',503,'DELIVERY_UNAVAILABLE');
  const batch=result.data??[];records.push(...batch);
  if(records.length>6000)throw new ApiError('This assignment exceeds the POD review detail limit. Contact dispatch.',409);
  if(batch.length<1000)return records.map(({created_at,ocr_text,...record})=>{const text=String(ocr_text??''),at=text.indexOf('--- Scanned text ---'),header=at<0?'':text.slice(0,at).split('\n').filter(line=>['Model Codes:','Model Quantities:','Product Selections:'].some(prefix=>line.startsWith(prefix))).join('\n');return {...record,uploaded_at:created_at,ocr_text:header?header+'\n--- Scanned text ---\n':''};});
 }
 throw new ApiError('POD product review status could not load completely. Please retry.',503,'DELIVERY_UNAVAILABLE');
}

/** Descriptive POD quantities remain separate from unloading and allocations. */
export async function validatePodProductSelections(text:string,assignment:string,trip:string){
 const marker=text.indexOf('--- Scanned text ---');
 const line=text.slice(0,marker<0?0:marker).split('\n').find(value=>value.startsWith('Product Selections: '));
 if(!line)return; // Existing receipts and queued drafts retain their legacy format.
 let entries:any;try{entries=JSON.parse(line.slice('Product Selections: '.length));}catch{throw new ApiError('Review the selected POD products and try again.',400);}
 if(!Array.isArray(entries)||entries.length>500||entries.some(item=>!item||typeof item!=='object'||!['allocation_id','line_item_id','assignment_id','trip_stop_id'].every(key=>isValidUuid(item[key]))||item.assignment_id!==assignment||typeof item.dr_number!=='string'||!item.dr_number.trim()||item.dr_number.length>100||typeof item.model!=='string'||!item.model.trim()||item.model.length>200||!Number.isSafeInteger(item.quantity)||item.quantity<0)||new Set(entries.map(item=>item.allocation_id)).size!==entries.length)throw new ApiError('Choose distinct products allocated to your truck and enter whole quantities.',400);
 if(!entries.length)return;
 const cargo=await db.from('trip_cargo_allocations').select('id,line:trip_line_items(id,trip_stop_id,product_id,dr_number,customer_model,product:products(model_code))').eq('trip_id',trip).eq('assignment_id',assignment).in('id',entries.map(item=>item.allocation_id)).limit(501);
 if(cargo.error)throw new ApiError('Selected product assignments could not be confirmed. Please retry.',503,'DELIVERY_UNAVAILABLE');
 const stops=await db.from('trip_stops').select('id,dr_number').eq('trip_id',trip).in('id',[...new Set(entries.map(item=>item.trip_stop_id))] as string[]).limit(501);
 if(stops.error)throw new ApiError('Selected product DR numbers could not be confirmed. Please retry.',503,'DELIVERY_UNAVAILABLE');
 for(const selection of entries){const row=cargo.data?.find(item=>item.id===selection.allocation_id),line=Array.isArray(row?.line)?row.line[0]:row?.line,product=Array.isArray(line?.product)?line.product[0]:line?.product,dr=line?.dr_number||stops.data?.find(stop=>stop.id===selection.trip_stop_id)?.dr_number;
  if(!line||line.id!==selection.line_item_id||line.trip_stop_id!==selection.trip_stop_id||String(dr??'').trim()!==selection.dr_number.trim()||![line.customer_model,product?.model_code].includes(selection.model)||selection.product_id!=null&&selection.product_id!==line.product_id)throw new ApiError('A selected product no longer matches this truck, delivery stop or DR. Review your product selection.',409);
 }
}
