import {linkPodSerialAttachments} from './receipt-fields.service';
import {prepareDeliveryPhoto} from './delivery-photo';
import {ApiError} from './api.service';
import {readDeliverySubmission,saveDeliveryEvent,uploadDeliveryPhoto,type DeliveryInput,type DeliveryEvent} from './delivery.service';
export type OutboxRecord={key:string;owner:string;assignment:string;input:DeliveryInput;files:Array<{key:string;file:File;uploadedId?:string;pageId?:string}>;created:number;state:'PENDING'|'NEEDS_ATTENTION';error?:string;errorCode?:string;needsEvidence?:boolean;needsGps?:boolean};
let database:Promise<IDBDatabase>|null=null;
function open(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('alzhen-delivery-outbox-v1',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('submissions',{keyPath:'key'});store.createIndex('owner','owner');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(Error('This browser could not retain your draft. Keep the photo on your phone and retry online.'));};});}
async function transact<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>){const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('submissions',mode),request=operation(tx.objectStore('submissions'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(Error('Draft storage is full or unavailable. Keep the original photo and retry.'));tx.onabort=()=>reject(Error('Draft was not saved on this device. Keep the form open and retry.'));});}
export const readDeliveryOutbox=(owner:string)=>transact('readonly',s=>s.index('owner').getAll(owner)) as Promise<OutboxRecord[]>;
const put=(record:OutboxRecord)=>transact('readwrite',s=>s.put(record));
export async function queueDelivery(record:OutboxRecord,supersedes?:string){
 const pending=await readDeliveryOutbox(record.owner);
 const retained=pending.filter(row=>row.key!==supersedes);
 const size=retained.reduce((n,r)=>n+r.files.reduce((sum,f)=>sum+f.file.size,0),0)+record.files.reduce((n,f)=>n+f.file.size,0);
 if(retained.length>=50||size>50*1024*1024)throw Error('Pending uploads have reached this device’s safe limit. Connect and sync them before adding more photos.');
 if(supersedes){
  const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('submissions','readwrite'),store=tx.objectStore('submissions'),read=store.get(supersedes);read.onsuccess=()=>{const old=read.result as OutboxRecord|undefined;if(!old||old.owner!==record.owner||old.assignment!==record.assignment||old.state!=='NEEDS_ATTENTION'||old.input.type!=='POD_SUBMITTED'){tx.abort();return;}store.put(record);store.delete(supersedes);};tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error('This saved POD changed. Keep your corrections and refresh its sync status before retrying.'));});
 }else await put(record);
 window.dispatchEvent(new Event('delivery-outbox-changed'));
}
export async function retryDeliveryDraft(owner:string,key:string){const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);if(record){await put({...record,state:'PENDING'});window.dispatchEvent(new Event('delivery-outbox-changed'));}}
export async function discardDeliveryDraft(owner:string,key:string){const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);if(record){await transact('readwrite',s=>s.delete(key));window.dispatchEvent(new Event('delivery-outbox-changed'));}}
export type DeliveryProgress={owner:string;key:string;phase:'UPLOADING'|'SAVING'|'CONFIRMED'|'FAILED'|'CANCELLED';completed:number;total:number};
const flights=new Map<string,{promise:Promise<void>;request:()=>void}>();
export async function flushDeliveryOutbox(owner:string,token:string,current:()=>boolean,onSaved:(event?:DeliveryEvent)=>void):Promise<void>{
 if(!navigator.onLine)return;
 const existing=flights.get(owner);
 if(existing){existing.request();return existing.promise;}
 let requested=true;
 const attempted=new Set<string>();
 const progress=(record:OutboxRecord,phase:DeliveryProgress['phase'],completed=0)=>window.dispatchEvent(new CustomEvent<DeliveryProgress>('delivery-submit-progress',{detail:{owner,key:record.key,phase,completed,total:record.files.length}}));
 const run=async()=>{const blocked=new Set<string>();while(requested&&current()&&navigator.onLine){requested=false;for(const record of (await readDeliveryOutbox(owner)).sort((a,b)=>a.created-b.created)){
  if(!current()||!navigator.onLine)break;
  // A rejected draft must not prevent a replacement (or another truck) syncing.
  if(record.state==='NEEDS_ATTENTION')continue;
  if(blocked.has(record.assignment)||attempted.has(record.key))continue;
  attempted.add(record.key);
  try{
   let completed=0;
   for(const file of record.files){if(!current())return;if(!file.uploadedId){progress(record,'UPLOADING',completed);const saved=await uploadDeliveryPhoto(token,record.assignment,file.key,record.input.stop_id??null,file.file);file.uploadedId=saved.id;await put(record);}completed++;progress(record,'UPLOADING',completed);}
   if(!current())return;if(record.input.type==='POD_SUBMITTED'&&record.input.ocr_text){const linked=linkPodSerialAttachments(record.input.ocr_text,record.files);if(linked!==record.input.ocr_text){record.input.ocr_text=linked;await put(record);}}progress(record,'SAVING',completed);
   const input={...record.input,attachments:[...(record.input.attachments??[]),...record.files.map(f=>f.uploadedId!)]};
   let savedEvent:DeliveryEvent|undefined;
   const confirm=async()=>{const saved=await readDeliverySubmission(token,record.assignment,record.key);if(!saved)return false;if(stablePayload(saved.delivery_payload)!==stablePayload(input))throw new ApiError('This saved update has different content. Contact dispatch before retrying.',409);savedEvent=saved;return true;};
   // Check an ambiguous prior attempt before writing again; preserve the original key.
   let confirmed=record.error?await confirm():false;
   if(!confirmed)try{savedEvent=await saveDeliveryEvent(token,record.assignment,record.key,input);}catch(error){
    const ambiguous=!(error instanceof ApiError)||error.status===408||error.status>=500;
    if(ambiguous)try{confirmed=await confirm();}catch{/* Keep the immutable pending draft when confirmation is unavailable. */}
    if(!confirmed)throw error;
   }
   await transact('readwrite',s=>s.delete(record.key));progress(record,'CONFIRMED',completed);onSaved(savedEvent);
  }catch(error){
   const permanent=error instanceof ApiError&&[400,403,404,409,413,415,422].includes(error.status);
   try{await put({...record,state:permanent?'NEEDS_ATTENTION':'PENDING',errorCode:error instanceof ApiError?error.code:undefined,needsGps:error instanceof ApiError&&error.code==='ARRIVAL_GPS_REQUIRED',needsEvidence:error instanceof ApiError&&error.code==='ARRIVAL_EVIDENCE_REQUIRED',error:error instanceof Error?error.message:'Submission awaits a connection.'});}finally{progress(record,'FAILED');}if(!permanent)blocked.add(record.assignment);
  }finally{if(!current())progress(record,'CANCELLED');window.dispatchEvent(new Event('delivery-outbox-changed'));}
 }}};
 const task=(async()=>{if(navigator.locks)await navigator.locks.request(`alzhen-delivery:${owner}`,{ifAvailable:true},lock=>lock?run():Promise.resolve());else await run();})();
 const flight={promise:task,request:()=>{requested=true;}};
 flights.set(owner,flight);try{await task;}finally{if(flights.get(owner)===flight)flights.delete(owner);}
}

