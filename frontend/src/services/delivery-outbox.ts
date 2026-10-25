import {ApiError} from './api.service';
import {saveDeliveryEvent,uploadDeliveryPhoto,type DeliveryInput} from './delivery.service';
export type OutboxRecord={key:string;owner:string;assignment:string;input:DeliveryInput;files:Array<{key:string;file:File;uploadedId?:string}>;created:number;state:'PENDING'|'NEEDS_ATTENTION';error?:string;needsEvidence?:boolean};
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
const locks=new Set<string>();
export async function flushDeliveryOutbox(owner:string,token:string,current:()=>boolean,onSaved:()=>void){
 if(locks.has(owner)||!navigator.onLine)return;locks.add(owner);
 const run=async()=>{for(const record of (await readDeliveryOutbox(owner)).sort((a,b)=>a.created-b.created)){
  if(!current()||!navigator.onLine)break;
  if(record.state==='NEEDS_ATTENTION')continue;
  try{
   for(const file of record.files){if(!current())return;if(!file.uploadedId){const saved=await uploadDeliveryPhoto(token,record.assignment,file.key,record.input.stop_id??null,file.file);file.uploadedId=saved.id;await put(record);}}
   if(!current())return;
   await saveDeliveryEvent(token,record.assignment,record.key,{...record.input,attachments:[...(record.input.attachments??[]),...record.files.map(f=>f.uploadedId!)]});
   await transact('readwrite',s=>s.delete(record.key));onSaved();
  }catch(error){
   const permanent=error instanceof ApiError&&[400,403,404,409,413,415,422].includes(error.status);
   await put({...record,state:permanent?'NEEDS_ATTENTION':'PENDING',needsEvidence:error instanceof ApiError&&error.code==='ARRIVAL_EVIDENCE_REQUIRED',error:error instanceof Error?error.message:'Submission awaits a connection.'});
   if(!permanent)break;
  }finally{window.dispatchEvent(new Event('delivery-outbox-changed'));}
 }};
 try{if(navigator.locks)await navigator.locks.request(`alzhen-delivery:${owner}`,{ifAvailable:true},lock=>lock?run():Promise.resolve());else await run();}finally{locks.delete(owner);}
}

/** Only a server-rejected arrival may be repaired; ambiguous/time-out payloads stay immutable. */
export async function addDraftArrivalEvidence(owner:string,key:string,file:File){
 const record=(await readDeliveryOutbox(owner)).find(r=>r.key===key);
 if(!record||record.state!=='NEEDS_ATTENTION'||!record.needsEvidence)throw Error('This draft cannot be changed safely. Retry the original submission.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||record.files.length>=6)throw Error('Choose one photo up to 5 MB.');
 await put({...record,files:[...record.files,{key:crypto.randomUUID(),file}],state:'PENDING',needsEvidence:false,error:undefined});window.dispatchEvent(new Event('delivery-outbox-changed'));
}
