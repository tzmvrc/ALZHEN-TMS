import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("cleanup fails closed on missing validator, retained references, foreign/replacement objects and coordinates concurrent retries",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js");const {retryTransactionCleanup}=await import("../src/services/transaction-deletion.service.js");
 const original={rpc:db.rpc,from:db.from,storage:db.storage.from};let mode="missing",removes=0,checks=0;const actor={id:id(1),role:"ADMIN"};
 const object={bucket:"trip-images",path:`trips/${id(10)}/${id(11)}.jpg`,object_id:id(12)};
 let job={id:id(2),transaction_id:id(10),trip_id:id(10),trip_stop_id:null,state:"PENDING_STORAGE",attempts:0,storage_objects:[object]};
 db.from=(()=>{let patch:any=null;const q:any={select(){return q},eq(){return q},update(v:any){patch=v;return q},async maybeSingle(){if(patch)job={...job,...patch};return {data:job,error:null}}};return q;}) as typeof db.from;
 db.rpc=(async(name:string)=>{assert.equal(name,"validate_transaction_cleanup_objects_v1");checks++;await new Promise(r=>setTimeout(r,10));return mode==="missing"||mode==="retained"?{data:null,error:{code:mode==="missing"?"PGRST202":"55000"}}:{data:mode==="replacement"?[{...object,object_id:id(99)}]:mode==="foreign"?[{...object,path:`trips/${id(99)}/${id(11)}.jpg`}]:[object],error:null};}) as typeof db.rpc;
 db.storage.from=(()=>({async remove(paths:string[]){removes++;assert.deepEqual(paths,[object.path]);return {error:mode==="storage-fails"?{message:"Unavailable"}:null}}})) as typeof db.storage.from;
 try{
  for(mode of ["missing","retained","replacement","foreign"]){const result=await retryTransactionCleanup(actor,id(2));assert.equal(result.cleanup_pending,true);assert.match(result.cleanup_blocked_reason??"",/verification/);assert.equal(removes,0);}
  mode="storage-fails";assert.equal((await retryTransactionCleanup(actor,id(2))).cleanup_pending,true);assert.equal(job.state,"PENDING_STORAGE");
  mode="valid";const previous=checks;const results=await Promise.all(Array.from({length:10},()=>retryTransactionCleanup(actor,id(2))));assert.equal(checks,previous+1);assert.ok(results.every(r=>!r.cleanup_pending));assert.equal(removes,2);assert.equal(job.state,"COMPLETE");
  await assert.rejects(retryTransactionCleanup({...actor,role:"TRUCKER"},id(2)),/Only ADMIN or STAFF/);
 }finally{db.rpc=original.rpc;db.from=original.from;db.storage.from=original.storage;}
});

