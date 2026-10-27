import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { createOffload,createBackload,updateOffload,updateBackload } from "./operations-report.service.js";
import { requireReportUuid,assertOperationsManagementRole,type ReportActor } from "./operations-report.logic.js";
import { collaborationEvents } from "./collaboration-events.js";
const SOURCES={OFFLOAD:{table:"offloads",field:"reason"},BACKLOAD:{table:"backloads",field:"reason"},DEMURRAGE:{table:"demurrages",field:"reason"},INCIDENT:{table:"incidents",field:"description"},FOU_ALERT:{table:"incidents",field:"description"}} as const;
export type TripIssueType=keyof typeof SOURCES;
export type TripIssue={id:string;trip_id:string;trip_stop_id:string|null;type:TripIssueType;reason:string|null;date:string|null;number_of_boxes:number|null;remarks:string|null;ir_status:string|null;submitted_date:string|null;created_by?:string|null};
async function allRows(table:string,fields:string,ids?:string[]){const rows:Record<string,unknown>[]=[];for(let offset=0;offset<50000;offset+=1000){let query=supabaseAdmin.from(table).select(fields).order("id").range(offset,offset+999);if(ids)query=query.in("trip_id",ids);const {data,error}=await query;if(error)throw new ApiError("Unable to load trip issues.",503,"TRIP_ISSUES_READ_FAILED");const records:unknown[]=data??[];for(const record of records){if(!record||typeof record!=="object"||Array.isArray(record))throw new ApiError("Invalid trip issue response.",503,"TRIP_ISSUES_READ_FAILED");rows.push(record as Record<string,unknown>);}if((data?.length??0)<1000)return rows;}throw new ApiError("Narrow the trip issue query.",400,"TRIP_ISSUE_QUERY_LIMIT");}
const textOrNull=(value:unknown)=>value==null||value===""?null:String(value);
const quantityOrNull=(value:unknown)=>value==null||value===""?null:Number(value);
const FOU_PREFIX="[FOU Alert] ";
async function fouReasonId(){const result=await supabaseAdmin.from("incident_reasons").select("id").eq("code","FOU_ALERT").maybeSingle();if(result.error)throw new ApiError("Unable to read incident types.",503);return result.data?.id??null;}
export async function readTripIssuesForTripIds(ids:string[]):Promise<TripIssue[]>{
 if(ids.length===0)return[];if(ids.length>100)throw new ApiError("Select at most 100 trip references.",400);ids.forEach(id=>requireReportUuid(id,"trip_id"));
 const [offloads,backloads,demurrages,incidents,fouId]=await Promise.all([
  allRows("offloads","id,trip_id,trip_stop_id,reason,number_of_boxes,comments,report_date,status,submitted_at,created_by",ids),
  allRows("backloads","id,trip_id,trip_stop_id,reason,number_of_boxes,comments,report_date,status,submitted_at,created_by",ids),
  allRows("demurrages","id,trip_id,trip_stop_id,reason,remarks,time_in,status,number_of_boxes,submitted_date,created_by",ids),
  allRows("incidents","id,trip_id,trip_stop_id,description,incident_date,status,submitted_date,incident_reason_id,number_of_boxes,remarks,created_by",ids),fouReasonId()]);
 const base=(row:Record<string,unknown>)=>({id:String(row.id),trip_id:String(row.trip_id),trip_stop_id:textOrNull(row.trip_stop_id),created_by:textOrNull(row.created_by)});
 return [
  ...offloads.map(row=>({...base(row),type:"OFFLOAD" as const,reason:textOrNull(row.reason),date:textOrNull(row.report_date),number_of_boxes:quantityOrNull(row.number_of_boxes),remarks:textOrNull(row.comments),ir_status:textOrNull(row.status),submitted_date:textOrNull(row.submitted_at)})),
  ...backloads.map(row=>({...base(row),type:"BACKLOAD" as const,reason:textOrNull(row.reason),date:textOrNull(row.report_date),number_of_boxes:quantityOrNull(row.number_of_boxes),remarks:textOrNull(row.comments),ir_status:textOrNull(row.status),submitted_date:textOrNull(row.submitted_at)})),
  ...demurrages.map(row=>({...base(row),type:"DEMURRAGE" as const,reason:textOrNull(row.reason),date:textOrNull(row.time_in),number_of_boxes:quantityOrNull(row.number_of_boxes),remarks:textOrNull(row.remarks),ir_status:textOrNull(row.status),submitted_date:textOrNull(row.submitted_date)})),
  ...incidents.map(row=>{const description=textOrNull(row.description);const fou=Boolean(fouId&&row.incident_reason_id===fouId)||Boolean(description?.startsWith(FOU_PREFIX));const reason=fou&&description?.startsWith(FOU_PREFIX)?description.slice(FOU_PREFIX.length):description;return {...base(row),type:fou?"FOU_ALERT" as const:"INCIDENT" as const,reason,date:textOrNull(row.incident_date),number_of_boxes:quantityOrNull(row.number_of_boxes),remarks:textOrNull(row.remarks),ir_status:textOrNull(row.status),submitted_date:textOrNull(row.submitted_date)};})];
}
export async function readTripIssues(actor:ReportActor,ids?:string[]):Promise<TripIssue[]>{
 assertOperationsManagementRole(actor);
 if(!ids)throw new ApiError("Select the trips whose incident reports you want to view.",400);
 return readTripIssuesForTripIds(ids);
}
export async function issueFilterTripIds(filter:string):Promise<string[]|null>{if(!filter||filter==="All")return null;if(!["In Progress","Completed","Offload","Demurrage","Backload"].includes(filter))throw new ApiError("Invalid trip issue filter.",400);if(filter==="Offload"||filter==="Demurrage"||filter==="Backload")return [...new Set((await allRows(filter==="Offload"?"offloads":filter==="Backload"?"backloads":"demurrages","id,trip_id")).map(row=>String(row.trip_id)))];const data=await allRows("trips","id,status");const completed=(status:unknown)=>["COMPLETED","DELIVERED","DONE","CLOSED"].includes(String(status??"").toUpperCase());return (data??[]).filter(row=>filter==="Completed"?completed(row.status):["IN_PROGRESS","IN PROGRESS","IN_TRANSIT","IN TRANSIT","DISPATCHED","LOADING","UNLOADING","ONGOING","STARTED","DELAYED","ON_HOLD"].includes(String(row.status??"").toUpperCase())).map(row=>String(row.id));}
async function saveTripIssueLegacy(actor:ReportActor,input:Record<string,unknown>){assertOperationsManagementRole(actor);const tripId=requireReportUuid(input.trip_id,"trip_id"),stopId=input.trip_stop_id?requireReportUuid(input.trip_stop_id,"trip_stop_id"):null;const type=String(input.type) as TripIssueType;if(!Object.hasOwn(SOURCES,type))throw new ApiError("Choose a supported issue type.",400);if(typeof input.reason!=="string"||!input.reason.trim()||input.reason.length>2000)throw new ApiError("Enter a reason of up to 2,000 characters.",400);const reason=input.reason.trim();const trip=await supabaseAdmin.from("trips").select("id").eq("id",tripId).maybeSingle();if(trip.error||!trip.data)throw new ApiError("Trip not found.",404);if(stopId){const stop=await supabaseAdmin.from("trip_stops").select("id").eq("id",stopId).eq("trip_id",tripId).maybeSingle();if(stop.error||!stop.data)throw new ApiError("The selected stop does not belong to this trip.",409);}
 const source=SOURCES[type];let result:unknown;
 if(input.id){const id=requireReportUuid(input.id,"report_id");const found=await supabaseAdmin.from(source.table).select("id,trip_id,trip_stop_id").eq("id",id).eq("trip_id",tripId).maybeSingle();if(found.error||!found.data||found.data.trip_stop_id!==stopId)throw new ApiError("The report does not belong to the selected trip and stop.",409);if(type==="OFFLOAD")result=await updateOffload(actor,id,{trip_id:tripId,trip_stop_id:stopId,reason});else if(type==="BACKLOAD")result=await updateBackload(actor,id,{trip_id:tripId,trip_stop_id:stopId,reason});else{const saved=await supabaseAdmin.from(source.table).update({[source.field]:reason}).eq("id",id).eq("trip_id",tripId).select("id").single();if(saved.error)throw new ApiError("Unable to update the report.",409);result=saved.data;}}
 else if(type==="OFFLOAD"||type==="BACKLOAD"){const requestId=requireReportUuid(input.request_id,"request_id");result=await(type==="OFFLOAD"?createOffload:createBackload)(actor,{trip_id:tripId,trip_stop_id:stopId,reason,request_id:requestId});}
 else if(type==="DEMURRAGE"){const id=requireReportUuid(input.request_id,"request_id");const saved=await supabaseAdmin.from("demurrages").insert({id,trip_id:tripId,trip_stop_id:stopId,reason,created_by:actor.profileId}).select("id").single();if(saved.error?.code==="23505"){const existing=await supabaseAdmin.from("demurrages").select("id,trip_id,trip_stop_id,reason,created_by").eq("id",id).single();if(existing.error||existing.data.trip_id!==tripId||existing.data.trip_stop_id!==stopId||existing.data.created_by!==actor.profileId||existing.data.reason!==reason)throw new ApiError("This submission conflicts with another report.",409);result=existing.data;}else if(saved.error)throw new ApiError("Unable to create the demurrage report.",409);else result=saved.data;}
 else throw new ApiError("Create incidents through the existing incident workflow.",409);
 collaborationEvents.emit("commit",{source:source.table,recordId:input.id??(result as {id?:string})?.id??tripId,tripId,stopId:stopId??undefined,fields:[source.field],version:null,actorId:actor.profileId,eventId:randomUUID()});return result;
}

