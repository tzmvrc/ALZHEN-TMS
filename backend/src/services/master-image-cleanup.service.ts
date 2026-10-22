import {supabaseAdmin} from "../config/supabase.js";
import {PRODUCT_PHOTO_BUCKET,removeProductPhotoObjects} from "./product-photo.service.js";
import {TRUCK_IMAGE_BUCKET,removeTruckImageObjects} from "./truck-image.service.js";
import {ApiError} from "../utils/api-response.js";

type ObjectReceipt={bucket:string;path:string;object_id:string;metadata_hash:string;object_version:string|null};
type CleanupJob={id:string;resource:"products"|"trucks";record_id:string;attempts:number;storage_objects:ObjectReceipt[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function owned(job:CleanupJob,object:ObjectReceipt){
 const prefix=job.resource==="products"?"products":"trucks",bucket=job.resource==="products"?PRODUCT_PHOTO_BUCKET:TRUCK_IMAGE_BUCKET;
 return object?.bucket===bucket&&typeof object.path==="string"&&uuid.test(object.object_id)&&
  new RegExp(`^${prefix}/${job.record_id}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`,"i").test(object.path);
}
async function processJob(job:CleanupJob){
 let errorMessage:string|null=null;
 try{
  if(!uuid.test(job.record_id)||!Array.isArray(job.storage_objects)||job.storage_objects.some(object=>!owned(job,object)))throw Error("Unverified image ownership; review the cleanup manifest.");
  // Recheck references and the exact Storage object identity before every attempt.
  const checked=await supabaseAdmin.rpc("validate_master_image_cleanup_v1",{p_operation:job.id,p_attempt:job.attempts});
  if(checked.error||!Array.isArray(checked.data))throw Error("Image ownership verification needs review or retry.");
  const objects=checked.data as ObjectReceipt[];
  if(objects.some(object=>!owned(job,object)||!job.storage_objects.some(saved=>saved.bucket===object.bucket&&saved.path===object.path&&saved.object_id===object.object_id&&saved.metadata_hash===object.metadata_hash&&saved.object_version===object.object_version)))throw Error("The Storage object changed; cleanup needs review.");
  const paths=[...new Set(objects.map(object=>object.path))];
  for(let offset=0;offset<paths.length;offset+=100){
   const outcome=await (job.resource==="products"?removeProductPhotoObjects:removeTruckImageObjects)(paths.slice(offset,offset+100));
   if(outcome.error)throw Error("Storage image cleanup needs retry.");
  }
  const remaining=await supabaseAdmin.rpc("validate_master_image_cleanup_v1",{p_operation:job.id,p_attempt:job.attempts});
  if(remaining.error||!Array.isArray(remaining.data)||remaining.data.length)throw Error("Storage cleanup could not be confirmed; retry is queued.");
 }catch(error){errorMessage=error instanceof Error?error.message:"Image cleanup needs retry.";}
 // An unsuccessful acknowledgement leaves a leased, durable job for recovery.
 const saved=await supabaseAdmin.from("master_image_cleanup_jobs").update({state:errorMessage?"PENDING":"COMPLETE",lease_until:null,last_error:errorMessage,
  next_attempt_at:new Date(Date.now()+Math.min(3_600_000,10_000*2**Math.min(job.attempts,8))).toISOString(),
  ...(errorMessage?{}:{completed_at:new Date().toISOString()})}).eq("id",job.id).eq("attempts",job.attempts).eq("state","RUNNING").select("id").maybeSingle();
 return !errorMessage&&!saved.error&&Boolean(saved.data);
}
/** Database leases prevent duplicate work across requests and backend processes. */
export async function runMasterImageCleanup(operation?:string){
 const claimed=await supabaseAdmin.rpc("claim_master_image_cleanup_v1",{p_operation:operation??null});
 if(claimed.error)throw new ApiError("Image cleanup queue is unavailable; committed jobs remain queued.",503);
 const jobs=(claimed.data??[]) as CleanupJob[];
 let complete=false;
 for(const job of jobs){
  try{const done=await processJob(job);if(job.id===operation)complete=done;}
  catch{console.error("Master image cleanup acknowledgement deferred; the lease will expire and retry.");}
 }
 return complete;
}
export async function listMasterImageCleanup(){
 const result=await supabaseAdmin.from("master_image_cleanup_jobs").select("id,resource,record_id,state,attempts,last_error,next_attempt_at").neq("state","COMPLETE").order("created_at").limit(100);
 if(result.error)throw new ApiError("Pending image cleanup could not be loaded.",503);
 return result.data??[];
}
export async function retryMasterImageCleanup(operation:string){
 if(!uuid.test(operation))throw new ApiError("Invalid image cleanup operation.",400);
 await runMasterImageCleanup(operation);
 const result=await supabaseAdmin.from("master_image_cleanup_jobs").select("id,state").eq("id",operation).maybeSingle();
 if(result.error)throw new ApiError("Cleanup acknowledgement is unavailable; the operation remains retryable.",503);
 if(!result.data)throw new ApiError("Cleanup operation not found.",404);
 return {operation_id:operation,cleanup_pending:result.data.state!=="COMPLETE"};
}
export function startMasterImageCleanupWorker(){
 let stopped=false,running=false,reported=false;
 const tick=async()=>{if(stopped||running)return;running=true;try{await runMasterImageCleanup();reported=false;}catch{if(!reported)console.error("Master image cleanup deferred; durable jobs remain queued. Check the image cleanup migration and Storage availability.");reported=true;}finally{running=false;}};
 const timer=setInterval(()=>void tick(),15_000);timer.unref();void tick();
 return()=>{stopped=true;clearInterval(timer);};
}
