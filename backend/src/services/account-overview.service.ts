import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
const db=supabaseAdmin as any;
type Row=Record<string,any>;
/** Bounded server pages; no full operational dataset is sent to a profile view. */
async function pages(query:(from:number,to:number)=>PromiseLike<{data:Row[]|null;error:unknown}>){
 const rows:Row[]=[];
 for(let offset=0;;offset+=200){const result=await query(offset,offset+199);if(result.error)throw new ApiError("Assigned work is temporarily unavailable.",503);rows.push(...result.data??[]);if((result.data?.length??0)<200)return rows;}
}
const complete=(stop:Row)=>Boolean(stop.finish_unloading_time)||String(stop.delivery_status).toUpperCase()==="COMPLETED";
export async function accountOverview(actor:{id:string;role:string},subject:string,daysInput:unknown){
 if(!/^[0-9a-f-]{36}$/i.test(subject))throw new ApiError("Invalid profile.",400);
 if(actor.id!==subject&&actor.role!=="ADMIN")throw new ApiError("You cannot view this account's work.",403);
 const days=[7,30,90].includes(Number(daysInput))?Number(daysInput):30,since=new Date(Date.now()-days*86400000).toISOString();
 const profile=await db.from("profiles").select("id,role").eq("id",subject).maybeSingle();
 if(profile.error||!profile.data)throw new ApiError("Profile is unavailable.",404);
 if(profile.data.role!=="TRUCKER"){
  const [trips,reports]=await Promise.all([
   db.from("trips").select("id",{count:"exact",head:true}).eq("created_by",subject).gte("created_at",since),
   pages((from,to)=>db.from("report_audit_logs").select("id,created_at").eq("actor_profile_id",subject).gte("created_at",since).order("id").range(from,to)).then(rows=>({rows,error:false})).catch(()=>({rows:[] as Row[],error:true})),
  ]);
  const daily=new Map<string,number>();for(const row of reports.rows){const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(row.created_at));daily.set(day,(daily.get(day)??0)+1);}
  return {kind:"office",metrics:[{key:"created",label:"Trips created",value:trips.error?null:trips.count},{key:"reports",label:"Report changes",value:reports.error?null:reports.rows.length}],daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([day,count])=>({day,count})),trips:[],coverage:`Last ${days} days. Trips are counted by their recorded creator. Report changes count recorded events by this account, not unique reports. Team activity is not included; totals cover retained records and available logs.`};
 }
 const driver=await db.from("drivers").select("id").eq("profile_id",subject).maybeSingle();
 if(driver.error)throw new ApiError("Driver details are unavailable.",503);
 const updates=driver.data?await db.from("driver_trip_updates").select("id,trip_id,status,delivery_status,updated_at,trips(dispatch_number,trip_number)").eq("driver_id",driver.data.id).order("updated_at",{ascending:false}).order("id").limit(8):{data:[],error:null};
 const assignments=driver.data?await pages((from,to)=>db.from("trip_truck_assignments").select("id,trip_id,stop_scope,assigned_at").eq("driver_id",driver.data.id).is("unassigned_at",null).order("id").range(from,to)):[];
 const tripIds=[...new Set(assignments.map(row=>row.trip_id))],trips:Row[]=[],stops:Row[]=[],responsibilities:Row[]=[],receipts:Row[]=[];
 for(let start=0;start<tripIds.length;start+=100){const ids=tripIds.slice(start,start+100),assignmentIds=assignments.filter(row=>ids.includes(row.trip_id)).map(row=>row.id);
  const result=await Promise.all([
   pages((from,to)=>db.from("trips").select("id,dispatch_number,trip_number,status,loading_date").in("id",ids).is("archived_at",null).order("id").range(from,to)),
   pages((from,to)=>db.from("trip_stops").select("id,trip_id,delivery_status,finish_unloading_time").in("trip_id",ids).is("archived_at",null).order("id").range(from,to)),
   pages((from,to)=>db.from("trip_assignment_stops").select("id,assignment_id,trip_stop_id").in("assignment_id",assignmentIds).order("id").range(from,to)),
   pages((from,to)=>db.from("trip_images").select("id,trip_stop_id,created_at,pod_review_status").in("trip_id",ids).eq("kind","receipt").order("id").range(from,to)),
  ]);trips.push(...result[0]);stops.push(...result[1]);responsibilities.push(...result[2]);receipts.push(...result[3]);
 }
 const ownedStops=new Map<string,Row>(),daily=new Map<string,number>();
 const recent=trips.filter(trip=>String(trip.status).toUpperCase()!=="CANCELLED").map(trip=>{
  const owned=assignments.filter(row=>row.trip_id===trip.id),all=owned.some(row=>row.stop_scope==="ALL"),assignmentIds=new Set(owned.map(row=>row.id));
  const ids=new Set(responsibilities.filter(row=>assignmentIds.has(row.assignment_id)).map(row=>row.trip_stop_id));
  const scoped=stops.filter(stop=>stop.trip_id===trip.id&&(all||ids.has(stop.id)));scoped.forEach(stop=>ownedStops.set(stop.id,stop));
  const done=["COMPLETED","DELIVERED","FINISHED"].includes(String(trip.status).toUpperCase())||(scoped.length>0&&scoped.every(complete));
  const dated=done&&scoped.length>0&&scoped.every(stop=>complete(stop)&&typeof stop.finish_unloading_time==="string"&&Number.isFinite(Date.parse(stop.finish_unloading_time)));
  const finished=dated?scoped.map(stop=>String(stop.finish_unloading_time)).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1):undefined;
  if(done&&finished&&Date.parse(finished)>=Date.parse(since)&&Date.parse(finished)<=Date.now()){const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(finished));daily.set(day,(daily.get(day)??0)+1);}
  return {id:trip.id,reference:String(trip.dispatch_number||trip.trip_number||"Assigned trip"),status:done?"Completed":trip.status||"Assigned",loading_date:trip.loading_date,completed:done,assigned_at:owned.map(row=>row.assigned_at).filter(Boolean).sort().at(-1)??null,stops:scoped.length};
 });
 const latestReceipt=new Map<string,Row>();for(const receipt of receipts){const previous=latestReceipt.get(receipt.trip_stop_id);if(!previous||String(receipt.created_at)>String(previous.created_at))latestReceipt.set(receipt.trip_stop_id,receipt);}
 const delivered=[...ownedStops.values()].filter(complete),submitted=new Set([...latestReceipt.values()].filter(row=>String(row.pod_review_status).toUpperCase()!=="REJECTED").map(row=>row.trip_stop_id));
 return {kind:"trucker",delivery_activity:(updates.data??[]).map((row:Row)=>({id:row.id,trip_id:row.trip_id,reference:String(row.trips?.dispatch_number||row.trips?.trip_number||"Trip update"),status:String(row.delivery_status||row.status||"Updated"),created_at:row.updated_at})),activity_unavailable:Boolean(updates.error),metrics:[{key:"assigned",label:"Assigned trips",value:recent.length},{key:"completed",label:"Completed assigned trips",value:recent.filter(row=>row.completed).length},{key:"deliveries",label:"Pending deliveries",value:[...ownedStops.values()].filter(stop=>!complete(stop)).length},{key:"pods",label:"Pending POD submissions",value:delivered.filter(stop=>!submitted.has(stop.id)).length}],daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([day,count])=>({day,count})),trips:recent.sort((a,b)=>String(b.assigned_at??"").localeCompare(String(a.assigned_at??""))).slice(0,8),coverage:`Current retained driver assignments, excluding cancelled or archived trips and archived stops. Delivery totals cover stops in this driver's assignments. POD count means completed assigned stops without a current non-rejected receipt; it does not mean pending admin review. The chart uses recorded completion timestamps from the last ${days} days; missing dates are not inferred.`};
}
