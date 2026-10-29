import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';

/** Read-only projection of immutable review audit rows, never physical trip events. */
export async function podReviewTimeline(trip:string,assignment?:string,before?:{time:string;id:string},limit=500){
 const events:any[]=[];let cursor=before,scanned=0;
 // Audit rows intentionally outlive their documents and have no receipt FK.
 // Join in the service, filtering the exact assignment before returning a page.
 for(;;){
  let query=db.from('pod_review_events').select('id,trip_id,trip_stop_id,receipt_id,decision,reason,created_at,actor_profile_id,actor_snapshot').eq('trip_id',trip).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);
  if(cursor)query=query.or(`created_at.lt.${cursor.time},and(created_at.eq.${cursor.time},id.lt.${cursor.id})`);
  const {data,error}=await query;if(error)throw new ApiError('POD review history could not load. Please retry.',503,'POD_HISTORY_UNAVAILABLE');
  const rows=data??[];if(!rows.length)return events;
  let images=db.from('trip_images').select('id,assignment_id,delivery_event_id,dr_number').eq('trip_id',trip).in('id',[...new Set(rows.map(row=>row.receipt_id))]);
  if(assignment)images=images.eq('assignment_id',assignment);
  const receipts=await images;if(receipts.error)throw new ApiError('POD submission links could not load. Please retry.',503,'POD_HISTORY_UNAVAILABLE');
  const byId=new Map((receipts.data??[]).map(receipt=>[receipt.id,receipt]));
  for(const row of rows){const receipt=byId.get(row.receipt_id);if(!receipt?.assignment_id||!receipt.delivery_event_id)continue;
   events.push({id:row.id,trip_id:row.trip_id,trip_stop_id:row.trip_stop_id,assignment_id:receipt.assignment_id,event_type:row.decision==='REJECTED'?'POD_REJECTED':'POD_APPROVED',event_time:row.created_at,created_at:row.created_at,device_time:null,recorded_by:row.actor_profile_id,latitude:null,longitude:null,accuracy_meters:null,verification_method:'ADMIN_REVIEW',delivery_version:0,notes:row.reason,actor:{first_name:row.actor_snapshot,last_name:''},delivery_metadata:{pod_review_event_id:row.id,receipt_id:row.receipt_id,source_delivery_event_id:receipt.delivery_event_id,dr_number:receipt.dr_number},attachments:[]});
   if(events.length===limit)return events;
  }
  if(rows.length<200)return events;scanned+=rows.length;if(scanned>=10000)throw new ApiError('POD review history exceeds the timeline limit.',409);
  const last=rows.at(-1)!;cursor={time:last.created_at,id:last.id};
 }

}

export async function allPodReviewTimeline(trip:string){
 const rows:Awaited<ReturnType<typeof podReviewTimeline>>=[];
 let before:{time:string;id:string}|undefined;
 for(;;){const page=await podReviewTimeline(trip,undefined,before);rows.push(...page);if(page.length<500)return rows;if(rows.length>=10000)throw new ApiError('POD review history exceeds the timeline limit.',409);const last=page.at(-1)!;before={time:last.event_time,id:last.id};}
}
