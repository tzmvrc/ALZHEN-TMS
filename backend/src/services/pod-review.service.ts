import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { POD_FIELDS } from "./pod-interpretation.service.js";
import { getSignedTripReceipt } from "./trip-receipt.service.js";

type Actor = {profileId:string;role:string};
export const podReviewEnabled = () => process.env.POD_REVIEW_ENABLED === "true";
function authorize(actor:Actor) {
  if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Only Admin and Staff can review POD submissions.",403,"POD_REVIEW_FORBIDDEN");
}
export function podReviewCapabilities(actor:Actor){authorize(actor);return {enabled:podReviewEnabled()};}
export async function podDecisionHistory(actor:Actor,tripId:string,receiptId:string){
  authorize(actor);
  if(!podReviewEnabled())throw new ApiError("POD review is not enabled.",503,"POD_REVIEW_DISABLED");
  if(!isValidUuid(tripId)||!isValidUuid(receiptId))throw new ApiError("Invalid receipt or trip ID.",400,"POD_REVIEW_INVALID");
  const {data:receipt,error}=await supabaseAdmin.from("trip_images").select("id,trip_stop_id").eq("id",receiptId).eq("trip_id",tripId).eq("kind","receipt").maybeSingle();
  if(error)throw new ApiError("Review history could not be loaded.",503,"POD_REVIEW_UNAVAILABLE");
  if(!receipt?.trip_stop_id)throw new ApiError("Receipt transaction not found.",404,"POD_RECEIPT_NOT_FOUND");
  const result=await supabaseAdmin.from("pod_review_events").select("id,actor_snapshot,decision,reason,reviewed_fields,created_at").eq("receipt_id",receiptId).eq("trip_id",tripId).eq("trip_stop_id",receipt.trip_stop_id).order("expected_review_version",{ascending:false}).order("id",{ascending:false}).limit(50);
  if(result.error)throw new ApiError("Review history is unavailable. Check approved migration setup.",503,"POD_REVIEW_UNAVAILABLE");
  return result.data??[];
}
export function validatePodDecision(input:Record<string,unknown>){
  if(typeof input.request_id!=="string"||!isValidUuid(input.request_id)||!["APPROVED","REJECTED"].includes(String(input.decision)))throw new ApiError("A valid decision and request ID are required.",400,"POD_REVIEW_INVALID");
  for(const key of ["expected_review_version","expected_ocr_version"])if(!Number.isSafeInteger(input[key])||Number(input[key])<0)throw new ApiError("Reload the document before deciding.",400,"POD_REVIEW_INVALID");
  const reason=input.reason===undefined?"":input.reason;
  if(typeof reason!=="string"||reason.length>2000||(input.decision==="REJECTED"&&!reason.trim()))throw new ApiError("Enter a rejection reason up to 2,000 characters.",400,"POD_REVIEW_INVALID");
  const fields=input.reviewed_fields;
  if(!fields||typeof fields!=="object"||Array.isArray(fields)||JSON.stringify(fields).length>16000)throw new ApiError("Enter valid reviewed fields.",400,"POD_REVIEW_INVALID");
  for(const [key,value] of Object.entries(fields)){
    if(!(POD_FIELDS as readonly string[]).includes(key)||value!==null&&(key==="quantity"?typeof value!=="number"||!Number.isFinite(value)||value<0:typeof value!=="string"||value.length>500))throw new ApiError("Unsupported reviewed field or value.",400,"POD_REVIEW_INVALID");
    if(key.endsWith("_date")&&value!==null&&value!==""&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||!Number.isFinite(Date.parse(String(value)))||new Date(String(value)).toISOString().slice(0,10)!==value))throw new ApiError("Enter a valid reviewed date.",400,"POD_REVIEW_INVALID");
  }
  if(input.pod_record_id!=null&&(typeof input.pod_record_id!=="string"||!isValidUuid(input.pod_record_id)))throw new ApiError("Invalid linked POD identifier.",400,"POD_REVIEW_INVALID");
  return {request_id:input.request_id,decision:input.decision as "APPROVED"|"REJECTED",reason:reason.trim()||null,reviewed_fields:fields as Record<string,unknown>,expected_review_version:Number(input.expected_review_version),expected_ocr_version:Number(input.expected_ocr_version),pod_record_id:input.pod_record_id??null};
}
export async function decidePodReceipt(actor:Actor,tripId:string,receiptId:string,input:Record<string,unknown>){
  authorize(actor);
  if(!podReviewEnabled())throw new ApiError("POD approval is awaiting the approved database migration. OCR/manual verification remains available.",503,"POD_REVIEW_DISABLED");
  if(!isValidUuid(tripId)||!isValidUuid(receiptId))throw new ApiError("Invalid receipt or trip ID.",400,"POD_REVIEW_INVALID");
  const decision=validatePodDecision(input);
  const {data:receipt,error:readError}=await supabaseAdmin.from("trip_images").select("id,trip_id,trip_stop_id,kind").eq("id",receiptId).eq("trip_id",tripId).eq("kind","receipt").maybeSingle();
  if(readError)throw new ApiError("Unable to verify the selected receipt.",503,"POD_REVIEW_UNCONFIRMED");
  if(!receipt?.trip_stop_id)throw new ApiError("A receipt linked to an exact transaction is required.",404,"POD_RECEIPT_NOT_FOUND");
  const {data,error}=await supabaseAdmin.rpc("review_pod_receipt_v1",{
    p_actor_id:actor.profileId,p_request_id:decision.request_id,p_trip_id:tripId,p_stop_id:receipt.trip_stop_id,p_receipt_id:receiptId,
    p_expected_review_version:decision.expected_review_version,p_expected_ocr_version:decision.expected_ocr_version,
    p_decision:decision.decision,p_reason:decision.reason,p_reviewed_fields:decision.reviewed_fields,p_pod_record_id:decision.pod_record_id,
  });
  if(error){
    if(error.code==="PGRST202")throw new ApiError("POD review migration is not configured. Disable POD_REVIEW_ENABLED until approved setup is complete.",503,"POD_REVIEW_NOT_CONFIGURED");
    if(error.code==="42501")throw new ApiError("POD review access denied.",403,"POD_REVIEW_FORBIDDEN");
    if(error.code==="P0002")throw new ApiError(error.message,404,"POD_RECEIPT_NOT_FOUND");
    if(["40001","55000","23505"].includes(error.code))throw new ApiError(error.code==="23505"?"Linked POD records changed. Reload and review the exact transaction.":error.message,409,"POD_REVIEW_CONFLICT");
    if(error.code==="22023")throw new ApiError("Invalid POD decision. Check fields and reason.",400,"POD_REVIEW_INVALID");
    throw new ApiError("POD decision could not be confirmed. Retry with the same request ID.",503,"POD_REVIEW_UNCONFIRMED");
  }
  if(data?.receipt_id!==receiptId||data?.trip_id!==tripId||data?.trip_stop_id!==receipt.trip_stop_id||data?.request_id!==decision.request_id||data?.status!==decision.decision||data?.review_version!==decision.expected_review_version+1||!isValidUuid(data.event_id)||!isValidUuid(data.notification_id))throw new ApiError("POD decision identity could not be confirmed. Retry the same request.",503,"POD_REVIEW_UNCONFIRMED");
  // Canonical response may be newer after another authorized review. Never claim
  // a locally invented status; a failed read is safe to retry with the same ID.
  const updated=await getSignedTripReceipt(tripId,receiptId);
  if(!updated)throw new ApiError("Decision may be saved; reload or retry the same request before continuing.",503,"POD_REVIEW_UNCONFIRMED");
  return {outcome:data,receipt:updated};
}
