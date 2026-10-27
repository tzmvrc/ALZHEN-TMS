import {prepareDeliveryPhoto} from './delivery-photo';
import {ApiError} from './api.service';
import {saveDeliveryEvent,uploadDeliveryPhoto,type DeliveryInput} from './delivery.service';
export type OutboxRecord={key:string;owner:string;assignment:string;input:DeliveryInput;files:Array<{key:string;file:File;uploadedId?:string}>;created:number;state:'PENDING'|'NEEDS_ATTENTION';error?:string;needsEvidence?:boolean;needsGps?:boolean};
let database:Promise<IDBDatabase>|null=null;
function open(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('alzhen-delivery-outbox-v1',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('submissions',{keyPath:'key'});store.createIndex('owner','owner');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(Error('This browser could not retain your draft. Keep the photo on your phone and retry online.'));};});}
async function transact<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>){const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('submissions',mode),request=operation(tx.objectStore('submissions'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(Error('Draft storage is full or unavailable. Keep the original photo and retry.'));tx.onabort=()=>reject(Error('Draft was not saved on this device. Keep the form open and retry.'));});}
export const readDeliveryOutbox=(owner:string)=>transact('readonly',s=>s.index('owner').getAll(owner)) as Promise<OutboxRecord[]>;
const put=(record:OutboxRecord)=>transact('readwrite',s=>s.put(record));
export async function queueDelivery(record:OutboxRecord){
 const pending=await readDeliveryOutbox(record.owner);
 const size=pending.reduce((n,r)=>n+r.files.reduce((sum,f)=>sum+f.file.size,0),0)+record.files.reduce((n,f)=>n+f.file.size,0);
 if(pending.length>=50||size>50*1024*1024)throw Error('Pending uploads have reached this device’s safe limit. Connect and sync them before adding more photos.');
 await put(record);window.dispatchEvent(new Event('delivery-outbox-changed'));
}
export async function retryDeliveryDraft(owner:string,key:string){const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);if(record){await put({...record,state:'PENDING',error:undefined});window.dispatchEvent(new Event('delivery-outbox-changed'));}}
export async function discardDeliveryDraft(owner:string,key:string){const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);if(record){await transact('readwrite',s=>s.delete(key));window.dispatchEvent(new Event('delivery-outbox-changed'));}}
export type DeliveryProgress={owner:string;key:string;phase:'UPLOADING'|'SAVING'|'CONFIRMED'|'FAILED';completed:number;total:number};
const flights=new Map<string,Promise<void>>();
export async function flushDeliveryOutbox(owner:string,token:string,current:()=>boolean,onSaved:()=>void){
 if(!navigator.onLine)return;
 if(flights.has(owner))return flights.get(owner);
 const progress=(record:OutboxRecord,phase:DeliveryProgress['phase'],completed=0)=>window.dispatchEvent(new CustomEvent<DeliveryProgress>('delivery-submit-progress',{detail:{owner,key:record.key,phase,completed,total:record.files.length}}));
 const run=async()=>{for(const record of (await readDeliveryOutbox(owner)).sort((a,b)=>a.created-b.created)){
  if(!current()||!navigator.onLine||record.state==='NEEDS_ATTENTION')break;
  try{
   let completed=0;
   for(const file of record.files){if(!current())return;if(!file.uploadedId){progress(record,'UPLOADING',completed);const saved=await uploadDeliveryPhoto(token,record.assignment,file.key,record.input.stop_id??null,file.file);file.uploadedId=saved.id;await put(record);}completed++;progress(record,'UPLOADING',completed);}
   if(!current())return;progress(record,'SAVING',completed);
   await saveDeliveryEvent(token,record.assignment,record.key,{...record.input,attachments:[...(record.input.attachments??[]),...record.files.map(f=>f.uploadedId!)]});
   await transact('readwrite',s=>s.delete(record.key));progress(record,'CONFIRMED',completed);onSaved();
  }catch(error){
   const permanent=error instanceof ApiError&&[400,403,404,409,413,415,422].includes(error.status);
   await put({...record,state:permanent?'NEEDS_ATTENTION':'PENDING',needsGps:error instanceof ApiError&&error.code==='ARRIVAL_GPS_REQUIRED',needsEvidence:error instanceof ApiError&&error.code==='ARRIVAL_EVIDENCE_REQUIRED',error:error instanceof Error?error.message:'Submission awaits a connection.'});progress(record,'FAILED');break;
  }finally{window.dispatchEvent(new Event('delivery-outbox-changed'));}
 }};
 const task=(async()=>{if(navigator.locks)await navigator.locks.request(`alzhen-delivery:${owner}`,{ifAvailable:true},lock=>lock?run():Promise.resolve());else await run();})();
 flights.set(owner,task);try{await task;}finally{if(flights.get(owner)===task)flights.delete(owner);}
}

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
