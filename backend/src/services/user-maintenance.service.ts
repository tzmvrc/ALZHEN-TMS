import {supabaseAdmin} from "../config/supabase.js";
const db=supabaseAdmin as any;
export function startUserMaintenanceWorker(){
 let stopped=false,running=false;
 const run=async()=>{if(stopped||running)return;running=true;try{
  const {data,error}=await db.rpc('claim_user_maintenance_v1');if(error){console.error('User maintenance queue unavailable',{code:error.code});return;}
  for(const job of data??[]){if(stopped)break;try{
   if(job.kind==='DISABLE_AUTH'){const result=await supabaseAdmin.auth.admin.updateUserById(job.profile_id,{ban_duration:'876000h'});if(result.error)throw result.error;}
   else if(job.kind==='FINALIZE_ACTIVITY'){const result=await db.from('audit_logs').update({action:job.payload.action,new_data:job.payload.new_data}).eq('id',job.payload.id);if(result.error)throw result.error;}
   else{
    const path=job.payload?.path;if(typeof path!=='string'||!path.startsWith(job.profile_id+'/')||path.includes('..'))throw Error('Unverified ownership');
    const references=await db.from('profiles').select('id',{count:'exact',head:true}).eq('profile_picture_path',path);if(references.error)throw references.error;
    if(references.count)throw Error('Picture is still referenced; keep its cleanup reservation for later.');
    const result=await supabaseAdmin.storage.from('profile-pictures').remove([path]);if(result.error)throw result.error;
   }
   const complete=await db.from('user_maintenance_jobs').update({state:'DONE',last_error:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('attempts',job.attempts);if(complete.error)console.error('User maintenance completion needs reconciliation');
  }catch{await db.from('user_maintenance_jobs').update({state:'PENDING',lease_until:null,last_error:'Operation needs retry',next_attempt_at:new Date(Date.now()+Math.min(60*60_000,10000*2**Math.min(job.attempts,8))).toISOString()}).eq('id',job.id).eq('attempts',job.attempts);}
  }
 }finally{running=false;}};
 const timer=setInterval(()=>void run().catch(()=>console.error('User maintenance retry deferred')),15000);timer.unref();return()=>{stopped=true;clearInterval(timer);};
}
