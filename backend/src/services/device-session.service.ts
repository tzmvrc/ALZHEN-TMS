import {supabaseAdmin as db} from '../config/supabase.js';
import {sha256SessionIdentifier} from '../utils/session-rules.js';
import {ApiError} from '../utils/api-response.js';
import {AppSessionError} from './app-session.service.js';

export function browserMetadata(agent:string,device?:unknown,ip?:string){
 const browser_name=/Edg\//.test(agent)?'Edge':/OPR\//.test(agent)?'Opera':/Firefox\/|FxiOS\//.test(agent)?'Firefox':/Chrome\/|CriOS\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Unknown browser';
 const operating_system=/iPhone/.test(agent)?'iPhone':/iPad/.test(agent)?'iPad':/Android/.test(agent)?'Android':/Windows/.test(agent)?'Windows':/Macintosh/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'Unknown OS';
 const device_identifier=typeof device==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device)?device:null;
 return {ip,browser_name,operating_system,device_category:!agent?'unknown':/iPad|Tablet/.test(agent)?'tablet':/Mobile|iPhone|Android/.test(agent)?'mobile':'desktop',device_identifier};
}
/** Only call with an access token already verified by Supabase Auth. */
export function authSessionId(token:string){try{const id=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id;return typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)?id:null;}catch{return null;}}
export async function registerDeviceSession(profile:string,session:string,token:string,metadata:ReturnType<typeof browserMetadata>){
 const {error}=await db.rpc('register_device_session_v1',{p_profile:profile,p_hash:sha256SessionIdentifier(session),p_auth:authSessionId(token),p_metadata:metadata});
 if(error)throw new AppSessionError('The device session could not be registered. Please sign in again.','SESSION_STORE_UNAVAILABLE');

}
export async function checkDeviceSession(profile:string,session:string|null,token:string,agent:string){
 if(!session)throw new AppSessionError('Please sign in again.','SESSION_REVOKED',401);
 const {data,error}=await db.rpc('check_device_session_v1',{p_profile:profile,p_hash:sha256SessionIdentifier(session),p_auth:authSessionId(token),p_metadata:browserMetadata(agent)});
 if(error)throw new AppSessionError('Device session verification is temporarily unavailable.','SESSION_STORE_UNAVAILABLE');
 if(data!=='ACTIVE')throw new AppSessionError(data==='ACCOUNT_LOCKED'?'Your account has been locked by an administrator. Please contact your administrator for assistance.':'This device session has been logged out. Please sign in again.',data==='ACCOUNT_LOCKED'?'ACCOUNT_LOCKED':'SESSION_REVOKED',data==='ACCOUNT_LOCKED'?403:401);
}
export async function revokeOwnDeviceSession(profile:string,session:string|null){
 if(!session)return;
 const {error}=await db.from('device_sessions').update({revoked_at:new Date().toISOString(),status:'REVOKED'}).eq('profile_id',profile).eq('session_hash',sha256SessionIdentifier(session)).is('revoked_at',null);
 if(error)throw new AppSessionError('Device logout could not be confirmed. Try again.','SESSION_STORE_UNAVAILABLE');
}
export async function activeDeviceSessions(ids:string[]){
 if(!ids.length)return [];
 const result=await db.from('device_sessions').select('id,profile_id,session_hash,browser_name,operating_system,device_category,created_at,last_activity_at,expires_at,status,role,approximate_location').in('profile_id',ids).is('revoked_at',null).eq('status','ACTIVE').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at',{ascending:false});
 if(result.error)throw new ApiError('Active sessions could not load. Retry loading.',503);
 const [truckers,staff]=await Promise.all([
  db.from('trucker_active_sessions').select('profile_id,session_hash').in('profile_id',ids),
  db.from('admin_staff_session_days').select('profile_id,session_hash').in('profile_id',ids).gt('expires_at',new Date().toISOString()),
 ]);
 if(truckers.error||staff.error)throw new ApiError('Active sessions could not be verified. Retry loading.',503);
 return (result.data??[]).filter(s=>(s.role==='TRUCKER'?truckers.data:staff.data)?.some(legacy=>legacy.profile_id===s.profile_id&&legacy.session_hash===s.session_hash));
}
export async function manageDeviceSecurity(actor:string,subject:string,action:string,session:string|null=null){
 const {error}=await db.rpc('manage_device_security_v1',{p_actor:actor,p_subject:subject,p_action:action,p_session:session});
 if(error)throw new ApiError(error.code==='22023'?'You cannot lock your own account.':error.code==='P0002'?'Account or session not found.':'Security change could not be confirmed. Refresh and retry.',error.code==='42501'?403:error.code==='P0002'?404:400);
 return {saved:true};
}
