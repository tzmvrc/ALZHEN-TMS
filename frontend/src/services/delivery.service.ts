import {DELIVERY_STOP_STEPS} from './delivery-workflow';
import {apiGet,apiGetCached,invalidateApiCache,apiPost,apiUpload,apiPatch,type ApiResponse} from './api.service';
export type DeliveryEvent={demonstration?:boolean;id:string;trip_id:string;assignment_id:string|null;trip_stop_id:string|null;event_type:string;event_time:string;created_at:string;device_time:string|null;recorded_by:string;latitude:number|null;longitude:number|null;accuracy_meters:number|null;verification_method:string;notes:string|null;delivery_metadata:{title?:string;dr_number?:string;related_dr_numbers?:string[];report_id?:string;report_type?:string;distance_meters?:number;geofence_meters?:number};delivery_version:number;actor?:{first_name:string;last_name:string};attachments:Array<{id:string;file_name:string;kind:string;url?:string|null;mime_type?:string;ocr_text?:string|null;ocr_confidence?:number|null;pod_review_status?:string}>};
export type DeliveryAssignment={id:string;trip_id:string;unassigned_at:string|null;truck:{plate_number:string;truck_type:string;capacity_cbm?:number};driver?:{first_name:string;last_name:string};company?:{name:string};trip:{dispatch_number:string;trip_reference?:string|null;status:string;loading_date:string;estimated_delivery_date:string}};
export type DeliveryStop={id:string;stop_sequence:number;dr_number:string|null;delivery_status:string;remarks?:string|null;store:{id:string;name:string;address:string;city?:string|null;province?:string|null;latitude:number|null;longitude:number|null;location_verified:boolean;arrival_radius_meters:number}|null};
export type DeliveryCargo={id:string;quantity:string|number;allocated_cbm:string|number;delivered:number;remaining:number;line:{id:string;trip_stop_id:string;dr_number:string;customer_model:string;product?:{model_code:string;sku:string}}};
export type DeliveryWorkspace={assignment:DeliveryAssignment;warehouse:{id:string;name:string;latitude:number;longitude:number;location_verified:boolean;arrival_radius_meters:number}|null;stops:DeliveryStop[];cargo:DeliveryCargo[];pods?:Array<{trip_stop_id:string;dr_number:string|null;approved:boolean;pod_status:string;pod_submitted_at:string|null}>;milestones:Array<{id:string;event_type:string;trip_stop_id:string|null;event_time:string;verification_method:string}>};
export type DeliveryInput={type:string;stop_id?:string|null;device_time:string;remarks?:string;title?:string;gps?:{latitude:number;longitude:number;accuracy_meters:number;captured_at:string};attachments?:string[];quantities?:Array<{allocation_id:string;quantity:string|number}>;dr_number?:string;related_dr_numbers?:string[];ocr_text?:string;ocr_confidence?:number|null;waiting_minutes?:number};
export type EventDetails={attachments:Array<{id:string;file_name:string;url:string;mime_type?:string;kind:string;dr_number:string;ocr_text:string;ocr_confidence:number|null;pod_review_status:string}>;audit:Array<{id:string;action:string;created_at:string;old_data:Record<string,unknown>;new_data:Record<string,unknown>;actor?:{first_name:string;last_name:string}}>;quantities:Array<{id:string;quantity:number;allocation:{line:{customer_model:string;dr_number:string}}}>};
const base=(id:string)=>`/delivery/assignments/${encodeURIComponent(id)}`;
async function data<T>(request:Promise<ApiResponse<T>>){const r=await request;if(!r.success||!r.data)throw Error(r.message??'The saved result could not be confirmed.');return r.data;}
export const listDeliveryAssignments=(token:string,after?:string)=>data(apiGet<ApiResponse<{rows:DeliveryAssignment[];next:string|null}>>(`/delivery/assignments${after?`?after=${encodeURIComponent(after)}`:''}`,token));
export const readDeliveryWorkspace=(token:string,id:string)=>data(apiGet<ApiResponse<DeliveryWorkspace>>(base(id),token));
export async function readCurrentDeliveryWorkspace(token:string,fresh=false){if(fresh)invalidateApiCache('/delivery/current');const result=await apiGetCached<ApiResponse<DeliveryWorkspace|null>>('/delivery/current',token,1000);if(!result.success)throw Error(result.message??'Your assigned trip could not load. Retry loading.');return result.data??null;}
export const readDeliveryEvents=(token:string,id:string,cursor?:string,reportsOnly=false,includeEvidence=false)=>data(apiGet<ApiResponse<{rows:DeliveryEvent[];next:string|null}>>(`${base(id)}/events?${cursor?`cursor=${encodeURIComponent(cursor)}&`:''}${reportsOnly?'scope=reports&':''}${includeEvidence?'evidence=1':''}`,token));
export const readDeliveryEventDetails=(token:string,id:string,event:string,version?:number)=>data(apiGetCached<ApiResponse<EventDetails>>(`${base(id)}/events/${encodeURIComponent(event)}${version!==undefined?`?version=${version}`:''}`,token,60000));
export const saveDeliveryEvent=(token:string,id:string,key:string,input:DeliveryInput)=>data(apiPost<ApiResponse<DeliveryEvent>>(`${base(id)}/events`,input,token,undefined,30000,{'Idempotency-Key':key}));
export const uploadDeliveryPhoto=(token:string,id:string,key:string,stop:string|null,file:File)=>data(apiUpload<ApiResponse<{id:string;state:string}>>(`${base(id)}/evidence`,file,file.type,file.name,token,{'Idempotency-Key':key,...(stop?{'X-Trip-Stop-Id':stop}:{})}));
export const reviewDeliveryEvent=async(token:string,id:string,event:string,input:{version:number;action:string;reason:string;time?:string})=>{const saved=await data(apiPatch<ApiResponse<DeliveryEvent>>(`${base(id)}/events/${encodeURIComponent(event)}`,input,token));invalidateApiCache(`${base(id)}/events`);invalidateApiCache(`/trips/${encodeURIComponent(saved.trip_id)}/events`);return saved;};
export const deliveryLabel=(type:string)=>({DEMO_SIMULATED_GPS:'Simulated GPS position',DEMO_POD_SUBMISSION:'POD workflow preview',INCIDENT_REPORTED:'Incident reported',WAREHOUSE_ARRIVAL:'Arrived at warehouse',LOADING_STARTED:'Started loading',LOADING_FINISHED:'Finished loading',WAREHOUSE_DEPARTURE:'Departed warehouse',IN_TRANSIT:'In transit',ARRIVED:'Arrived at delivery stop',UNLOADING_STARTED:'Started unloading',PARTIAL_UNLOAD:'Historical cargo quantity record',UNLOADING_FINISHED:'Finished unloading',POD_SUBMITTED:'POD submitted',STOP_DEPARTURE:'Delivery completed',ASSIGNMENT_COMPLETED:'Assigned delivery completed',CUSTOM_STATUS:'Driver update',PHOTO_UPLOADED:'Photo uploaded',BACKLOAD_REPORTED:'Backload reported',DEMURRAGE_REPORTED:'Demurrage reported',OFFLOAD_REPORTED:'Offload reported'}[type]??type.replaceAll('_',' ').toLowerCase());
export const verificationLabel=(method:string)=>({GPS_VERIFIED:'GPS verified',PHOTO_PENDING_REVIEW:'Photo supported · Pending review',PHOTO_CONFIRMED:'Photo confirmed by Admin',PHOTO_FLAGGED:'Photo flagged by Admin',RECORDED:'Driver recorded'}[method]??'Saved record');
export const phTime=(value:string)=>!value||!Number.isFinite(Date.parse(value))?'Not recorded':new Date(value).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
export function deliveryStopPodState(workspace:DeliveryWorkspace,stopId:string){
 const stop=workspace.stops.find(s=>s.id===stopId),documents=(workspace.pods??[]).filter(p=>p.trip_stop_id===stopId);
 const expected=[...new Set(workspace.cargo.filter(c=>c.line.trip_stop_id===stopId).map(c=>(c.line.dr_number||stop?.dr_number||'').trim()).filter(Boolean))];
 if(!expected.length&&stop?.dr_number?.trim())expected.push(stop.dr_number.trim());
 const matches=(dr:string)=>documents.filter(p=>p.dr_number?.trim()===dr);
 return {uploaded:expected.length?expected.every(dr=>matches(dr).some(p=>p.pod_status!=='REJECTED')):documents.some(p=>p.pod_status!=='REJECTED'),approved:expected.length?expected.every(dr=>matches(dr).some(p=>p.approved)):documents.some(p=>p.approved)};
}
export type DeliveryNextAction={type:string;label:string;stop_id:string|null;blocked?:boolean;reason?:string};
export function nextDeliveryAction(workspace:DeliveryWorkspace,stopId:string|null):DeliveryNextAction|null{
 const saved=(type:string,stop:string|null=null)=>workspace.milestones.some(e=>e.event_type===type&&e.trip_stop_id===stop);
 if(saved('ASSIGNMENT_COMPLETED'))return null;
 for(const [type,label] of [['WAREHOUSE_ARRIVAL','Arrived at Warehouse'],['LOADING_STARTED','Start Loading'],['LOADING_FINISHED','Finish Loading'],['WAREHOUSE_DEPARTURE','Depart Warehouse']])if(!saved(type))return {type,label,stop_id:null};
 if(workspace.stops.length&&workspace.stops.every(s=>saved('STOP_DEPARTURE',s.id)))return null;
 if(!stopId)return null;
 const pod=deliveryStopPodState(workspace,stopId);
 for(const {type,title:label} of DELIVERY_STOP_STEPS)if(!saved(type,stopId)||(type==='POD_SUBMITTED'&&!pod.uploaded)){
  if(type==='STOP_DEPARTURE'&&!pod.approved)return {type,label,stop_id:stopId,blocked:true,reason:'Waiting for Admin approval of all required POD receipts before completing this delivery.'};
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
