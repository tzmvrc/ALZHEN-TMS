import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
export type OperationalState=Record<string,any>&{assignment_id:string;trip_stop_id:string;trip_id:string;has_events:boolean;pod_approved:boolean;delivery_status:string};
export async function readConfirmedOperationalState(trips:string[]):Promise<OperationalState[]>{const unique=[...new Set(trips)];const rows:OperationalState[]=[];for(let i=0;i<unique.length;i+=200){const r=await db.rpc('read_confirmed_operational_state_batch_v1',{p_trips:unique.slice(i,i+200)});if(r.error||!Array.isArray(r.data))throw new ApiError('Confirmed delivery progress could not load. Retry to refresh the operational records.',503,'OPERATIONAL_STATE_UNAVAILABLE');rows.push(...r.data);}return rows;}
const times=['warehouse_arrival_at','loading_start_at','loading_finished_at','warehouse_departure_time','arrival_time','start_unloading_time','finish_unloading_time','departure_time','delivery_completed_date','pod_submitted_at','pod_received_at'];
export function projectConfirmedOperationalRows(rows:Record<string,unknown>[],states:OperationalState[],documents:Record<string,any>[]){
 const activeTrips=new Set(states.filter(s=>s.has_events).map(s=>s.trip_id)),byAssignment=new Map(states.map(s=>[`${s.assignment_id}:${s.trip_stop_id}`,s]));
 const byStop=new Map<string,Record<string,any>[]>();for(const document of documents){const key=`${document.assignment_id}:${document.trip_stop_id}`;const group=byStop.get(key)??[];group.push(document);byStop.set(key,group);}
 for(const row of rows){
  const assignment=String(row._assignment_id??row.assignment_id??''),stop=String(row._trip_stop_id??row.trip_stop_id??''),key=`${assignment}:${stop}`,state=byAssignment.get(key);if(!state||!activeTrips.has(state.trip_id))continue;
  for(const key of times)row[key]=state[key]??null;
  row.departure_from_warehouse_at=state.warehouse_departure_time??null;row.delivery_status=state.delivery_status;row.delivery_status_source='CONFIRMED_MILESTONES';row.pod_approved=state.pod_approved;
  const dr=String(row.dr_number||row.transaction_dr_number||'').trim(),owned=(byStop.get(key)??[]).filter(d=>!dr||String(d.dr_number??'').trim()===dr);
  const approved=owned.filter(d=>d.pod_review_status==='APPROVED').sort((a,b)=>Date.parse(b.pod_reviewed_at??b.created_at)-Date.parse(a.pod_reviewed_at??a.created_at));
  const latest=[...owned].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0],document=approved[0]??latest,event=Array.isArray(document?.event)?document.event[0]:document?.event;
  row.pod_status=dr?(approved.length?'RECEIVED':document?.pod_review_status==='REJECTED'?'REJECTED':document?'PENDING_TRUCKER_CONFIRMATION':null):state.pod_approved?'RECEIVED':latest?.pod_review_status==='REJECTED'?'REJECTED':latest?'PENDING_TRUCKER_CONFIRMATION':null;
  row.pod_received_at=dr?approved[0]?.pod_reviewed_at??null:state.pod_approved?state.pod_received_at:null;
  row.pod_submitted_at=!dr&&state.pod_submitted_at?state.pod_submitted_at:event?.event_type==='POD_SUBMITTED'?event.event_time:document?.created_at??null;
  if(row.pod_submitted_at)row.signed_dr_upload_date=row.pod_submitted_at;
 }
 return rows;
}
export async function attachConfirmedOperationalState(rows:Record<string,unknown>[]){
 const ids=[...new Set(rows.map(r=>String(r.trip_id??r._trip_id??'')).filter(id=>isValidUuid(id)))];if(!ids.length)return;
 const states=await readConfirmedOperationalState(ids),documents:Record<string,any>[]=[];
 const active=[...new Set(states.filter(s=>s.has_events).map(s=>s.trip_id))];
 for(let index=0;index<active.length;index+=50)for(let offset=0;;offset+=1000){
  const result=await db.from('trip_images').select('id,assignment_id,trip_stop_id,dr_number,created_at,pod_review_status,pod_reviewed_at,event:trip_events!trip_images_delivery_event_id_fkey(event_type,event_time)').in('trip_id',active.slice(index,index+50)).eq('kind','receipt').eq('delivery_upload_state','READY').order('id').range(offset,offset+999);
  if(result.error)throw new ApiError('Saved POD status could not load. Retry to refresh the delivery documents.',503,'OPERATIONAL_POD_UNAVAILABLE');documents.push(...result.data??[]);if((result.data?.length??0)<1000)break;
 }
 projectConfirmedOperationalRows(rows,states,documents);
}
