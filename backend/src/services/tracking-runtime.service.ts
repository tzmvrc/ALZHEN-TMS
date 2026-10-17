import {EventEmitter} from "node:events";
import {supabaseAdmin as db} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {createTrackingService,type TrackingRepository,type TrackingAssignment} from "./tracking.service.js";
import {createRoadRouteService,type RouteRepository,type AuthorizedRoutePlan} from "./road-route.service.js";
import {createMapboxDirections} from "./mapbox-directions.service.js";
import {destinationFingerprint} from "./tracking.logic.js";
import {trackingTestScope,assertTrackingTestScope} from "./tracking-test-scope.js";

export const trackingEvents=new EventEmitter();
export const trackingEnabled=()=>process.env.TRACKING_ENABLED==="true";
export function requireTracking(){if(!trackingEnabled())throw new ApiError("Location sharing is not enabled.",503,"TRACKING_DISABLED");trackingTestScope();}
async function rpc(name:string,args:Record<string,unknown>){
 const {data,error}=await db.rpc(name,args);
 if(error)throw new ApiError(error.code==="42501"?"Tracking assignment access denied.":error.code==="54000"?"Location updates are too frequent. Wait a moment.":"Tracking persistence is unavailable. Check approved schema setup.",error.code==="42501"?403:error.code==="54000"?429:503,"TRACKING_UNAVAILABLE");
 return data;
}
function mutation(a:TrackingAssignment,session:string,action:string,fix:Record<string,unknown>={}){
 if(action!=="STOP")assertTrackingTestScope(a.profileId,a.id);
 return rpc("tracking_write_v1",{p_actor:a.profileId,p_assignment:a.id,p_revision:a.revision,p_session:session,p_action:action,...fix});
}
const locations:TrackingRepository={
 assignment:id=>rpc("tracking_assignment_v1",{p_id:id}),
 begin:async(a,s)=>{await mutation(a,s,"START");},
 capture:(a,s,f)=>mutation(a,s,"CAPTURE",{p_lat:f.latitude,p_lng:f.longitude,p_accuracy:f.accuracy_meters,p_captured:f.captured_at}),
 stop:(a,s)=>mutation(a,s,"STOP"),
 latest:async id=>{const ctx=await rpc("tracking_route_context_v1",{p_assignment:id});return ctx?.origin?{...ctx.origin,enabled:true}:null;},
};
export const liveTracking=createTrackingService(locations);
const routes:RouteRepository={
 read:async id=>{const {data:r,error}=await db.from("trip_route_cache").select("*").eq("assignment_id",id).maybeSingle();if(error)throw new ApiError("Route cache unavailable.",503,"TRACKING_UNAVAILABLE");return {revision:r?.revision??0,fingerprint:r?.destination_fingerprint??null,calculatedAt:r?.calculated_at?Date.parse(r.calculated_at):null,leaseUntil:r?.lease_expires_at?Date.parse(r.lease_expires_at):null,retryAfter:r?.retry_after?Date.parse(r.retry_after):null,route:r?.route_geometry?{geometry:r.route_geometry,distance_meters:r.distance_meters,duration_seconds:r.duration_seconds}:null};},
 claim:(p,v,t)=>rpc("tracking_route_write_v1",{p_assignment:p.assignmentId,p_action:"CLAIM",p_token:t,p_context:p.assignmentRevision,p_fingerprint:destinationFingerprint(p.assignmentId,p.destinations,p.assignmentRevision),p_expected:v}),
 finish:(p,t,f,r)=>rpc("tracking_route_write_v1",{p_assignment:p.assignmentId,p_action:"FINISH",p_token:t,p_context:p.assignmentRevision,p_fingerprint:f,p_geometry:r.geometry,p_distance:r.distance_meters,p_duration:r.duration_seconds}),
 fail:async(id,t,code)=>{await rpc("tracking_route_write_v1",{p_assignment:id,p_action:"FAIL",p_token:t,p_context:null,p_fingerprint:null,p_error:code});},
};
const directions=createMapboxDirections({token:()=>process.env.MAPBOX_DIRECTIONS_TOKEN});
const refreshRoute=createRoadRouteService(routes,directions);
type Context={id:string;tripId:string;profileId:string;context_token:string;active:boolean;plate_number:string|null;dispatch_number:string|null;origin:{id:string;latitude:number;longitude:number;captured_at:string;accuracy_meters:number}|null;destinations:Array<{id:string;name:string;latitude:number|null;longitude:number|null}>};
type FeedRow={context:Context;cache:{destination_fingerprint:string;route_geometry:unknown}|null};
function plan(ctx:Context):AuthorizedRoutePlan{
 const points=ctx.destinations??[];
 const valid=points.length>0&&points.length<=24&&points.every((p:Record<string,unknown>)=>typeof p.latitude==="number"&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&typeof p.longitude==="number"&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180);
 const fresh=ctx.origin&&Date.now()-Date.parse(ctx.origin.captured_at)<120000;
 return {assignmentId:ctx.id,assignmentRevision:ctx.context_token,active:ctx.active,origin:valid&&fresh?ctx.origin:null,destinations:valid?points.map(p=>({...p,latitude:p.latitude!,longitude:p.longitude!})):[]};
}
export async function trackingFeed(actorId:string,after:string|null){
 requireTracking();const rows=await rpc("tracking_feed_v1",{p_actor:actorId,p_after:after,p_limit:50});
 const page=rows.slice(0,50),next=rows.length>50?page.at(-1).context.id:null,scope=trackingTestScope();
 return {rows:page.filter((row:FeedRow)=>!scope||row.context.id===scope.assignmentId&&row.context.profileId===scope.profileId).map(({context:c,cache:r}:FeedRow)=>{
  const p=plan(c),fingerprint=p.destinations.length?destinationFingerprint(p.assignmentId,p.destinations,p.assignmentRevision):null;
  return {assignmentId:c.id,tripId:c.tripId,plateNumber:c.plate_number??"Truck",dispatchNumber:c.dispatch_number,
   latitude:c.origin!.latitude,longitude:c.origin!.longitude,capturedAt:c.origin!.captured_at,accuracyMeters:c.origin!.accuracy_meters,active:c.active,
   destinations:(c.destinations??[]).filter((s:Record<string,unknown>)=>typeof s.latitude==="number"&&typeof s.longitude==="number"),
   geometry:r?.destination_fingerprint===fingerprint?r.route_geometry:null};
 }),next};
}
// One bounded page per tick; rotates through active assignments instead of loading
// all history. Durable SQL leases/budget make multiple Node replicas safe.
export function startTrackingWorker(){
 let busy=false,after:string|null=null,stopped=false,lastPrune=0;
 let wakeTimer:ReturnType<typeof setTimeout>|null=null;
 const tick=async()=>{
  if(!trackingEnabled()||busy||stopped)return;busy=true;
  try{
   const scope=trackingTestScope();
   const {data:actor}=await db.from("profiles").select("id").in("role",["ADMIN","STAFF"]).order("id").limit(1).maybeSingle();if(!actor)return;
   const rows=await rpc("tracking_feed_v1",{p_actor:actor.id,p_after:after,p_limit:50}),rawPage=rows.slice(0,50),page=rawPage.filter((row:FeedRow)=>!scope||row.context.id===scope.assignmentId&&row.context.profileId===scope.profileId);
   after=rows.length>50?rawPage.at(-1).context.id:null;
   for(let i=0;i<page.length&&!stopped;i+=2)await Promise.all(page.slice(i,i+2).map(async(row:FeedRow)=>{const result=await refreshRoute(plan(row.context));if(result.state==="UPDATED")trackingEvents.emit("changed",{assignmentId:row.context.id});}));
   // Acceptance mode must not prune unrelated retained GPS/cache rows.
   if(!scope&&Date.now()-lastPrune>3600000){await rpc("prune_tracking_v1",{});lastPrune=Date.now();}
  }catch{ /* Flag remains reversible; APIs expose setup errors without leaking SQL. */ }
  finally{busy=false;}
 };
 const wake=()=>{if(wakeTimer||!trackingEnabled())return;wakeTimer=setTimeout(()=>{wakeTimer=null;void tick();},500);wakeTimer.unref();};
 trackingEvents.on("routes",wake);trackingEvents.on("changed",wake);
 const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);if(wakeTimer)clearTimeout(wakeTimer);trackingEvents.off("routes",wake);trackingEvents.off("changed",wake);};
}
export const trackingMetrics=()=>directions.metrics();
