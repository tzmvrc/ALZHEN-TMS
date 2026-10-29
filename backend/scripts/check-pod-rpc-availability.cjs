// Safe live readiness probe: NULL actors/assignments cannot authorize any write.
require('dotenv').config({quiet:true});
const functions={
 review_pod_submission_v1:{p_actor_id:null,p_request_id:crypto.randomUUID(),p_trip_id:null,p_stop_id:null,p_receipt_id:null,p_expected_review_version:0,p_expected_ocr_version:0,p_decision:'REJECTED',p_reason:'Migration readiness probe',p_reviewed_fields:{},p_pod_record_id:null},
 submit_pod_replacement_v1:{p_actor:null,p_assignment:null,p_key:crypto.randomUUID(),p_input:{type:'POD_SUBMITTED'}}
};
(async()=>{
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase service configuration is unavailable.');
 for(const [name,body] of Object.entries(functions)){
  const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const result=await response.json();const passed=response.status===403&&result.code==='42501';
  console.log(JSON.stringify({function:name,status:response.status,code:result.code,postgrestResolved:passed,nullActorDenied:passed}));
  if(!passed)throw Error('POD RPC availability or authorization check failed for '+name);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
