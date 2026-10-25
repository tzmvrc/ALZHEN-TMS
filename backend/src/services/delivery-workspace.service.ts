import {createHash} from 'node:crypto';
import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {validatePodDocument} from './pod-document.logic.js';
import {collaborationEvents} from './collaboration-events.js';

export type DeliveryActor={id:string;role:string};
export async function deliveryNotification(actor:DeliveryActor,id:string){
 if(!['ADMIN','STAFF'].includes(actor.role)||!isValidUuid(id))throw new ApiError('Delivery access denied.',403);
 const result=await db.from('trip_events').select('id,trip_id,trip_stop_id,assignment_id,event_type,event_time,created_at,notes,delivery_metadata,delivery_version').eq('id',id).maybeSingle();
 if(result.error)failure(result.error);if(!result.data)throw new ApiError('Event no longer available.',404);
 return result.data;
}
type Row=Record<string,any>;
const ids=(value:unknown)=>typeof value==='string'&&isValidUuid(value);
const management=(actor:DeliveryActor)=>['ADMIN','STAFF'].includes(actor.role);
function failure(error:any){
 const expected=['22023','23514','23505','P0001','40001','42501'].includes(error?.code);
 throw new ApiError(expected?error.message:'Delivery data could not be confirmed. Your draft is preserved.',error?.code==='42501'?403:error?.code==='40001'||error?.code==='23505'?409:expected?422:503,error?.code==='P0001'?'ARRIVAL_EVIDENCE_REQUIRED':'DELIVERY_UNAVAILABLE');
}
async function rows(table:string,fields:string,field:string,value:string){
 const result=await db.from(table).select(fields).eq(field,value).order('id').limit(501);
 if(result.error)failure(result.error);if((result.data?.length??0)>500)throw new ApiError('This assignment exceeds the detail limit. Contact dispatch to split the assignment.',409);
 return (result.data??[]) as unknown as Row[];
}
export async function deliveryAssignment(actor:DeliveryActor,id:string,write=false){
 if(!ids(id)||!ids(actor.id)||!['ADMIN','STAFF','TRUCKER'].includes(actor.role))throw new ApiError('Delivery access denied.',403);
 const {data,error}=await db.from('trip_truck_assignments').select('*,driver:drivers(id,profile_id,first_name,last_name),truck:trucks(id,plate_number,truck_type,capacity_cbm),company:trucking_companies(id,name),trip:trips(id,dispatch_number,trip_reference,status,warehouse_id,loading_date,estimated_delivery_date,archived_at)').eq('id',id).maybeSingle();
 if(error)failure(error);
 if(!data||(!management(actor)&&data.driver?.profile_id!==actor.id)||(write&&(actor.role!=='TRUCKER'||data.unassigned_at||data.trip?.archived_at||data.trip?.status==='CANCELLED')))throw new ApiError('This assignment is not available to your account.',403);
 return data as Row;
}
export async function deliveryAssignments(actor:DeliveryActor,after?:string){
 if(actor.role!=='TRUCKER')throw new ApiError('A trucker account is required.',403);
 let query=db.from('trip_truck_assignments').select('id,trip_id,assigned_at,unassigned_at,truck:trucks(plate_number,truck_type),driver:drivers!inner(profile_id),trip:trips!inner(dispatch_number,status,loading_date,estimated_delivery_date,archived_at)').eq('driver.profile_id',actor.id).is('unassigned_at',null).is('trip.archived_at',null).neq('trip.status','CANCELLED').order('id').limit(21);
 if(after){if(!ids(after))throw new ApiError('Invalid page cursor.',400);query=query.gt('id',after);}
 const {data,error}=await query;if(error)failure(error);const page=(data??[]).slice(0,20);
 return {rows:page,next:(data?.length??0)>20?page.at(-1)?.id:null};
}
export async function deliveryWorkspace(actor:DeliveryActor,id:string){
 const assignment=await deliveryAssignment(actor,id);
 const [stops,responsibilities,cargo,warehouse,events]=await Promise.all([
  rows('trip_stops','*,store:customer_stores(id,name,address,city,province,latitude,longitude,location_verified,arrival_radius_meters)','trip_id',assignment.trip_id),
  rows('trip_assignment_stops','id,trip_stop_id,progress','assignment_id',id),
  rows('trip_cargo_allocations','id,quantity,allocated_cbm,line:trip_line_items(id,trip_stop_id,dr_number,customer_model,product:products(model_code,sku))','assignment_id',id),
  db.from('warehouses').select('id,name,address,latitude,longitude,location_verified,arrival_radius_meters').eq('id',assignment.trip.warehouse_id).maybeSingle(),
  db.from('trip_events').select('id,event_type,event_time,trip_stop_id,verification_method').eq('assignment_id',id).in('event_type',['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED']).order('event_time').limit(1001),
 ]);
 if(warehouse.error||events.error)failure(warehouse.error??events.error);
 if((events.data?.length??0)>1000)throw new ApiError('Too many milestones in this assignment.',409);
 const delivered=cargo.length?await db.from('trip_delivery_quantities').select('allocation_id,quantity').in('allocation_id',cargo.map(c=>c.id)).limit(10001):{data:[],error:null};
 if(delivered.error)failure(delivered.error);if((delivered.data?.length??0)>10000)throw new ApiError('Quantity history exceeds its read limit.',409);
 const totals=new Map<string,number>();for(const item of delivered.data??[])totals.set(item.allocation_id,(totals.get(item.allocation_id)??0)+Number(item.quantity));
 return {assignment,warehouse:warehouse.data,stops:stops.filter(s=>!s.archived_at&&(assignment.stop_scope==='ALL'||responsibilities.some(r=>r.trip_stop_id===s.id))).sort((a,b)=>a.stop_sequence-b.stop_sequence),cargo:cargo.map(c=>({...c,delivered:totals.get(c.id)??0,remaining:Math.max(0,Number(c.quantity)-(totals.get(c.id)??0))})),milestones:events.data??[]};
}
export async function deliveryEvents(actor:DeliveryActor,id:string,cursor?:string,reportsOnly=false,includeEvidence=false){
 const assignment=await deliveryAssignment(actor,id);
 let query=db.from('trip_events').select('id,trip_id,assignment_id,trip_stop_id,event_type,event_time,created_at,device_time,recorded_by,latitude,longitude,accuracy_meters,verification_method,notes,delivery_metadata,delivery_version,actor:profiles!trip_events_recorded_by_fkey(first_name,last_name)').eq('trip_id',assignment.trip_id).or(`assignment_id.eq.${id},and(assignment_id.is.null,notes.ilike.*[assignment:${id}]*)`).order('event_time',{ascending:false}).order('id',{ascending:false}).limit(7);
 if(reportsOnly)query=query.in('event_type',['POD_SUBMITTED','PHOTO_UPLOADED','BACKLOAD_REPORTED','OFFLOAD_REPORTED','LOADING_STARTED','LOADING_FINISHED','UNLOADING_STARTED','PARTIAL_UNLOAD','UNLOADING_FINISHED']);
 if(cursor){const [time,eventId]=cursor.split('|');if(!time||!Number.isFinite(Date.parse(time))||!ids(eventId))throw new ApiError('Invalid event cursor.',400);query=query.or(`event_time.lt.${new Date(time).toISOString()},and(event_time.eq.${new Date(time).toISOString()},id.lt.${eventId})`);}
 const {data,error}=await query;if(error)failure(error);const page=(data??[]).slice(0,6);
 const attachments=page.length?await db.from('trip_images').select('id,delivery_event_id,file_name,kind,storage_path,mime_type,ocr_text,ocr_confidence,pod_review_status').in('delivery_event_id',page.map(e=>e.id)).eq('delivery_upload_state','READY').limit(37):{data:[],error:null};
 if(attachments.error)failure(attachments.error);
 const showEvidence=includeEvidence&&management(actor),files=attachments.data??[];
 const signed=showEvidence&&files.length?await db.storage.from('trip-images').createSignedUrls(files.map(f=>f.storage_path),600):null;
 // A link failure must not hide operational history. The existing detail viewer
 // can retry an individual attachment; Storage paths never leave this service.
 const safeFiles=files.map(({storage_path,ocr_text,ocr_confidence,mime_type,pod_review_status,...file},index)=>({...file,...(showEvidence?{url:signed?.data?.[index]?.signedUrl??null,mime_type,ocr_text,ocr_confidence,pod_review_status}:{})}));
 return {rows:page.map(e=>({...e,delivery_metadata:e.delivery_metadata??{},demonstration:/\[ALZHEN_.*DEMO|SIMULATED|^DEMO_/.test(`${e.notes??''} ${e.event_type}`),attachments:safeFiles.filter(a=>a.delivery_event_id===e.id)})),next:(data?.length??0)>6?`${page.at(-1)!.event_time}|${page.at(-1)!.id}`:null};
}
export async function deliveryLocation(actor:DeliveryActor,id:string,historyBefore?:string){
 await deliveryAssignment(actor,id);
 if(historyBefore){if(!Number.isFinite(Date.parse(historyBefore)))throw new ApiError('Invalid GPS history cursor.',400);const result=await db.from('trip_tracking_history').select('id,latitude,longitude,accuracy_meters,captured_at,received_at').eq('assignment_id',id).lt('captured_at',new Date(historyBefore).toISOString()).order('captured_at',{ascending:false}).limit(51);if(result.error)failure(result.error);const page=(result.data??[]).slice(0,50);return {rows:page,next:(result.data?.length??0)>50?page.at(-1)?.captured_at:null};}
 const result=await db.from('trip_tracking_locations').select('latitude,longitude,accuracy_meters,captured_at,received_at').eq('assignment_id',id).maybeSingle();if(result.error)failure(result.error);const p=result.data;return {position:p&&p.latitude!=null&&p.longitude!=null&&p.captured_at?{latitude:Number(p.latitude),longitude:Number(p.longitude),accuracyMeters:Number(p.accuracy_meters),capturedAt:p.captured_at,simulated:false}:null};
}
function announce(actor:DeliveryActor,event:Row){collaborationEvents.emit('commit',{source:'trip_events',recordId:event.id,tripId:event.trip_id,stopId:event.trip_stop_id??undefined,version:null,fields:[],actorId:actor.id,eventId:`delivery:${event.id}:${event.delivery_version??0}`,operation:'UPDATE'});}
export async function submitDelivery(actor:DeliveryActor,id:string,key:string,input:unknown){
 if(actor.role!=='TRUCKER'||!ids(id)||!ids(key)||!input||typeof input!=='object'||Array.isArray(input))throw new ApiError('Invalid delivery submission.',400);
 const body=input as Row;
 const allowed=['type','stop_id','device_time','remarks','title','gps','attachments','quantities','dr_number','ocr_text','ocr_confidence'];
 if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.type!=='string'||body.stop_id!=null&&!ids(body.stop_id)||body.device_time!=null&&(typeof body.device_time!=='string'||!Number.isFinite(Date.parse(body.device_time)))||body.remarks!=null&&(typeof body.remarks!=='string'||body.remarks.length>4000)||body.title!=null&&(typeof body.title!=='string'||body.title.length>120)||body.ocr_text!=null&&(typeof body.ocr_text!=='string'||body.ocr_text.length>100000)||body.dr_number!=null&&(typeof body.dr_number!=='string'||body.dr_number.length>100))throw new ApiError('Check the submission fields and text lengths.',400);
 if(body.attachments!=null&&(!Array.isArray(body.attachments)||body.attachments.length>6||body.attachments.some((v:unknown)=>!ids(v))||new Set(body.attachments).size!==body.attachments.length))throw new ApiError('Choose up to six distinct uploaded attachments.',400);
 if(body.quantities!=null&&(!Array.isArray(body.quantities)||body.quantities.length>100||body.quantities.some((v:Row)=>!v||!ids(v.allocation_id)||!/^\d+(\.\d{1,6})?$/.test(String(v.quantity))||Number(v.quantity)<=0)))throw new ApiError('Enter positive unloaded quantities with up to six decimal places.',400);
 if(body.gps!=null&&(typeof body.gps!=='object'||!['latitude','longitude','accuracy_meters'].every(k=>typeof body.gps[k]==='number'&&Number.isFinite(body.gps[k]))||!Number.isFinite(Date.parse(body.gps.captured_at))))throw new ApiError('Invalid GPS capture.',400);
 if(body.ocr_confidence!=null&&(typeof body.ocr_confidence!=='number'||!Number.isFinite(body.ocr_confidence)||body.ocr_confidence<0||body.ocr_confidence>100))throw new ApiError('Invalid OCR confidence.',400);
 const {data,error}=await db.rpc('submit_delivery_event_v1',{p_actor:actor.id,p_assignment:id,p_key:key,p_input:input});if(error)failure(error);announce(actor,data);return data;
}
export async function reviewDelivery(actor:DeliveryActor,id:string,eventId:string,input:Row){
 await deliveryAssignment(actor,id);if(actor.role!=='ADMIN')throw new ApiError('Only Admin can review delivery evidence or correct timestamps.',403);
 const target=await db.from('trip_events').select('id').eq('id',eventId).eq('assignment_id',id).maybeSingle();if(target.error)failure(target.error);if(!target.data)throw new ApiError('Event not found for this assignment.',404);
 const {data,error}=await db.rpc('review_delivery_event_v1',{p_actor:actor.id,p_event:eventId,p_version:input.version,p_action:input.action,p_reason:input.reason,p_time:input.time??null});if(error)failure(error);announce(actor,data);return data;
}
export async function setDeliveryGeofence(actor:DeliveryActor,kind:string,location:string,radius:unknown){
 if(actor.role!=='ADMIN'||!['warehouses','customer_stores'].includes(kind)||!ids(location)||!Number.isInteger(radius)||Number(radius)<100||Number(radius)>5000)throw new ApiError('Admin may set an arrival radius from 100 to 5000 meters.',400);
 const result=await db.rpc('set_delivery_geofence_v1',{p_actor:actor.id,p_kind:kind,p_location:location,p_radius:radius});if(result.error)failure(result.error);return result.data;
}
export async function deliveryEventDetails(actor:DeliveryActor,id:string,eventId:string){
 const assignment=await deliveryAssignment(actor,id);
 const event=await db.from('trip_events').select('id,trip_id').eq('id',eventId).eq('trip_id',assignment.trip_id).or(`assignment_id.eq.${id},and(assignment_id.is.null,notes.ilike.*[assignment:${id}]*)`).maybeSingle();if(event.error)failure(event.error);if(!event.data)throw new ApiError('Delivery event not found.',404);
 const [images,audit,quantities]=await Promise.all([
  db.from('trip_images').select('id,storage_path,file_name,mime_type,kind,dr_number,ocr_text,ocr_confidence,pod_review_status').eq('delivery_event_id',eventId).eq('delivery_upload_state','READY').limit(6),
  db.from('audit_logs').select('id,action,created_at,old_data,new_data,actor:profiles!audit_logs_user_id_fkey(first_name,last_name)').eq('entity_type','trip_events').eq('entity_id',eventId).order('created_at',{ascending:false}).limit(50),
  db.from('trip_delivery_quantities').select('id,quantity,allocation:trip_cargo_allocations(trip_line_item_id,line:trip_line_items(customer_model,dr_number))').eq('event_id',eventId).limit(100),
 ]);if(images.error||audit.error||quantities.error)failure(images.error??audit.error??quantities.error);
 const attachments=await Promise.all((images.data??[]).map(async({storage_path,...image})=>{const link=await db.storage.from('trip-images').createSignedUrl(storage_path,600);if(link.error)throw new ApiError('Evidence image could not load. Retry to refresh its secure link.',503);return {...image,url:link.data.signedUrl};}));
 return {attachments,audit:audit.data??[],quantities:quantities.data??[]};
}
export async function uploadDeliveryEvidence(actor:DeliveryActor,id:string,key:string,stop:string|null,bytes:Buffer,name:string,mime:string){
 const a=await deliveryAssignment(actor,id,true);
 if(!ids(key))throw new ApiError('Invalid upload identifier.',400);
 validatePodDocument(bytes,mime,name,process.env.POD_PDF_ENABLED==='true');
 if(stop){if(!ids(stop))throw new ApiError('Invalid delivery stop.',400);const st=await db.from('trip_stops').select('id').eq('id',stop).eq('trip_id',a.trip_id).is('archived_at',null).maybeSingle();if(st.error)failure(st.error);if(!st.data)throw new ApiError('Stop not available.',403);if(a.stop_scope!=='ALL'){const r=await db.from('trip_assignment_stops').select('id').eq('assignment_id',id).eq('trip_stop_id',stop).maybeSingle();if(r.error)failure(r.error);if(!r.data)throw new ApiError('Stop not assigned to your truck.',403);}}
 const hash=createHash('sha256').update(bytes).digest('hex'),fileName=name.replace(/[\0\r\n]/g,'').slice(0,180)||'Delivery evidence';
 let {data:row,error}=await db.from('trip_images').select('*').eq('uploaded_by',actor.id).eq('delivery_upload_key',key).maybeSingle();if(error)failure(error);
 if(!row){const created=await db.from('trip_images').insert({trip_id:a.trip_id,assignment_id:id,trip_stop_id:stop,uploaded_by:actor.id,delivery_upload_key:key,delivery_upload_state:'PENDING',file_sha256:hash,mime_type:mime,storage_path:`trips/${a.trip_id}/delivery/${actor.id}/${key}`,file_name:fileName,kind:'photo'}).select('*').single();if(created.error){if(created.error.code!=='23505')failure(created.error);const raced=await db.from('trip_images').select('*').eq('uploaded_by',actor.id).eq('delivery_upload_key',key).single();if(raced.error)failure(raced.error);row=raced.data;}else row=created.data;}
 if(!row||row.assignment_id!==id||row.trip_stop_id!==stop||row.file_sha256!==hash)throw new ApiError('Upload identifier was reused for a different photo or assignment.',409);
 if(row.delivery_upload_state!=='READY'){
  const upload=await db.storage.from('trip-images').upload(row.storage_path,bytes,{contentType:mime,upsert:false});
  if(upload.error){const existing=await db.storage.from('trip-images').download(row.storage_path);if(existing.error||!existing.data||createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==hash)throw new ApiError('Photo upload is pending. Keep this draft and retry.',503);}
  const saved=await db.from('trip_images').update({delivery_upload_state:'READY'}).eq('id',row.id).eq('file_sha256',hash);if(saved.error)failure(saved.error);
 }
 return {id:row.id,file_name:row.file_name,state:'READY'};
}
