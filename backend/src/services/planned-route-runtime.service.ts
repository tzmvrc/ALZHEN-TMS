import {supabaseAdmin as db} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {createPlannedRouteService,type PlannedContext} from "./planned-route.service.js";
import {createMapboxDirections} from "./mapbox-directions.service.js";
import {destinationFingerprint} from "./tracking.logic.js";
import type {RouteRepository} from "./road-route.service.js";
export const plannedRoutesEnabled=()=>process.env.PLANNED_ROUTES_ENABLED==="true";
async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await db.rpc(name,args);if(error)throw new ApiError("Planned route persistence unavailable. Verify the approved setup.",503,"PLANNED_PERSISTENCE");return data;}
// The repository is actor-bound per request. Never derives actor from body fields.
function repository(actor:string):RouteRepository{return {
 read:async id=>{const {data:r,error}=await db.from("trip_route_cache").select("planned_revision,planned_fingerprint,planned_geometry,planned_calculated_at,planned_expires_at,planned_lease_expires_at,planned_retry_after,planned_distance_meters,planned_duration_seconds").eq("assignment_id",id).maybeSingle();if(error)throw new ApiError("Planned route cache unavailable.",503,"PLANNED_PERSISTENCE");return {revision:r?.planned_revision??0,fingerprint:r?.planned_fingerprint??null,calculatedAt:r?.planned_expires_at?Date.parse(r.planned_expires_at)-3600000:null,leaseUntil:r?.planned_lease_expires_at?Date.parse(r.planned_lease_expires_at):null,retryAfter:r?.planned_retry_after?Date.parse(r.planned_retry_after):null,route:r?.planned_geometry?{geometry:r.planned_geometry,distance_meters:r.planned_distance_meters,duration_seconds:r.planned_duration_seconds}:null};},
 claim:(p,v,t)=>rpc("planned_route_write_v1",{p_actor:actor,p_assignment:p.assignmentId,p_action:"CLAIM",p_token:t,p_context:p.assignmentRevision,p_fingerprint:destinationFingerprint(p.assignmentId,p.destinations,p.assignmentRevision),p_expected:v}),
 finish:(p,t,f,r)=>rpc("planned_route_write_v1",{p_actor:actor,p_assignment:p.assignmentId,p_action:"FINISH",p_token:t,p_context:p.assignmentRevision,p_fingerprint:f,p_geometry:r.geometry,p_distance:r.distance_meters,p_duration:r.duration_seconds}),
 fail:async(id,t,code)=>{await rpc("planned_route_write_v1",{p_actor:actor,p_assignment:id,p_action:"FAIL",p_token:t,p_context:null,p_fingerprint:null,p_error:code});},
};}
const directions=createMapboxDirections({token:()=>process.env.MAPBOX_DIRECTIONS_TOKEN});
// Shared in-process coalescing, durable SQL lease across processes. Keep bounded and
// discard after settle: no per-user singleton/service maps retained after logout.
const pending=new Map<string,Promise<unknown>>();
export async function generatePlannedRoute(actor:{id:string;role:string},id:string){
 if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Management routing access required.",403,"PLANNED_FORBIDDEN");
 if(!plannedRoutesEnabled())throw new ApiError("Planned routing is disabled pending approved activation.",503,"PLANNED_DISABLED");
 const key=`${actor.id}:${id}`;if(pending.has(key))return pending.get(key);
 if(pending.size>=32)throw new ApiError("Planned routing queue is busy.",503,"ROUTE_BUSY");
 const service=createPlannedRouteService({enabled:plannedRoutesEnabled,resolve:id=>rpc("planned_route_context_v1",{p_assignment:id,p_lock:false}) as Promise<PlannedContext|null>,repository:repository(actor.id),directions});
 const result=service(actor,id);pending.set(key,result);
 try{return await result;}finally{pending.delete(key);}
}
