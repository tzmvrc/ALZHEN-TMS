import {withDeletionPassword,type DeletionCredentials} from "./deletion-password.service.js";
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
export const WHOLE_TRIP_IMPACT_COUNTS=["trip_stops","trip_line_items","trip_truck_assignments","pod_records","trip_images","offloads","backloads","loading_reports","unloading_reports","report_receipts","billings","payables","receivables","documents","pod_drive_files","operations_report_conversions","incidents","store_calls","demurrages","trip_events","driver_trip_updates","offload_items","backload_items","tracking_locations","cached_routes","source_flex_rows","source_flex_cells","pod_review_events_retained"] as const;
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
export function createWholeTripDeleter(verify=withDeletionPassword){return async function deleteWholeTrips(actor:{id:string;role:string},input:unknown,credentials?:DeletionCredentials){
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
