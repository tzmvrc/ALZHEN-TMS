import {randomUUID} from "node:crypto";
import {wakeUserMaintenance} from './user-maintenance.service.js';
import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
const db=supabaseAdmin as any;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Shared by both upload endpoints. Never trust the requested role or UI visibility. */
export async function assertPicturePermission(actorId:string,subjectId:string){
 if(!uuid.test(actorId)||!uuid.test(subjectId))throw new ApiError("Invalid profile.",400);
 const [actor,subject]=await Promise.all([
  db.from("profiles").select("id,role,deactivated_at").eq("id",actorId).maybeSingle(),
  db.from("profiles").select("id,role,deactivated_at,profile_picture_path,first_name,last_name").eq("id",subjectId).maybeSingle(),
 ]);
 if(actor.error||subject.error)throw new ApiError("Picture permissions could not be verified.",503);
 if(!actor.data||actor.data.deactivated_at||!["ADMIN","STAFF","TRUCKER"].includes(actor.data.role)||!subject.data||subject.data.deactivated_at)throw new ApiError("An active account is required.",403);
 if(actorId!==subjectId&&!(subject.data.role==="TRUCKER"&&["ADMIN","STAFF"].includes(actor.data.role)))throw new ApiError("You may change your own picture or, as Admin/Staff, a trucker's picture.",403);
 return {actor:actor.data,subject:subject.data};
}
export async function commitAccountPicture(actorId:string,subjectId:string,path:string|null){
 const {subject}=await assertPicturePermission(actorId,subjectId);
 if(path!==null&&(!path.startsWith(subjectId+"/")||path.includes("..")))throw new ApiError("Invalid owned image path.",400);
 if(path===subject.profile_picture_path)return {cleanup_pending:false,audit_warning:false};
 // Preserve the existing atomic upload workflow for self-service. Removal uses
 // CAS below: the legacy RPC does not queue old files when p_path is NULL.
 if(path!==null&&actorId===subjectId){
  const result=await db.rpc("user_profile_picture_v1",{p_actor:actorId,p_subject:subjectId,p_path:path});
  if(result.error)throw new ApiError("Picture changes were not confirmed. Refresh before retrying.",result.error.code==="42501"?403:409);
  wakeUserMaintenance();
  return {cleanup_pending:Boolean(subject.profile_picture_path?.startsWith(subjectId+"/")&&!subject.profile_picture_path.includes("..")),audit_warning:false};
 }
 // The existing service-only RPC intentionally has a narrower Admin/self rule.
 // Managed-trucker uploads and removals use permission-checked CAS without impersonating
 // the subject or changing unrelated user-management permissions/schema.
 const oldPath=subject.profile_picture_path as string|null,ownsOld=Boolean(oldPath&&oldPath.startsWith(subjectId+"/")&&!oldPath.includes(".."));
 if(ownsOld){
  const staged=await db.from("user_maintenance_jobs").upsert({profile_id:subjectId,kind:"CLEANUP_PICTURE",dedupe_key:`picture:${oldPath}`,payload:{path:oldPath},state:"PENDING",next_attempt_at:new Date(Date.now()+86400000).toISOString()},{onConflict:"dedupe_key"});
  if(staged.error)throw new ApiError("Picture cleanup could not be prepared. No change was made.",503);
 }
 const intent=randomUUID();
 const logged=await db.from("audit_logs").insert({id:intent,user_id:actorId,action:"PROFILE_PICTURE_UPDATE_REQUESTED",entity_type:"profiles",entity_id:subjectId,new_data:{result:"STARTED"}});
 if(logged.error)throw new ApiError("Picture activity could not be recorded. No change was made.",503);
 let update=db.from("profiles").update({profile_picture_path:path,updated_at:new Date().toISOString()}).eq("id",subjectId).eq("role",subject.role).is("deactivated_at",null);
 update=oldPath===null?update.is("profile_picture_path",null):update.eq("profile_picture_path",oldPath);
 const changed=await update.select("id").maybeSingle();
 if(changed.error||!changed.data)throw new ApiError("The picture changed in another session. Refresh before retrying.",409);
 // These acknowledgements cannot turn an already committed picture into a failed save.
 let warning=false;
 try{
  if(path){const finished=await db.from("user_maintenance_jobs").update({state:"DONE",updated_at:new Date().toISOString()}).eq("dedupe_key",`picture:${path}`);warning ||= Boolean(finished.error);}
  if(oldPath&&oldPath!==path){const ready=await db.from("user_maintenance_jobs").update({state:"PENDING",next_attempt_at:new Date().toISOString()}).eq("dedupe_key",`picture:${oldPath}`);warning ||= Boolean(ready.error);}
  const final={status:path?"updated":"removed",result:"SUCCESS"};
  const audit=await db.from("audit_logs").update({action:"PROFILE_PICTURE_UPDATED",new_data:final}).eq("id",intent);
  if(audit.error){warning=true;await db.from("user_maintenance_jobs").insert({profile_id:subjectId,kind:"FINALIZE_ACTIVITY",dedupe_key:`activity:${intent}`,payload:{id:intent,action:"PROFILE_PICTURE_UPDATED",new_data:final}});}
 }catch{warning=true;}
 wakeUserMaintenance();
 return {cleanup_pending:ownsOld,audit_warning:warning};
}
