import {AppSessionError,assertActiveTruckerSession,assertAdminStaffSession} from "./app-session.service.js";
import {createPasswordVerificationClient,supabaseAdmin,supabaseAuth} from "../config/supabase.js";
import {createDeletionConfirmationLimit} from "./deletion-confirmation-limit.js";
import {ApiError} from "../utils/api-response.js";
const enter=createDeletionConfirmationLimit();
/** Isolated password verification reuses Auth without replacing the app session. */
export async function changeAccountPassword(id:string,currentInput:unknown,nextInput:unknown,session:{token:string;sessionId:string|null;role:string}){
 let current=typeof currentInput==="string"?currentInput:"",next=typeof nextInput==="string"?nextInput:"";
 if(!current||current.length>1024||next.length<8||next.length>1024||next===current||next!==next.trim())throw new ApiError("Enter your current password and a different new password of at least 8 characters, without leading or trailing spaces.",400);
 let leave:()=>Promise<void>;
 try{leave=await enter(`account-password:${id}`);}catch(error){throw new ApiError(error instanceof ApiError&&error.statusCode===429?"Too many password attempts. Try again in 15 minutes.":"Account verification is busy or temporarily unavailable. Try again later.",error instanceof ApiError?error.statusCode:503);}
 const client=createPasswordVerificationClient();let temporarySession=false;
 try{
  const account=await supabaseAdmin.auth.admin.getUserById(id);
  if(account.error||!account.data.user?.email)throw new ApiError("Your sign-in account could not be verified.",503);
  const checked=await client.auth.signInWithPassword({email:account.data.user.email,password:current});current="";
  temporarySession=Boolean(checked.data.session);
  if(checked.error||checked.data.user?.id!==id||!temporarySession)throw new ApiError("Your current password could not be verified.",checked.error?.status===429?429:403);
  const closed=await client.auth.signOut({scope:"local"});
  if(closed.error)throw new ApiError("Account verification could not finish safely. Try again.",503);
  temporarySession=false;
  const currentUser=await supabaseAuth.auth.getUser(session.token);
  const profile=await supabaseAdmin.from("profiles").select("id,role,deactivated_at").eq("id",id).maybeSingle();
  if(currentUser.error||currentUser.data.user?.id!==id)throw new ApiError("Your original session expired. Sign in again before changing your password.",401);
  if(profile.error||!profile.data||(profile.data as any).deactivated_at||profile.data.role!==session.role)throw new ApiError("Account authorization changed. Sign in again.",403);
  try{
   if(session.role==="TRUCKER")await assertActiveTruckerSession(id,session.sessionId);
   else if(session.role==="ADMIN"||session.role==="STAFF")await assertAdminStaffSession(id,session.role,session.sessionId);
   else throw new ApiError("This account cannot change passwords here.",403);
  }catch(error){if(error instanceof AppSessionError)throw new ApiError(error.message,error.status,error.code);throw error;}
  const changed=await supabaseAdmin.auth.admin.updateUserById(id,{password:next});next="";
  if(changed.error||changed.data.user?.id!==id)throw new ApiError("Password change was not confirmed. Check the requirements or try signing in with the new password before retrying.",400);
  let auditWarning=false;
  try{const logged=await supabaseAdmin.from("audit_logs").insert({user_id:id,action:"ACCOUNT_PASSWORD_CHANGED",entity_type:"profiles",entity_id:id,new_data:{result:"SUCCESS"}});auditWarning=Boolean(logged.error);}catch{auditWarning=true;}
  return {changed:true,sign_in_again:true,audit_warning:auditWarning};
 }finally{
  current="";next="";
  if(temporarySession)try{await client.auth.signOut({scope:"local"});}catch{/* Short-lived isolated verification session; never returned to the browser. */}
  await leave();
 }
}
