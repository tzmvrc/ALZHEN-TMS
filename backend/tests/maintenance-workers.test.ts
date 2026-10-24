import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {startUserMaintenanceWorker,userMaintenanceMetrics} from '../src/services/user-maintenance.service.js';
import {runMasterImageCleanup} from '../src/services/master-image-cleanup.service.js';
import {TRUCK_IMAGE_BUCKET} from '../src/services/truck-image.service.js';
function result(data:any,error:any=null){const q:any={then:(resolve:any,reject:any)=>Promise.resolve({data,error,count:0}).then(resolve,reject)};for(const name of ['select','eq','limit','maybeSingle','abortSignal','retry'])q[name]=()=>q;return q;}
test('user maintenance completes owned cleanup, preserves referenced pictures and keeps attempt/state guards',async()=>{
 const rpc=db.rpc,from=db.from,storage=db.storage.from,random=Math.random;
 const profile='f0241024-0000-4000-9000-000000000001',path=profile+'/fixture.png';let stop=()=>{};
 try{Math.random=()=>0;
  for(const referenced of [false,true]){const writes:any[]=[],objects:any[]=[];let claimed=false;
   db.rpc=(()=>{assert.equal(claimed,false);claimed=true;return result([{id:'fixture',kind:'CLEANUP_PICTURE',profile_id:profile,payload:{path},attempts:2}]);}) as any;
   db.from=((table:string)=>{if(table==='profiles'){const q=result([]);q.then=(resolve:any)=>Promise.resolve({data:[],error:null,count:referenced?1:0}).then(resolve);return q;}return {update:(body:any)=>{const entry={body,guards:[] as any[]};writes.push(entry);const q=result([]);q.eq=(...args:any[])=>{entry.guards.push(args);return q;};return q;}};}) as any;
   db.storage.from=((bucket:string)=>({remove:async(paths:string[])=>{objects.push({bucket,paths});return {data:[],error:null};}})) as any;
   stop=startUserMaintenanceWorker();for(let i=0;i<100&&!userMaintenanceMetrics()?.nextDelayMs;i++)await new Promise(resolve=>setTimeout(resolve,5));
   for(let i=0;i<100&&(!writes.length||userMaintenanceMetrics()?.running);i++)await new Promise(resolve=>setTimeout(resolve,5));
   assert.equal(writes.length,1);assert.equal(writes[0].body.state,referenced?'PENDING':'DONE');assert.deepEqual(writes[0].guards,[['id','fixture'],['attempts',2],['state','WORKING']]);assert.equal(objects.length,referenced?0:1);if(!referenced)assert.deepEqual(objects[0],{bucket:'profile-pictures',paths:[path]});stop();
  }
 }finally{stop();db.rpc=rpc;db.from=from;db.storage.from=storage;Math.random=random;}
});
test('master cleanup uses owned bucket/receipt, verifies removal and retains failed work for retry',async()=>{
 const rpc=db.rpc,from=db.from,storage=db.storage.from;
 const id='f0241024-0000-4000-9000-000000000002',record='f0241024-0000-4000-9000-000000000003';
 const receipt={bucket:TRUCK_IMAGE_BUCKET,path:`trucks/${record}/${id}.jpg`,object_id:id,metadata_hash:'fixture',object_version:null};
 try{for(const failed of [false,true]){let validations=0;const writes:any[]=[],removed:any[]=[];
  db.rpc=((name:string)=>name==='claim_master_image_cleanup_v1'?result([{id,resource:'trucks',record_id:record,attempts:1,storage_objects:[receipt]}]):result(++validations===1?[receipt]:[])) as any;
  db.from=(()=>({update:(body:any)=>{writes.push(body);return result({id});}})) as any;
  db.storage.from=((bucket:string)=>({remove:async(paths:string[])=>{removed.push({bucket,paths});return {data:[],error:failed?{message:'fixture failure'}:null};}})) as any;
  assert.equal(await runMasterImageCleanup(id),!failed);assert.equal(writes[0].state,failed?'PENDING':'COMPLETE');assert.deepEqual(removed,[{bucket:TRUCK_IMAGE_BUCKET,paths:[receipt.path]}]);assert.equal(validations,failed?1:2);
 }}finally{db.rpc=rpc;db.from=from;db.storage.from=storage;}
});