function stablePayload(value:unknown):string{return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);}

/** Only a server-rejected arrival may be repaired; ambiguous/time-out payloads stay immutable. */
export async function addDraftArrivalEvidence(owner:string,key:string,file:File){
 const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);
 if(!record||record.state!=='NEEDS_ATTENTION'||!record.needsEvidence)throw Error('This draft cannot be changed safely. Retry the original submission.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||record.files.length>=6)throw Error('Choose one photo up to 5 MB.');
 const prepared=await prepareDeliveryPhoto(file);
 await put({...record,files:[...record.files,{key:crypto.randomUUID(),file:prepared}],state:'PENDING',needsEvidence:false,error:undefined});window.dispatchEvent(new Event('delivery-outbox-changed'));
}

/** Repair only a GPS-rejected, rolled-back arrival. Ambiguous submissions remain immutable. */
export async function repairArrivalGps(owner:string,key:string,gps:NonNullable<DeliveryInput['gps']>){
 const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);
 if(!record?.needsGps||record.state!=='NEEDS_ATTENTION')throw Error('Retry this original submission without changing its saved content.');
 await put({...record,input:{...record.input,gps,device_time:gps.captured_at},state:'PENDING',needsGps:false,error:undefined});window.dispatchEvent(new Event('delivery-outbox-changed'));
}
