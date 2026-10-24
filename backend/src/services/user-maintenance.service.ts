import {supabaseAdmin} from "../config/supabase.js";
import {createAdaptiveWorker} from '../utils/adaptive-worker.js';
import {withSupabaseDeadline} from '../utils/supabase-request-scope.js';
const db=supabaseAdmin as any;
let worker:ReturnType<typeof createAdaptiveWorker>|undefined;
export const wakeUserMaintenance=()=>worker?.wake();
export const userMaintenanceMetrics=()=>worker?.metrics();
export function startUserMaintenanceWorker(){
 if(worker)return()=>{};
 let stopped=false;
 const current=createAdaptiveWorker({name:'user_maintenance',run:async()=>{
  const {data,error}=await db.rpc('claim_user_maintenance_v1').abortSignal(AbortSignal.timeout(10_000)).retry(false);if(error)throw Error('User maintenance queue unavailable');
  let deferred=false;
  for(const job of data??[]){if(stopped)break;try{
   await withSupabaseDeadline(15_000,async()=>{
   if(job.kind==='DISABLE_AUTH'){const result=await supabaseAdmin.auth.admin.updateUserById(job.profile_id,{ban_duration:'876000h'});if(result.error)throw result.error;}
   else if(job.kind==='FINALIZE_ACTIVITY'){const result=await db.from('audit_logs').update({action:job.payload.action,new_data:job.payload.new_data}).eq('id',job.payload.id);if(result.error)throw result.error;}
   else if(job.kind==='CLEANUP_PICTURE'){
    const path=job.payload?.path;if(typeof path!=='string'||!path.startsWith(job.profile_id+'/')||path.includes('..'))throw Error('Unverified ownership');
    const references=await db.from('profiles').select('id',{count:'exact',head:true}).eq('profile_picture_path',path);if(references.error)throw references.error;
    if(references.count)throw Error('Picture is still referenced; keep its cleanup reservation for later.');
    const result=await supabaseAdmin.storage.from('profile-pictures').remove([path]);if(result.error)throw result.error;
   }else throw Error('Unknown maintenance job');
   });
   const complete=await db.from('user_maintenance_jobs').update({state:'DONE',last_error:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('attempts',job.attempts).eq('state','WORKING').abortSignal(AbortSignal.timeout(5_000)).retry(false);deferred ||= Boolean(complete.error);
  }catch{deferred=true;await db.from('user_maintenance_jobs').update({state:'PENDING',lease_until:null,last_error:'Operation needs retry',next_attempt_at:new Date(Date.now()+Math.min(60*60_000,10000*2**Math.min(job.attempts,8))).toISOString()}).eq('id',job.id).eq('attempts',job.attempts).eq('state','WORKING').abortSignal(AbortSignal.timeout(5_000)).retry(false);}
  }
  if(deferred)throw Error('User maintenance operation remains queued');
  return data?.length??0;
 }});worker=current;
 return()=>{stopped=true;current.stop();if(worker===current)worker=undefined;};
}
