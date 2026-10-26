import {useCallback,useSyncExternalStore} from "react";
import {fetchTruckImageBatch,type TruckImage} from "./master-data.service";
import {subscribeToAdminRealtime} from "./realtime.service";
type Snapshot={images:TruckImage[];loading:boolean;error:string};
type Entry={token:string;truckId:string;value:Snapshot;listeners:Set<()=>void>;expires:number;generation:number;promise?:Promise<void>};
type ReadJob={item:Entry;generation:number;force:boolean;resolve:()=>void};
const entries=new Map<string,Entry>();let running=0;const queue:ReadJob[]=[];let scheduled=false;let stopRealtime:(()=>void)|undefined;
const key=(token:string,id:string)=>`${token}:${id}`;
function entry(token:string,id:string){let value=entries.get(key(token,id));if(!value){value={token,truckId:id,value:{images:[],loading:false,error:""},listeners:new Set(),expires:0,generation:0};entries.set(key(token,id),value);}return value;}
function publish(item:Entry,patch:Partial<Snapshot>){item.value={...item.value,...patch};item.listeners.forEach(listener=>listener());}
function schedule(){if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;drain();});}}
function drain(){
 while(running<4&&queue.length){
  const token=queue[0].item.token,jobs:ReadJob[]=[];
  for(let index=0;index<queue.length&&jobs.length<50;){
   const job=queue[index];if(job.item.token!==token){index++;continue;}queue.splice(index,1);
   if(!job.item.listeners.size&&!job.force&&job.generation===job.item.generation){job.item.promise=undefined;publish(job.item,{loading:false});job.resolve();}else jobs.push(job);
  }
  if(!jobs.length)continue;
  running++;
  void fetchTruckImageBatch(token,jobs.map(job=>job.item.truckId)).then(images=>{
   for(const {item,generation} of jobs)if(generation===item.generation){const rows=images[item.truckId];if(!Array.isArray(rows))throw Error("Image batch was incomplete.");item.expires=Date.now()+45*60_000;publish(item,{images:rows,error:""});}
  }).catch(()=>{for(const {item,generation} of jobs)if(generation===item.generation){item.expires=Date.now()+15_000;publish(item,{error:"Unable to load truck images. Retry to refresh them."});}}).finally(()=>{
   running--;for(const {item,generation,resolve} of jobs){item.promise=undefined;publish(item,{loading:false});resolve();if(generation!==item.generation&&item.listeners.size)void refreshTruckImages(item.token,item.truckId);}schedule();
  });
 }
}
export function refreshTruckImages(token:string,truckId:string,force=false):Promise<void>{
 const item=entry(token,truckId);if(force){item.expires=0;item.generation++;}if(item.promise)return item.promise;
 if(item.expires>Date.now())return Promise.resolve();const generation=item.generation;publish(item,{loading:true,error:""});
 item.promise=new Promise<void>(resolve=>{queue.push({item,generation,force,resolve});schedule();});
 return item.promise;
}
export function invalidateTruckImages(token:string,truckId:string){const item=entries.get(key(token,truckId));if(!item)return;item.expires=0;item.generation++;if(item.listeners.size)void refreshTruckImages(token,truckId);}
function startRealtime(){if(stopRealtime)return;stopRealtime=subscribeToAdminRealtime(event=>{
 const tables=event.kind==="batch"?event.tables:event.kind==="change"?[event.payload.table]:event.kind==="recovered"?[event.table]:[];
 if(event.kind!=="resume"&&!tables.includes("truck_images"))return;
 const id=event.kind==="change"?event.payload.new?.truck_id??event.payload.old?.truck_id:null;
 for(const item of entries.values())if(!id||item.truckId===id)invalidateTruckImages(item.token,item.truckId);
 });}
function watch(token:string,id:string,listener:()=>void){const item=entry(token,id);item.listeners.add(listener);startRealtime();void refreshTruckImages(token,id);return()=>{item.listeners.delete(listener);if(![...entries.values()].some(value=>value.listeners.size)){stopRealtime?.();stopRealtime=undefined;}if(entries.size>200)for(const [id,cached] of entries){if(entries.size<=200)break;if(!cached.listeners.size&&!cached.promise)entries.delete(id);}};}
export function useTruckImages(token:string,truckId:string){const subscribe=useCallback((listener:()=>void)=>watch(token,truckId,listener),[token,truckId]);const snapshot=useCallback(()=>entry(token,truckId).value,[token,truckId]);return useSyncExternalStore(subscribe,snapshot);}
