import {withDeletionSession,type DeletionCredentials} from "./deletion-password.service.js";
import {supabaseAdmin as db} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {retryTransactionCleanup} from "./transaction-deletion.service.js";
import {collaborationEvents} from "./collaboration-events.js";
type AttachmentReview={update_id:string;trip_id:string;image_id:string|null;trip_stop_id:string|null;status:"VERIFIED"|"BLOCKED";reason:string};
export function wholeTripIds(actor:{id:string;role:string},input:unknown):string[]{
 if(actor.role!=="ADMIN")throw new ApiError("Only ADMIN may delete whole trips.",403,"WHOLE_TRIP_FORBIDDEN");
 if(!Array.isArray(input)||!input.length||input.length>100||input.some(id=>typeof id!=="string"||!isValidUuid(id)))throw new ApiError("Select valid physical trip IDs.",400,"WHOLE_TRIP_IDS");
 if(!isValidUuid(actor.id))throw new ApiError("Authenticated Admin identity is required.",403,"WHOLE_TRIP_FORBIDDEN");
 const ids=[...new Set(input.map(id=>(id as string).toLowerCase()))] as string[];if(ids.length>20)throw new ApiError("Select at most twenty distinct trips.",400,"WHOLE_TRIP_IDS");return ids.sort();
}
export const WHOLE_TRIP_IMPACT_COUNTS=["trip_stops","trip_line_items","trip_truck_assignments","trip_truck_crew_members","pod_records","trip_images","offloads","backloads","loading_reports","unloading_reports","report_receipts","billings","payables","receivables","documents","pod_drive_files","operations_report_conversions","incidents","store_calls","demurrages","trip_events","driver_trip_updates","offload_items","backload_items","tracking_locations","cached_routes","source_flex_rows","source_flex_cells","pod_review_events_retained","trip_cargo_allocations","trip_assignment_stops","spreadsheet_formulas","trip_notifications"] as const;
export async function wholeTripImpact(actor:{id:string;role:string},input:unknown){
 const ids=wholeTripIds(actor,input);
 const {data,error}=await db.rpc("preview_whole_trip_deletion_v1",{p_trip_ids:ids,p_actor_id:actor.id});
 if(error)throw new ApiError(error.code==="42883"||error.code==="PGRST202"?"Whole-trip impact requires the separately approved preview/deletion migration.":"Impact counts are unavailable. Nothing may be deleted.",503,"WHOLE_TRIP_IMPACT");
 if(!data||!Array.isArray(data.trips)||data.trips.length!==ids.length||data.trips.some((trip:{id:string})=>!ids.includes(trip.id))||ids.some(id=>!data.trips.some((trip:{id:string})=>trip.id===id))||!data.counts||WHOLE_TRIP_IMPACT_COUNTS.some(key=>typeof data.counts[key]!=="number")||!Array.isArray(data.blockers)||data.blockers.some((value:unknown)=>typeof value!=="string")||Object.values(data.counts).some(count=>typeof count!=="number"||!Number.isSafeInteger(count)||count<0))throw new ApiError("Impact counts are unavailable. Nothing may be deleted.",503,"WHOLE_TRIP_IMPACT");
 const blockers:string[]=[...data.blockers];
 const pending=await db.from("report_receipts").select("id",{count:"exact",head:true}).in("trip_id",ids).eq("upload_status","PENDING");
 if(pending.error)throw new ApiError("Image-upload retention checks are unavailable. Nothing may be deleted.",503,"WHOLE_TRIP_IMPACT");
 if((pending.count??0)>0)blockers.push("An image upload is incomplete. Recover the original upload before deleting this trip.");
 if(process.env.WHOLE_TRIP_DELETE_ENABLED!=="true")blockers.push("Whole-trip deletion is disabled in this backend runtime.");
 const attachmentReview=data.attachment_review as AttachmentReview[]|undefined;
 if(attachmentReview!==undefined&&(!Array.isArray(attachmentReview)||attachmentReview.some(row=>!isValidUuid(row?.update_id)||!ids.includes(row?.trip_id)||!["VERIFIED","BLOCKED"].includes(row?.status)||typeof row?.reason!=="string"||(row.image_id!==null&&!isValidUuid(row.image_id))||(row.trip_stop_id!==null&&!isValidUuid(row.trip_stop_id)))))throw new ApiError("Attachment review is unavailable. Nothing may be deleted.",503,"WHOLE_TRIP_IMPACT");
 if(attachmentReview?.some(row=>row.status==="BLOCKED")&&!blockers.some(value=>value.includes("ownership")))blockers.push("Attachment ownership or retention requires review.");
 return {trips:data.trips,counts:data.counts,blockers,can_delete:blockers.length===0,...(attachmentReview?{attachment_review:attachmentReview.map(row=>({update_id:row.update_id,trip_id:row.trip_id,image_id:row.image_id,trip_stop_id:row.trip_stop_id,status:row.status,reason:row.reason}))}:{})};
}
export function createWholeTripDeleter(verify=withDeletionSession){return async function deleteWholeTrips(actor:{id:string;role:string},input:unknown,credentials?:DeletionCredentials){
 const admin=Object.freeze({...actor}),ids=Object.freeze(wholeTripIds(admin,input));
 if(process.env.WHOLE_TRIP_DELETE_ENABLED!=="true")throw new ApiError("Whole-trip deletion is disabled pending approved SQL and acceptance checks.",503,"WHOLE_TRIP_DISABLED");
 return verify(admin,credentials??{password:undefined,accessToken:"",appSessionId:null},async()=>{
 if(process.env.WHOLE_TRIP_DELETE_ENABLED!=="true")throw new ApiError("Whole-trip deletion is disabled.",503,"WHOLE_TRIP_DISABLED");
 const {data,error}=await db.rpc("delete_whole_trips_v1",{p_trip_ids:ids,p_actor_id:admin.id});
 if(error?.code==="42501")throw new ApiError("Only the currently authorized Admin may delete whole trips.",403,"WHOLE_TRIP_FORBIDDEN");
 if(error)throw new ApiError(["55000","23503","23001","23514","P0002","55P03","40P01"].includes(error.code)?error.message:"Whole-trip deletion could not be confirmed. No cleanup was started.",["55000","23503","23001","23514","P0002","55P03","40P01"].includes(error.code)?409:503,"WHOLE_TRIP_DELETE_FAILED");
 if(!Array.isArray(data)||!data.length||data.some(job=>!job.id||!ids.includes(job.trip_id))||ids.some(id=>!data.some(job=>job.trip_id===id)))throw new ApiError("Deletion acknowledgement is incomplete. No cleanup was started.",503,"WHOLE_TRIP_UNCONFIRMED");
 // Only an authoritative committed acknowledgement may invalidate other sessions.
 // Use the same stable DELETE identity as the durable Supabase bridge.
 for(const id of ids)collaborationEvents.emit("commit",{source:"trips",recordId:id,tripId:id,operation:"DELETE",version:null,fields:[],actorId:admin.id,eventId:`trips:${id}:deleted`});
 const cleanup:Array<{operation_id:string;cleanup_pending:boolean}>=[];
 for(const job of data){try{cleanup.push(await retryTransactionCleanup(admin,job.id));}catch{cleanup.push({operation_id:job.id,cleanup_pending:true});}}
 return {trip_ids:ids,deleted_trips:ids.length,cleanup_pending:cleanup.some(row=>row.cleanup_pending),operations:cleanup};
 });
}
}
export const deleteWholeTrips=createWholeTripDeleter();