function optionalDate(value:unknown,field:string){if(value==null||value==="")return null;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value)))throw new ApiError(`${field} must be a valid date.`,400);return value;}
function optionalText(value:unknown,field:string,max=2000){if(value==null||value==="")return null;if(typeof value!=="string"||value.length>max)throw new ApiError(`${field} is too long.`,400);return value.trim()||null;}
function optionalBoxes(value:unknown){if(value==null||value==="")return null;const count=Number(value);if(!Number.isSafeInteger(count)||count<0)throw new ApiError("No. of Box must be a non-negative whole number.",400);return count;}

/** Save one physical report by ID. Never reuse a sibling report of the same type. */
export async function saveTripIssue(actor:ReportActor,input:Record<string,unknown>){
 assertOperationsManagementRole(actor);
 const tripId=requireReportUuid(input.trip_id,"trip_id"),stopId=input.trip_stop_id?requireReportUuid(input.trip_stop_id,"trip_stop_id"):null;
 const type=String(input.type) as TripIssueType;if(!Object.hasOwn(SOURCES,type))throw new ApiError("Choose a supported issue type.",400);
 const reason=optionalText(input.reason,"Reason");if(!reason)throw new ApiError("Enter a reason of up to 2,000 characters.",400);
 const date=input.date===undefined?undefined:optionalDate(input.date,"Incident date");
 const submittedDate=input.submitted_date===undefined?undefined:optionalDate(input.submitted_date,"Submission date");
 const boxes=input.number_of_boxes===undefined?undefined:optionalBoxes(input.number_of_boxes);
 const remarks=input.remarks===undefined?undefined:optionalText(input.remarks,"Remarks");
 const status=input.ir_status===undefined?undefined:optionalText(input.ir_status,"IR status",80);
 if(type==="INCIDENT"||type==="FOU_ALERT"){
  const id=input.id?requireReportUuid(input.id,"report_id"):requireReportUuid(input.request_id,"request_id");
  const trip=await supabaseAdmin.from("trips").select("id").eq("id",tripId).maybeSingle();if(trip.error||!trip.data)throw new ApiError("Trip not found.",404);
  if(stopId){const stop=await supabaseAdmin.from("trip_stops").select("id").eq("id",stopId).eq("trip_id",tripId).maybeSingle();if(stop.error||!stop.data)throw new ApiError("The selected stop does not belong to this trip.",409);}
  const fouId=await fouReasonId();
  let markFou=type==="FOU_ALERT"&&!fouId;
  if(input.id){const found=await supabaseAdmin.from("incidents").select("trip_stop_id,incident_reason_id,description").eq("id",id).eq("trip_id",tripId).maybeSingle();const marker=String(found.data?.description??"").startsWith(FOU_PREFIX);const isFou=Boolean(fouId&&found.data?.incident_reason_id===fouId)||marker;if(found.error||!found.data||found.data.trip_stop_id!==stopId||(type==="FOU_ALERT")!==isFou)throw new ApiError("The incident does not belong to the selected trip and stop.",409);markFou=markFou||marker;}
  const values={description:markFou?`${FOU_PREFIX}${reason}`:reason,...(date!==undefined?{incident_date:date}:{}),...(boxes!==undefined?{number_of_boxes:boxes}:{}),...(remarks!==undefined?{remarks}:{}),...(status?{status}:{}),...(submittedDate!==undefined?{submitted_date:submittedDate}:{})};
  const saved=input.id?await supabaseAdmin.from("incidents").update(values).eq("id",id).eq("trip_id",tripId).select("id").single():await supabaseAdmin.from("incidents").insert({id,trip_id:tripId,trip_stop_id:stopId,incident_reason_id:type==="FOU_ALERT"?fouId:null,created_by:actor.profileId,...values}).select("id").single();
  if(saved.error?.code==="23505"&&!input.id){const previous=await supabaseAdmin.from("incidents").select("id,trip_id,trip_stop_id,description,created_by").eq("id",id).maybeSingle();if(!previous.error&&previous.data?.trip_id===tripId&&previous.data.trip_stop_id===stopId&&previous.data.description===values.description&&previous.data.created_by===actor.profileId)return {id};}
  if(saved.error)throw new ApiError("Unable to save the incident report.",409);
  collaborationEvents.emit("commit",{source:"incidents",recordId:id,tripId,stopId:stopId??undefined,fields:["description","incident_date","status","submitted_date"],version:null,actorId:actor.profileId,eventId:randomUUID()});return saved.data;
 }
 const saved=await saveTripIssueLegacy(actor,{...input,reason});
 const reportId=input.id?requireReportUuid(input.id,"report_id"):String((saved as {id?:string;report?:{id?:string}})?.id??(saved as {report?:{id?:string}})?.report?.id??"");
 const values=type==="DEMURRAGE"?{...(date!==undefined?{time_in:date}:{}),...(boxes!==undefined?{number_of_boxes:boxes}:{}),...(remarks!==undefined?{remarks}:{}),...(status?{status}:{}),...(submittedDate!==undefined?{submitted_date:submittedDate}:{})}:{...(date!==undefined?{report_date:date}:{}),...(boxes!==undefined?{number_of_boxes:boxes}:{}),...(remarks!==undefined?{comments:remarks}:{}),...(status?{status}:{}),...(submittedDate!==undefined?{submitted_at:submittedDate}:{})};
 if(Object.keys(values).length){
  if(!reportId)throw new ApiError("The report was saved, but its details could not be verified. Reopen it to review.",409);
  const updated=await supabaseAdmin.from(SOURCES[type].table).update(values).eq("id",reportId).eq("trip_id",tripId).select("id").single();
  if(updated.error)throw new ApiError("The report was saved, but some details could not be updated. Reopen it to review.",409);
  collaborationEvents.emit("commit",{source:SOURCES[type].table,recordId:reportId,tripId,stopId:stopId??undefined,fields:Object.keys(values),version:null,actorId:actor.profileId,eventId:randomUUID()});
 }
 return saved;
}