test("ownership findings are validated and sanitized; blocked evidence cannot authorize deletion",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js");const {wholeTripImpact,WHOLE_TRIP_IMPACT_COUNTS}=await import("../src/services/whole-trip-deletion.service.js");
 const original={rpc:db.rpc,from:db.from},flag=process.env.WHOLE_TRIP_DELETE_ENABLED;let status="BLOCKED";
 db.rpc=(async()=>({error:null,data:{trips:[{id:id(10)}],counts:Object.fromEntries(WHOLE_TRIP_IMPACT_COUNTS.map(k=>[k,0])),blockers:[],attachment_review:[{update_id:id(20),trip_id:id(10),image_id:id(30),trip_stop_id:id(40),status,reason:"Exact ownership evidence",storage_path:"private/path",owner_id:"private"}]}})) as typeof db.rpc;
 db.from=(()=>{const q={select(){return q},in(){return q},eq:async()=>({count:0,error:null})};return q;}) as typeof db.from;
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";const blocked=await wholeTripImpact({id:id(1),role:"ADMIN"},[id(10)]);assert.equal(blocked.can_delete,false);assert.equal("storage_path" in blocked.attachment_review[0],false);assert.equal("owner_id" in blocked.attachment_review[0],false);status="VERIFIED";assert.equal((await wholeTripImpact({id:id(1),role:"ADMIN"},[id(10)])).can_delete,true);status="GUESSED";await assert.rejects(wholeTripImpact({id:id(1),role:"ADMIN"},[id(10)]),/Attachment review is unavailable/);}finally{db.rpc=original.rpc;db.from=original.from;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});

test("only committed complete acknowledgements broadcast stable trip DELETE events",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js");const {createWholeTripDeleter}=await import("../src/services/whole-trip-deletion.service.js");const {collaborationEvents}=await import("../src/services/collaboration-events.js");
 const original={rpc:db.rpc,from:db.from},flag=process.env.WHOLE_TRIP_DELETE_ENABLED;let acknowledged=false;const events:any[]=[];const listener=(event:any)=>events.push(event);collaborationEvents.on("commit",listener);
 db.rpc=(async()=>acknowledged?{data:[{id:id(30),trip_id:id(10)}],error:null}:{data:null,error:{code:"55000",message:"Retention blocker"}}) as typeof db.rpc;
 db.from=(()=>{const q={select(){return q},eq(){return q},async maybeSingle(){return {data:{id:id(30),trip_id:id(10),transaction_id:id(10),trip_stop_id:null,state:"COMPLETE"},error:null}}};return q;}) as typeof db.from;
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";const remove=createWholeTripDeleter(async(_a,_c,commit)=>commit());await assert.rejects(remove({id:id(1),role:"ADMIN"},[id(10)]),/Retention/);assert.equal(events.length,0);acknowledged=true;await remove({id:id(1),role:"ADMIN"},[id(10),id(10)]);assert.equal(events.length,1);assert.deepEqual(events[0],{source:"trips",recordId:id(10),tripId:id(10),operation:"DELETE",version:null,fields:[],actorId:id(1),eventId:`trips:${id(10)}:deleted`});}finally{collaborationEvents.off("commit",listener);db.rpc=original.rpc;db.from=original.from;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});


test("failed POD uploads retain ownership reservation until exact-object compensation succeeds",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js");const {uploadTripImage}=await import("../src/services/trip-image.service.js");
 const original={from:db.from,storage:db.storage.from,bucket:db.storage.getBucket};let reserved=false,removed=false,mode="upload-failure",deletes=0;
 db.from=((table:string)=>{let inserting:any=null,deleting=false,single=false;const q:any={select(){return q},eq(){return q},order(){return q},limit(){return q},insert(value:any){inserting=value;return q},delete(){deleting=true;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve:any,reject:any){if(inserting)reserved=true;if(deleting){assert.ok(removed,"Never remove owner metadata before confirmed Storage compensation");reserved=false;deletes++;}const data=table==="trips"?{id:id(10)}:inserting?{id:id(11),...inserting}:single?{display_order:0}:[];return Promise.resolve({data,error:null,count:0}).then(resolve,reject)}};return q;}) as typeof db.from;
 db.storage.getBucket=(async()=>({data:{public:false},error:null})) as typeof db.storage.getBucket;
 db.storage.from=(()=>({upload:async()=>{assert.equal(reserved,true);return {error:mode==="upload-failure"?{message:"Lost response"}:null}},createSignedUrl:async()=>({data:null,error:{message:"Unavailable"}}),remove:async()=>{if(mode==="recovered"){removed=true;return {error:null}}return {error:{message:"Cleanup unavailable"}}}})) as typeof db.storage.from;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzAAAAAASUVORK5CYII=','base64');
 try{
  for(mode of ["upload-failure","signed-url-failure"]){reserved=false;await assert.rejects(uploadTripImage(id(10),bytes,"image/png","synthetic.png",{stopId:id(12),profileId:id(3),drNumber:"FIXTURE"}),/reserved receipt is retained/);assert.equal(reserved,true);assert.equal(deletes,0);}
  mode="recovered";await assert.rejects(uploadTripImage(id(10),bytes,"image/png","synthetic.png"),/secure photo link/);assert.equal(reserved,false);assert.equal(deletes,1);
 }finally{db.from=original.from;db.storage.from=original.storage;db.storage.getBucket=original.bucket;}
});