const bulkLimit=100_000;
// Keep each atomic RPC comfortably below the database statement timeout.
const bulkDeleteBatchSize=5;
export function wholeTripBulkIds(actor:{id:string;role:string},input:unknown):string[]{
 if(actor.role!=="ADMIN"||!isValidUuid(actor.id))throw new ApiError("Only ADMIN may delete whole trips.",403,"WHOLE_TRIP_FORBIDDEN");
 if(!Array.isArray(input)||!input.length||input.length>bulkLimit||input.some(id=>typeof id!=="string"||!isValidUuid(id)))throw new ApiError("Select valid physical trip IDs (up to 100,000 per confirmation).",400,"WHOLE_TRIP_IDS");
 return [...new Set(input.map(id=>(id as string).toLowerCase()))].sort();
}
export async function wholeTripBulkImpact(actor:{id:string;role:string},input:unknown,shouldContinue=()=>true){
 const ids=wholeTripBulkIds(actor,input);
 const merged:{trips:Array<{id:string;dispatch_number:string|null}>;counts:Record<string,number>;blockers:string[];can_delete:boolean}={trips:[],counts:{},blockers:[],can_delete:true};
 for(let offset=0;offset<ids.length;offset+=20){
  if(!shouldContinue())throw new ApiError("Impact check cancelled.",499);
  const impact=await wholeTripImpact(actor,ids.slice(offset,offset+20));
  merged.trips.push(...impact.trips);
  for(const [key,count] of Object.entries(impact.counts))merged.counts[key]=(merged.counts[key]??0)+(count as number);
  merged.blockers.push(...impact.blockers);
 }
 merged.blockers=[...new Set(merged.blockers)];merged.can_delete=merged.blockers.length===0;
 return merged;
}
/** One Admin confirmation/rate-limit lease, existing atomic SQL checks per batch.
 * Stop on the first failed or unconfirmed batch; never replay confirmed deletes. */
export function createWholeTripBulkDeleter(verify=withDeletionSession,deleteBatch=createWholeTripDeleter(async(_actor,_credentials,commit)=>commit())){
 return async(actor:{id:string;role:string},input:unknown,credentials:DeletionCredentials,shouldContinue=()=>true)=>{
  const admin=Object.freeze({...actor}),ids=Object.freeze(wholeTripBulkIds(admin,input));
  if(process.env.WHOLE_TRIP_DELETE_ENABLED!=="true")throw new ApiError("Whole-trip deletion is disabled.",503,"WHOLE_TRIP_DISABLED");
  return verify(admin,credentials,async()=>{
   const deleted:string[]=[];let cleanupPending=false;
   for(let offset=0;offset<ids.length;offset+=bulkDeleteBatchSize){
    let result;
    try{
     if(!shouldContinue())throw new ApiError("Deletion stopped because the connection closed. Reload to check completed trips.",409);
     result=await deleteBatch(admin,ids.slice(offset,offset+bulkDeleteBatchSize),credentials);
    }catch(error){
     return {deleted_trip_ids:deleted,remaining_trip_ids:ids.slice(offset),deleted_trips:deleted.length,cleanup_pending:cleanupPending,stopped_error:error instanceof ApiError?error.message:"The last batch could not be confirmed. Reload before retrying.",stopped_status:error instanceof ApiError?error.statusCode:503};
    }
    deleted.push(...ids.slice(offset,offset+bulkDeleteBatchSize));cleanupPending ||= result.cleanup_pending;
   }
   return {deleted_trip_ids:deleted,remaining_trip_ids:[],deleted_trips:deleted.length,cleanup_pending:cleanupPending};
  });
 };
}
export const deleteWholeTripsBulk=createWholeTripBulkDeleter();
