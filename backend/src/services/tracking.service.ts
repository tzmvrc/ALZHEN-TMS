import {randomUUID} from "node:crypto";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {validateTrackingCapture} from "./tracking.logic.js";

export type TrackingActor={profileId:string;role:string};
export type TrackingAssignment={id:string;tripId:string;profileId:string;active:boolean;revision:number};
export type TrackingFix=ReturnType<typeof validateTrackingCapture>;
/** Mutations must recheck active assignment, owner and assignment revision in a
 * single transaction. Capture also checks enabled/session and captured_at > saved.
 * These contracts need an approved atomic persistence implementation before routes
 * can be mounted; current schema proposal alone does not implement them. */
export interface TrackingRepository{
 assignment(id:string):Promise<TrackingAssignment|null>;
 begin(assignment:TrackingAssignment,sessionId:string):Promise<void>;
 capture(assignment:TrackingAssignment,sessionId:string,fix:TrackingFix):Promise<boolean>;
 stop(assignment:TrackingAssignment,sessionId:string):Promise<boolean>;
 latest(assignmentId:string):Promise<(TrackingFix&{revision:number;enabled:boolean})|null>;
}
export function createTrackingService(repository:TrackingRepository,now=Date.now){
 async function authorize(actor:TrackingActor,id:string,write:boolean){
  if(!isValidUuid(id)||!isValidUuid(actor.profileId))throw new ApiError("Invalid tracking identity.",400,"TRACKING_INVALID");
  if(write?actor.role!=="TRUCKER":!["ADMIN","STAFF","TRUCKER"].includes(actor.role))throw new ApiError("Tracking access denied.",403,"TRACKING_FORBIDDEN");
  const assignment=await repository.assignment(id);
  if(!assignment||(!assignment.active&&write)||(actor.role==="TRUCKER"&&assignment.profileId!==actor.profileId))throw new ApiError("Active assignment not available to this account.",403,"TRACKING_FORBIDDEN");
  return assignment;
 }
 function session(value:unknown){if(typeof value!=="string"||!isValidUuid(value))throw new ApiError("Enable location sharing again.",409,"TRACKING_SESSION_INVALID");return value;}
 return {
  async begin(actor:TrackingActor,id:string,consent:boolean){
   if(consent!==true)throw new ApiError("Explicit location sharing permission is required.",400,"TRACKING_CONSENT_REQUIRED");
   const assignment=await authorize(actor,id,true),sessionId=randomUUID();await repository.begin(assignment,sessionId);return {session_id:sessionId};
  },
  async capture(actor:TrackingActor,id:string,input:Record<string,unknown>){
   const assignment=await authorize(actor,id,true),sessionId=session(input.session_id),fix=validateTrackingCapture(input,now());
   if(!await repository.capture(assignment,sessionId,fix))throw new ApiError("Location session changed or a newer capture was already saved.",409,"TRACKING_CAPTURE_CONFLICT");
   return {assignment_id:assignment.id,captured_at:fix.captured_at};
  },
  async stop(actor:TrackingActor,id:string,sessionId:string){if(actor.role!=="TRUCKER")throw new ApiError("Tracking access denied.",403,"TRACKING_FORBIDDEN");const assignment=await authorize(actor,id,false);return {stopped:await repository.stop(assignment,session(sessionId))};},
  async latest(actor:TrackingActor,id:string){await authorize(actor,id,false);const fix=await repository.latest(id);return {assignment_id:id,location:fix,stale:!fix||now()-Date.parse(fix.captured_at)>120000};},
 };
}
