import {createPasswordVerificationClient,supabaseAdmin,supabaseAuth} from "../config/supabase.js";
import {AppSessionError,assertAdminStaffSession} from "./app-session.service.js";
import {enterDeletionConfirmation} from "./deletion-confirmation-limit.js";
import {ApiError} from "../utils/api-response.js";

export type DeletionCredentials={password:unknown;accessToken:string;appSessionId:string|null};
type Actor={id:string;role:string};
const dependencies={
 createClient:createPasswordVerificationClient,
 user:async(token:string)=>{const result=await supabaseAuth.auth.getUser(token);return result.error?null:result.data.user;},
 admin:async(id:string)=>{const result=await supabaseAdmin.from("profiles").select("role").eq("id",id).maybeSingle();if(result.error)throw new ApiError("Admin authorization could not be confirmed.",503,"DELETE_AUTH_UNAVAILABLE");return result.data?.role==="ADMIN";},
 session:assertAdminStaffSession,
 enter:enterDeletionConfirmation,
};
/** No verification token: password authentication and mutation share one request. */
function createPasswordGuard(deps: typeof dependencies, roles: readonly string[], authorize: (actor: Actor) => Promise<boolean>){
 return async<T>(actor:Actor,credentials:DeletionCredentials,commit:()=>Promise<T>):Promise<T>=>{
  if(!roles.includes(actor.role))throw new ApiError("Only ADMIN may permanently delete whole trips.",403,"WHOLE_TRIP_FORBIDDEN");
  let password=credentials.password;credentials.password=undefined;
  if(typeof password!=="string"||password.length===0||password.length>1024)throw new ApiError("Enter your current account password.",400,"DELETE_PASSWORD_REQUIRED");
  if(!credentials.accessToken)throw new ApiError("Please sign in again.",401,"DELETE_SESSION_EXPIRED");
  const leave=await deps.enter(actor.id);
  try{
   const user=await deps.user(credentials.accessToken);
   if(!user||user.id!==actor.id||!user.email)throw new ApiError("Your session has expired. Please sign in again.",401,"DELETE_SESSION_EXPIRED");
   if(!await authorize(actor))throw new ApiError("Only a currently authorized Admin may delete whole trips.",403,"WHOLE_TRIP_FORBIDDEN");
   const client=deps.createClient();let signedIn=false;
   try{
    const result=await client.auth.signInWithPassword({email:user.email,password});password="";
    signedIn=Boolean(result.data.session);
    if(result.error?.status===429)throw new ApiError("Password verification is rate limited. Try again later.",429,"DELETE_CONFIRM_RATE_LIMIT");
    if(result.error||!result.data.user||!result.data.session||result.data.user.id!==actor.id)throw new ApiError("The current account password could not be verified.",403,"DELETE_PASSWORD_INVALID");
   }catch(e){if(e instanceof ApiError)throw e;throw new ApiError("Password verification is unavailable. Nothing was deleted.",503,"DELETE_AUTH_UNAVAILABLE");}
   finally{
    password="";
    if(signedIn){try{const result=await client.auth.signOut({scope:"local"});if(result.error)throw Error();}catch{throw new ApiError("Password verification could not be safely completed. Nothing was deleted.",503,"DELETE_AUTH_UNAVAILABLE");}}
   }
   // Recheck the original bearer/session and role after the external Auth request.
   const current=await deps.user(credentials.accessToken);
   if(!current||current.id!==actor.id)throw new ApiError("Your session has expired. Please sign in again.",401,"DELETE_SESSION_EXPIRED");
   try{await deps.session(actor.id,actor.role as "ADMIN" | "STAFF",credentials.appSessionId);}catch(e){if(e instanceof AppSessionError)throw new ApiError(e.message,e.status,e.code);throw e;}
   if(!await authorize(actor))throw new ApiError("Admin permission changed. Nothing was deleted.",403,"WHOLE_TRIP_FORBIDDEN");
   return await commit();
  }finally{password="";await leave();}
 };
}
export function createDeletionPasswordGuard(deps=dependencies){
 return createPasswordGuard(deps,["ADMIN"],actor=>deps.admin(actor.id));
}
/** Record deletion retains ADMIN/STAFF policy; verify the same current role twice. */
export function createCurrentUserPasswordGuard(deps=dependencies, readRole=async(id:string)=>{
 const result=await supabaseAdmin.from("profiles").select("role").eq("id",id).maybeSingle();
 if(result.error)throw new ApiError("Account authorization could not be confirmed.",503,"DELETE_AUTH_UNAVAILABLE");
 return result.data?.role??null;
}){
 const verify=createPasswordGuard(deps,["ADMIN","STAFF"],async actor=>(await readRole(actor.id))===actor.role);
 return async<T>(actor:Actor,credentials:DeletionCredentials,commit:()=>Promise<T>):Promise<T>=>{
  try{return await verify(actor,credentials,commit);}
  catch(error){if(error instanceof ApiError && error.code==="WHOLE_TRIP_FORBIDDEN")throw new ApiError("Your current account is not authorized to delete operational reports.",403,"REPORT_ACCESS_DENIED");throw error;}
 };
}
export const withDeletionPassword=createDeletionPasswordGuard();
export const withCurrentUserPassword=createCurrentUserPasswordGuard();

/** Session-authorized deletion. No secondary sign-in or password/session switching. */
export function createDeletionSessionGuard(deps=dependencies, roles:readonly string[]=["ADMIN"], readRole=async(id:string)=>{
 const result=await supabaseAdmin.from("profiles").select("role").eq("id",id).maybeSingle();
 if(result.error)throw new ApiError("Account authorization could not be confirmed.",503,"DELETE_AUTH_UNAVAILABLE");
 return result.data?.role??null;
}){
 return async<T>(actor:Actor,credentials:DeletionCredentials,commit:()=>Promise<T>):Promise<T>=>{
  credentials.password=undefined;
  if(!roles.includes(actor.role))throw new ApiError("Your account cannot delete these records.",403,"DELETE_FORBIDDEN");
  if(!credentials.accessToken)throw new ApiError("Please sign in again.",401,"DELETE_SESSION_EXPIRED");
  const leave=await deps.enter(actor.id);
  try{
   const user=await deps.user(credentials.accessToken);
   if(!user||user.id!==actor.id)throw new ApiError("Please sign in again.",401,"DELETE_SESSION_EXPIRED");
   try{await deps.session(actor.id,actor.role as "ADMIN"|"STAFF",credentials.appSessionId);}catch(error){if(error instanceof AppSessionError)throw new ApiError(error.message,error.status,error.code);throw error;}
   if(await readRole(actor.id)!==actor.role)throw new ApiError("Your permissions changed. Nothing was deleted.",403,"DELETE_FORBIDDEN");
   return await commit();
  }finally{await leave();}
 };
}
export const withDeletionSession=createDeletionSessionGuard();
export const withCurrentUserSession=createDeletionSessionGuard(dependencies,["ADMIN","STAFF"]);
