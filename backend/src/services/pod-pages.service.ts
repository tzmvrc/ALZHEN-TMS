import {supabaseAdmin as db} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {renderPodPdf} from "./pdf-renderer.service.js";
import {preparePodIntake} from "./pod-intake.service.js";
import {isValidUuid} from "../utils/validation.js";
export const pdfEnabled=()=>process.env.POD_PDF_ENABLED==="true";
type Actor={id:string;role:string};
const budgets=new Map<string,{at:number;count:number}>();
async function authorize(actor:Actor,tripId:string,stopId:string){
 if(!["ADMIN","STAFF","TRUCKER"].includes(actor.role)||!isValidUuid(tripId)||!isValidUuid(stopId))throw new ApiError("Receipt access denied.",403,"POD_ACCESS_DENIED");
 let stopQuery=db.from("trip_stops").select("id").eq("trip_id",tripId).eq("id",stopId);
 if(actor.role==="TRUCKER")stopQuery=stopQuery.is("archived_at",null);
 const stop=await stopQuery.maybeSingle();
 if(stop.error||!stop.data)throw new ApiError("Exact receipt transaction required.",403,"POD_ACCESS_DENIED");
 if(actor.role!=="TRUCKER")return;
 const driver=await db.from("drivers").select("id").eq("profile_id",actor.id).maybeSingle();
 if(driver.error||!driver.data)throw new ApiError("Assigned driver required.",403,"POD_ACCESS_DENIED");
 const assigned=await db.from("trip_truck_assignments").select("id,trips!inner(archived_at)").eq("driver_id",driver.data.id).eq("trip_id",tripId).is("unassigned_at",null).is("trips.archived_at",null).limit(1);
 if(assigned.error||!assigned.data?.length)throw new ApiError("Current trip assignment required.",403,"POD_ACCESS_DENIED");
}
export async function preparePdfPages(actor:Actor,tripId:string,stopId:string,bytes:Buffer,mime:string,name:string){
 if(!pdfEnabled())throw new ApiError("PDF receipts are not enabled.",409,"POD_PDF_DISABLED");
 await authorize(actor,tripId,stopId);
 const now=Date.now(),old=budgets.get(actor.id),budget=old&&now-old.at<60000?old:{at:now,count:0};
 if(budget.count>=6)throw new ApiError("PDF processing limit reached. Retry shortly.",429,"POD_PDF_BUSY");budget.count++;budgets.set(actor.id,budget);
 if(budgets.size>500)for(const [id,b] of budgets)if(now-b.at>60000)budgets.delete(id);
 const {data:bucket,error}=await db.storage.getBucket("trip-images");
 if(error||!bucket)throw new ApiError("Private receipt Storage unavailable.",503,"POD_STORAGE_INVALID");
 const result=await preparePodIntake(bytes,mime,name,{pdfEnabled:true,bucketPrivate:!bucket.public,allowedMimeTypes:bucket.allowed_mime_types??[],maxBytes:bucket.file_size_limit??5242880},renderPodPdf);
 return {pages:result.ocrPages.map(page=>({mime_type:"image/png",data:page.toString("base64")}))};
}
export async function savedPdfPages(actor:Actor,tripId:string,receiptId:string){
 if(!pdfEnabled())throw new ApiError("PDF receipts are not enabled.",409,"POD_PDF_DISABLED");
 if(!isValidUuid(receiptId))throw new ApiError("Invalid receipt.",400,"POD_INVALID");
 const {data:r,error}=await db.from("trip_images").select("*").eq("trip_id",tripId).eq("id",receiptId).eq("kind","receipt").maybeSingle();
 if(error||!r?.trip_stop_id)throw new ApiError("Exact receipt transaction not found.",404,"POD_NOT_FOUND");
 await authorize(actor,tripId,r.trip_stop_id);
 if(actor.role==="TRUCKER"&&r.uploaded_by!==actor.id)throw new ApiError("Receipt access denied.",403,"POD_ACCESS_DENIED");
 const {data:file,error:downloadError}=await db.storage.from("trip-images").download(r.storage_path);
 if(downloadError||!file||file.size>5242880)throw new ApiError("Original receipt unavailable.",503,"POD_STORAGE_INVALID");
 return preparePdfPages(actor,tripId,r.trip_stop_id,Buffer.from(await file.arrayBuffer()),r.mime_type??"application/pdf",r.file_name);
}
