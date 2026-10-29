import type {PodCargoReview} from './pod-submissions';
import {DELIVERY_STOP_STEPS} from './delivery-workflow';
import {apiGet,apiGetCached,invalidateApiCache,apiPost,apiUpload,apiPatch,type ApiResponse} from './api.service';
export type DeliveryEvent={demonstration?:boolean;id:string;trip_id:string;assignment_id:string|null;trip_stop_id:string|null;event_type:string;event_time:string;created_at:string;device_time:string|null;recorded_by:string;latitude:number|null;longitude:number|null;accuracy_meters:number|null;verification_method:string;notes:string|null;delivery_metadata:{actor_snapshot?:{profile_id:string;name:string;crew_role?:'DRIVER'|'HELPER'|null};pod_review_event_id?:string;receipt_id?:string;source_delivery_event_id?:string;replaces_receipt_id?:string;pod_replacement_request?:PodReplacementRequest;title?:string;dr_number?:string;related_dr_numbers?:string[];report_id?:string;report_type?:string;distance_meters?:number;geofence_meters?:number};delivery_version:number;actor?:{first_name:string;last_name:string};attachments:Array<{id:string;file_name:string;kind:string;url?:string|null;mime_type?:string;ocr_text?:string|null;ocr_confidence?:number|null;pod_review_status?:string;pod_review_version?:number;delivery_upload_state?:string}>};
export type DeliveryAssignment={id:string;trip_id:string;unassigned_at:string|null;truck:{plate_number:string;truck_type:string;capacity_cbm?:number};driver?:{first_name:string;last_name:string};company?:{name:string};trip:{dispatch_number:string;trip_reference?:string|null;status:string;loading_date:string;estimated_delivery_date:string}};
export type DeliveryStop={id:string;stop_sequence:number;dr_number:string|null;delivery_status:string;remarks?:string|null;store:{id:string;name:string;address:string;city?:string|null;province?:string|null;latitude:number|null;longitude:number|null;location_verified:boolean;arrival_radius_meters:number}|null};
export type DeliveryCargo={id:string;created_at?:string;quantity:string|number;allocated_cbm:string|number;delivered:number;remaining:number;line:{id:string;trip_stop_id:string;product_id?:string|null;stop_dr_number?:string|null;dr_number:string;customer_model:string;product?:{model_code:string;sku:string}}};
export type DeliveryWorkspace={crew?:Array<{profile_id:string;crew_role:'DRIVER'|'HELPER';profile:{first_name:string;last_name:string}}>; pod_cargo_reviews?:PodCargoReview[];assignment:DeliveryAssignment;warehouse:{id:string;name:string;latitude:number;longitude:number;location_verified:boolean;arrival_radius_meters:number}|null;stops:DeliveryStop[];cargo:DeliveryCargo[];pods?:Array<{trip_stop_id:string;dr_number:string|null;approved:boolean;pod_status:string;pod_submitted_at:string|null}>;milestones:Array<{id:string;event_type:string;trip_stop_id:string|null;event_time:string;verification_method:string;delivery_metadata?:{pod_replacement_request?:PodReplacementRequest}}>};
export type DeliveryInput={replaces_receipt_id?:string;type:string;stop_id?:string|null;device_time:string;remarks?:string;title?:string;gps?:{latitude:number;longitude:number;accuracy_meters:number;captured_at:string};attachments?:string[];quantities?:Array<{allocation_id:string;quantity:string|number}>;dr_number?:string;related_dr_numbers?:string[];ocr_text?:string;ocr_confidence?:number|null;waiting_minutes?:number};
export type EventDetails={attachments:Array<{id:string;file_name:string;url:string;mime_type?:string;kind:string;dr_number:string;ocr_text:string;ocr_confidence:number|null;pod_review_status:string}>;audit:Array<{id:string;action:string;created_at:string;old_data:Record<string,unknown>;new_data:Record<string,unknown>;actor?:{first_name:string;last_name:string}}>;quantities:Array<{id:string;quantity:number;allocation:{line:{customer_model:string;dr_number:string}}}>};
const base=(id:string)=>`/delivery/assignments/${encodeURIComponent(id)}`;
async function data<T>(request:Promise<ApiResponse<T>>){const r=await request;if(!r.success||!r.data)throw Error(r.message??'The saved result could not be confirmed.');return r.data;}
export const listDeliveryAssignments=(token:string,after?:string)=>data(apiGet<ApiResponse<{rows:DeliveryAssignment[];next:string|null}>>(`/delivery/assignments${after?`?after=${encodeURIComponent(after)}`:''}`,token));
export const readDeliveryWorkspace=(token:string,id:string)=>data(apiGet<ApiResponse<DeliveryWorkspace>>(base(id),token));
export async function readCurrentDeliveryWorkspace(token:string,fresh=false){if(fresh)invalidateApiCache('/delivery/current');const result=await apiGetCached<ApiResponse<DeliveryWorkspace|null>>('/delivery/current',token,1000);if(!result.success)throw Error(result.message??'Your assigned trip could not load. Retry loading.');return result.data??null;}
export const readDeliveryEvents=(token:string,id:string,cursor?:string,reportsOnly=false,includeEvidence=false)=>data(apiGet<ApiResponse<{rows:DeliveryEvent[];next:string|null}>>(`${base(id)}/events?${cursor?`cursor=${encodeURIComponent(cursor)}&`:''}${reportsOnly?'scope=reports&':''}${includeEvidence?'evidence=1':''}`,token));
export const readDeliveryEventDetails=(token:string,id:string,event:string,version?:number)=>data(apiGetCached<ApiResponse<EventDetails>>(`${base(id)}/events/${encodeURIComponent(event)}${version!==undefined?`?version=${version}`:''}`,token,60000));
export const saveDeliveryEvent=(token:string,id:string,key:string,input:DeliveryInput)=>data(apiPost<ApiResponse<DeliveryEvent>>(`${base(id)}/events`,input,token,undefined,30000,{'Idempotency-Key':key}));
export async function readDeliverySubmission(token:string,id:string,key:string){
 const result=await apiGet<ApiResponse<(DeliveryEvent&{delivery_payload:DeliveryInput})|null>>(`${base(id)}/submissions/${encodeURIComponent(key)}`,token,10000);
 if(!result.success)throw Error(result.message??'The saved submission could not be checked.');return result.data??null;
}
export const uploadDeliveryPhoto=(token:string,id:string,key:string,stop:string|null,file:File)=>data(apiUpload<ApiResponse<{id:string;state:string}>>(`${base(id)}/evidence`,file,file.type,file.name,token,{'Idempotency-Key':key,...(stop?{'X-Trip-Stop-Id':stop}:{})},30000));
export const reviewDeliveryEvent=async(token:string,id:string,event:string,input:{version:number;action:string;reason:string;time?:string})=>{const saved=await data(apiPatch<ApiResponse<DeliveryEvent>>(`${base(id)}/events/${encodeURIComponent(event)}`,input,token));invalidateApiCache(`${base(id)}/events`);invalidateApiCache(`/trips/${encodeURIComponent(saved.trip_id)}/events`);return saved;};
export const deliveryLabel=(type:string)=>({DEMO_SIMULATED_GPS:'Simulated GPS position',DEMO_POD_SUBMISSION:'POD workflow preview',INCIDENT_REPORTED:'Incident reported',WAREHOUSE_ARRIVAL:'Arrived at warehouse',LOADING_STARTED:'Started loading',LOADING_FINISHED:'Finished loading',WAREHOUSE_DEPARTURE:'Departed warehouse',IN_TRANSIT:'On the Way',ARRIVED:'Arrived at delivery stop',UNLOADING_STARTED:'Started unloading',PARTIAL_UNLOAD:'Historical cargo quantity record',UNLOADING_FINISHED:'Finished unloading',POD_SUBMITTED:'POD submitted',STOP_DEPARTURE:'Delivery completed',ASSIGNMENT_COMPLETED:'Assigned delivery completed',CUSTOM_STATUS:'Driver update',PHOTO_UPLOADED:'Photo uploaded',BACKLOAD_REPORTED:'Backload reported',DEMURRAGE_REPORTED:'Demurrage reported',OFFLOAD_REPORTED:'Offload reported'}[type]??type.replaceAll('_',' ').toLowerCase());
export function deliveryActorLabel(event:Pick<DeliveryEvent,'actor'|'delivery_metadata'>){const snapshot=event.delivery_metadata?.actor_snapshot;const name=snapshot?.name?.trim()||[event.actor?.first_name,event.actor?.last_name].filter(Boolean).join(' ').trim()||'Unknown';return name+(snapshot?.crew_role?` (${snapshot.crew_role==='HELPER'?'Helper':'Driver'})`:'');}
export const deliveryEventLabel=(event:Pick<DeliveryEvent,'event_type'|'delivery_metadata'>)=>event.event_type==='POD_SUBMITTED'&&event.delivery_metadata?.replaces_receipt_id?'POD Resubmitted':event.event_type==='POD_REJECTED'?'POD Rejected':event.event_type==='POD_APPROVED'?'POD Approved':event.delivery_metadata?.title||deliveryLabel(event.event_type);
export const verificationLabel=(method:string)=>({GPS_VERIFIED:'GPS verified',PHOTO_PENDING_REVIEW:'Photo supported · Pending review',PHOTO_CONFIRMED:'Photo confirmed by Admin',PHOTO_FLAGGED:'Photo flagged by Admin',RECORDED:'Driver recorded'}[method]??'Saved record');
export const phTime=(value:string)=>!value||!Number.isFinite(Date.parse(value))?'Not recorded':new Date(value).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
export function deliveryStopPodState(workspace:DeliveryWorkspace,stopId:string){
 const stop=workspace.stops.find(s=>s.id===stopId),documents=(workspace.pods??[]).filter(p=>p.trip_stop_id===stopId);
 const expected=[...new Set(workspace.cargo.filter(c=>c.line.trip_stop_id===stopId).map(c=>(c.line.dr_number||stop?.dr_number||'').trim()).filter(Boolean))];
 if(!expected.length&&stop?.dr_number?.trim())expected.push(stop.dr_number.trim());
 const matches=(dr:string)=>documents.filter(p=>p.dr_number?.trim()===dr);
 return {uploaded:workspace.milestones.some(event=>event.event_type==='POD_SUBMITTED'&&event.trip_stop_id===stopId),approved:expected.length?expected.every(dr=>matches(dr).some(p=>p.approved)):documents.some(p=>p.approved)};
}
export type PodReplacementRequest={receipt_id:string;reason:string;requested_at:string;resolved_by:string|null};
export function podReplacementRequests(workspace:DeliveryWorkspace){return workspace.milestones.flatMap(event=>{const request=event.delivery_metadata?.pod_replacement_request;return request&&!request.resolved_by?[{...request,stop_id:event.trip_stop_id}]:[];});}
export type DeliveryNextAction={type:string;label:string;stop_id:string|null;blocked?:boolean;reason?:string;replaces_receipt_id?:string};
/** Merge only an acknowledged server event while the full workspace refresh runs. */
export function withConfirmedDeliveryEvent(workspace:DeliveryWorkspace,event:DeliveryEvent){
 if(event.assignment_id!==workspace.assignment.id||event.trip_id!==workspace.assignment.trip_id||!Number.isFinite(Date.parse(event.event_time)))return workspace;
 if(!['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','IN_TRANSIT',...DELIVERY_STOP_STEPS.map(step=>step.type),'ASSIGNMENT_COMPLETED'].includes(event.event_type))return workspace;
 const milestones=workspace.milestones.filter(row=>row.id!==event.id).map(row=>{const request=row.delivery_metadata?.pod_replacement_request;return event.event_type==='POD_SUBMITTED'&&request&&request.receipt_id===event.delivery_metadata.replaces_receipt_id?{...row,delivery_metadata:{...row.delivery_metadata,pod_replacement_request:{...request,resolved_by:event.id}}}:row;});
 milestones.push({id:event.id,event_type:event.event_type,event_time:event.event_time,trip_stop_id:event.trip_stop_id,verification_method:event.verification_method,delivery_metadata:event.delivery_metadata});
 return {...workspace,milestones:milestones.sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time))};
}
/** Replacement photos are review activity, not a rollback of physical progress. */
export function currentDeliveryMilestone(workspace:DeliveryWorkspace){
 const rows=[...workspace.milestones].sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time));
 const completed=rows.find(event=>event.event_type==='ASSIGNMENT_COMPLETED');if(completed)return completed;
 return rows.filter(event=>event.event_type!=='POD_SUBMITTED'||!rows.some(later=>later.trip_stop_id===event.trip_stop_id&&['UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'].includes(later.event_type))).at(-1);
}
export function nextDeliveryDestination(workspace:DeliveryWorkspace){return [...workspace.stops].sort((a,b)=>a.stop_sequence-b.stop_sequence||a.id.localeCompare(b.id)).find(stop=>!workspace.milestones.some(event=>event.event_type==='STOP_DEPARTURE'&&event.trip_stop_id===stop.id));}
export function nextDeliveryAction(workspace:DeliveryWorkspace,stopId:string|null,preferredReceipt?:string):DeliveryNextAction|null{
 const saved=(type:string,stop:string|null=null)=>workspace.milestones.some(e=>e.event_type===type&&e.trip_stop_id===stop);
 const requests=podReplacementRequests(workspace),request=requests.find(r=>r.receipt_id===preferredReceipt)??requests[0];
 if(request)return {type:'POD_SUBMITTED',label:'Upload POD — Admin Request',stop_id:request.stop_id,reason:request.reason,replaces_receipt_id:request.receipt_id};
 if(saved('ASSIGNMENT_COMPLETED'))return null;
 for(const [type,label] of [['WAREHOUSE_ARRIVAL','Arrived at Warehouse'],['LOADING_STARTED','Start Loading'],['LOADING_FINISHED','Finish Loading'],['WAREHOUSE_DEPARTURE','Depart Warehouse']])if(!saved(type))return {type,label,stop_id:null};
 if(workspace.stops.length&&workspace.stops.every(s=>saved('STOP_DEPARTURE',s.id)))return null;
 const destination=nextDeliveryDestination(workspace);
 if(!destination)return null;
 stopId=destination.id;
 // Legacy stops with arrival already saved must never be sent back to travel.
 if(!saved('IN_TRANSIT',stopId)&&!saved('ARRIVED',stopId))return {type:'IN_TRANSIT',label:'On the Way',stop_id:stopId};
 for(const {type,title:label} of DELIVERY_STOP_STEPS)if(!saved(type,stopId)){
  return {type,label,stop_id:stopId};
 }
 return null;
}
export async function freshDeliveryGps():Promise<DeliveryInput['gps']>{
 if(!navigator.geolocation)return undefined;
 try{return await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{const c=p.coords;if(!Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>10000||!Number.isFinite(p.timestamp)||Math.abs(Date.now()-p.timestamp)>120000){reject(Error('Location unavailable or stale.'));return;}resolve({latitude:c.latitude,longitude:c.longitude,accuracy_meters:c.accuracy,captured_at:new Date(p.timestamp).toISOString()});},reject,{enableHighAccuracy:true,maximumAge:0,timeout:12000}));}catch{return undefined;}
}
export const deliveryRequiresGps=(type:string)=>type==='WAREHOUSE_ARRIVAL'||type==='ARRIVED';

const recentGps=new Map<string,NonNullable<DeliveryInput['gps']>>();
export function cacheDeliveryGps(assignment:string,gps:NonNullable<DeliveryInput['gps']>){const old=recentGps.get(assignment);if(old&&old.captured_at===gps.captured_at&&old.latitude===gps.latitude&&old.longitude===gps.longitude&&old.accuracy_meters===gps.accuracy_meters)return;recentGps.set(assignment,gps);window.dispatchEvent(new CustomEvent('delivery-gps',{detail:{assignment}}));}
export function availableDeliveryGps(assignment:string){const gps=recentGps.get(assignment);return gps&&Math.abs(Date.now()-Date.parse(gps.captured_at))<=120000?gps:undefined;}

export function clearDeliveryGps(assignment:string){recentGps.delete(assignment);}
