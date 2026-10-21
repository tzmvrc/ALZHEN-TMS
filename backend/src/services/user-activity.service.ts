import type {Request,Response} from "express";
import {randomUUID} from "node:crypto";
import {supabaseAdmin} from "../config/supabase.js";
const db=supabaseAdmin as any;
const safeKeys=new Set(['first_name','last_name','contact_number','license_number','driver_status','driver_notes','name','code','plate_number','truck_type','capacity_cbm','status','notes','address','city','province','region','quantity','cbm','unit_cbm','dr_number','dispatch_number','trip_number','remarks','delivery_status','letter_status','warehouse_id','store_id','customer_id','product_id','driver_id','truck_id','trucking_company_id','column_key','column','field','value','trip_id','trip_stop_id','trip_line_item_id','assigned_truck_id']);
function safeFields(value:unknown){if(!value||typeof value!=='object'||Buffer.isBuffer(value))return {};return Object.fromEntries(Object.entries(value).filter(([key,v])=>safeKeys.has(key)&&(v===null||['string','number','boolean'].includes(typeof v))).map(([key,v])=>[key,typeof v==='string'?/(?:Bearer\s|eyJ[a-zA-Z0-9_-]{15,}\.)/.test(v)?'[private]':v.slice(0,1000):v]));}
/** Persist the authenticated intent before calling the service. Confirm its outcome
 * on the same audit ID before responding; never turn a committed save into a failure
 * when only audit reconciliation is interrupted. Existing transactional audits are excluded. */
export async function captureUserActivity(req:Request,res:Response){
 if(!req.user||!['POST','PATCH','PUT','DELETE'].includes(req.method))return;
 const path=req.originalUrl.split('?')[0];
 if(!/^\/api\/(?:master-data|trips|store-calls|users|reports|website)\b/.test(path))return;
 if(/\/(?:preview|read|columns|options|search|availability|assigned)(?:\/|$)/.test(path)||path.includes('formulas/read'))return;
 // These routes already write authoritative transaction/audit events exposed by v_user_activity.
 if(/\/api\/users\/(?!$)/.test(path)||/delete-records|\/deletion|\/operations\/|\/pod\//.test(path)||req.method==='DELETE')return;
 if(path.includes('/flexible-')||path.includes('/transmittal'))return;
 const module=path.split('/')[2],intent=randomUUID(),body=safeFields(req.body);
 const entity=path.split('/').find(part=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(part));
 let before:unknown=null;
 const master=path.match(/^\/api\/master-data\/(warehouses|trucks|trucking-companies|stores|store-contacts|products)\/([0-9a-f-]+)$/i);
 if(master&&req.method==='PATCH'){const sources:Record<string,string>={'trucking-companies':'trucking_companies',stores:'customer_stores','store-contacts':'store_contacts'};const keys=Object.keys(body);if(keys.length){const read=await db.from(sources[master[1]]??master[1]).select(keys.join(',')).eq('id',master[2]).maybeSingle();if(!read.error)before=safeFields(read.data);}}
 const context={module,columns:Object.keys(body),route:path.slice(0,250),actor_name:[req.profile?.first_name,req.profile?.last_name].filter(Boolean).join(' '),...body};
 const started=await db.from('audit_logs').insert({id:intent,user_id:req.user.id,action:'REQUEST_STARTED',entity_type:module,entity_id:entity??null,old_data:before,new_data:{...context,result:'STARTED'}});
 if(started.error){console.error('Activity intent could not be recorded',{code:started.error.code});throw Error('Activity recording is temporarily unavailable. No change was started.');}
 const original=res.json.bind(res);let finalized=false;
 res.json=((payload:any)=>{
  if(finalized)return res;finalized=true;
  const success=res.statusCode>=200&&res.statusCode<300&&payload?.success!==false;
  const requestType=path.includes('reject')?'REJECTED':path.includes('accept')||path.includes('approve')?'APPROVED':req.method==='POST'?'CREATED':'EDITED';
  const newData={...context,result:success?'SUCCESS':'FAILED',...(success?safeFields(payload?.data?.record??payload?.data?.trip??payload?.data):{})};
  const action=`${module.replaceAll('-','_').toUpperCase()}_${requestType}`;
  void (async()=>{
   const saved=await db.from('audit_logs').update({action,new_data:newData}).eq('id',intent);
   if(saved.error){console.error('Confirmed activity outcome queued for retry',{code:saved.error.code});const queued=await db.from('user_maintenance_jobs').insert({profile_id:req.user!.id,kind:'FINALIZE_ACTIVITY',dedupe_key:'activity:'+intent,payload:{id:intent,action,new_data:newData}});if(queued.error)console.error('Activity outcome retry could not be queued; intent is retained');}
  })().catch(()=>console.error('Activity outcome was not confirmed; intent is retained')).finally(()=>{original(payload);});
  return res;
 }) as typeof res.json;
}