export async function resolveTripIssue(actor:ReportActor,typeInput:string,idInput:string){assertOperationsManagementRole(actor);const type=typeInput.toUpperCase() as TripIssueType;if(!Object.hasOwn(SOURCES,type))throw new ApiError("Unsupported report reference.",400);const id=requireReportUuid(idInput,"report_id");const result=await supabaseAdmin.from(SOURCES[type].table).select("id,trip_id,trip_stop_id").eq("id",id).maybeSingle();if(result.error||!result.data)throw new ApiError("Report not found.",404);return result.data;}

export async function deleteTripIssue(actor:ReportActor,typeInput:string,idInput:string){
 assertOperationsManagementRole(actor);
 const type=typeInput.toUpperCase() as TripIssueType;
 if(!["INCIDENT","FOU_ALERT","DEMURRAGE"].includes(type))throw new ApiError("Use report cleanup for Offload and Backload records.",400);
 const id=requireReportUuid(idInput,"report_id");const table=SOURCES[type].table;
 const found=await supabaseAdmin.from(table).select(table==="incidents"?"id,trip_id,trip_stop_id,incident_reason_id,description":"id,trip_id,trip_stop_id").eq("id",id).maybeSingle();
 if(found.error||!found.data)throw new ApiError("Report not found.",404);
 const record=found.data as unknown as Record<string,unknown>;
 if(table==="incidents"){
  const fouId=await fouReasonId();
  const isFou=Boolean(fouId&&record.incident_reason_id===fouId)||String(record.description??"").startsWith(FOU_PREFIX);
  if((type==="FOU_ALERT")!==isFou)throw new ApiError("This report is a different incident type.",409);
 }
 const deleted=await supabaseAdmin.from(table).delete().eq("id",id).eq("trip_id",record.trip_id).select("id").single();
 if(deleted.error)throw new ApiError("Unable to delete this report.",409);
 collaborationEvents.emit("commit",{source:table,recordId:id,tripId:String(record.trip_id),stopId:record.trip_stop_id?String(record.trip_stop_id):undefined,fields:["deleted"],version:null,actorId:actor.profileId,eventId:randomUUID()});
 return {id};
}
