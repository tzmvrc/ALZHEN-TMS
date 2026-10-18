import {supabaseAdmin as db} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {destinationFingerprint} from "./tracking.logic.js";
import {trackingTestScope} from "./tracking-test-scope.js";

type Row=Record<string,unknown>;
export function coordinatePair(lat:unknown,lng:unknown){
 if(lat===null||lng===null||lat===undefined||lng===undefined||lat===""||lng==="")return null;
 const latitude=Number(lat),longitude=Number(lng);
 return Number.isFinite(latitude)&&Math.abs(latitude)<=90&&Number.isFinite(longitude)&&Math.abs(longitude)<=180?{latitude,longitude}:null;
}
export function parseRoadTripIds(value:unknown){
 const ids=typeof value==="string"?value.split(","):[];
 if(!ids.length||ids.length>50||ids.some(id=>!isValidUuid(id))||new Set(ids).size!==ids.length)throw new ApiError("Select up to 50 distinct physical trip IDs.",400,"ROAD_TRIPS_INVALID");return ids;
}
async function read(table:string,fields:string,field:string,ids:string[],limit=1251){
 if(!ids.length)return [];
 const {data,error}=await db.from(table).select(fields).in(field,ids).limit(limit);
 if(error||!data||data.length>=limit)throw new ApiError("Road route data unavailable or exceeds its read budget.",503,"ROAD_READ_FAILED");return data as unknown as Row[];
}
/** Read-only: never invokes Directions, claims a lease, writes GPS or prunes data.
 * Works with tracking disabled so planned warehouse/stops can be inspected safely. */
export async function readRoadRouting(actor:{id:string;role:string},tripIds:string[]){
 if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Road routing access denied.",403,"ROAD_FORBIDDEN");
 parseRoadTripIds(tripIds.join(","));
 const [tripRows,stopRows,assignmentRows]=await Promise.all([
  read("trips","id,dispatch_number,warehouse_id,status,archived_at","id",tripIds,51),
  read("trip_stops","id,trip_id,store_id,stop_sequence,delivery_status,archived_at","trip_id",tripIds),
  read("trip_truck_assignments","id,trip_id,driver_id,truck_id,unassigned_at","trip_id",tripIds,251),
 ]);
 const trips=tripRows.filter(t=>!t.archived_at),validTrips=new Set(trips.map(t=>t.id));
 const stops=stopRows.filter(s=>validTrips.has(s.trip_id)&&!s.archived_at);
 const assignments=assignmentRows.filter(a=>validTrips.has(a.trip_id)&&!a.unassigned_at);
 const ids=(rows:Row[],key:string)=>[...new Set(rows.map(r=>r[key]).filter((v):v is string=>typeof v==="string"))];
 const [warehouses,stores,trucks,drivers,locations,caches]=await Promise.all([
  read("warehouses","id,name,latitude,longitude","id",ids(trips,"warehouse_id"),51),
  read("customer_stores","id,name,latitude,longitude","id",ids(stops,"store_id")),
  read("trucks","id,plate_number","id",ids(assignments,"truck_id"),251),
  read("drivers","id,profile_id,first_name,last_name","id",ids(assignments,"driver_id"),251),
  read("trip_tracking_locations","assignment_id,profile_id,latitude,longitude,accuracy_meters,captured_at,enabled","assignment_id",ids(assignments,"id"),251),
  read("trip_route_cache","assignment_id,destination_fingerprint,route_geometry,calculated_at,distance_meters,duration_seconds,last_error_code,planned_fingerprint,planned_geometry,planned_calculated_at,planned_expires_at,planned_distance_meters,planned_duration_seconds,planned_error","assignment_id",ids(assignments,"id"),251),
 ]);
 const scope=trackingTestScope(),contexts=new Map<string,Row>(),plannedContexts=new Map<string,Row>();
 // Only cached assignments need the existing exact context check. Bounded pairs,
 // no split writes or broad snapshot; old context must never be presented as current.
 for(let i=0;i<caches.length;i+=2)await Promise.all(caches.slice(i,i+2).map(async cache=>{
  if(cache.route_geometry){const {data,error}=await db.rpc("tracking_route_context_v1",{p_assignment:cache.assignment_id,p_lock:false});if(!error&&data)contexts.set(String(cache.assignment_id),data);}
  if(cache.planned_geometry){const planned=await db.rpc("planned_route_context_v1",{p_assignment:cache.assignment_id,p_lock:false});if(!planned.error&&planned.data)plannedContexts.set(String(cache.assignment_id),planned.data);}
 }));
 return trips.flatMap(trip=>{
  const warehouse=warehouses.find(w=>w.id===trip.warehouse_id);
  const ordered=stops.filter(s=>s.trip_id===trip.id).sort((a,b)=>Number(a.stop_sequence??Infinity)-Number(b.stop_sequence??Infinity)||String(a.id).localeCompare(String(b.id))).map((stop,index)=>{
   const store=stores.find(s=>s.id===stop.store_id);
   return {id:String(stop.id),sequence:index+1,stopSequence:stop.stop_sequence??null,status:String(stop.delivery_status??"PENDING"),name:String(store?.name??"Destination unavailable"),point:coordinatePair(store?.latitude,store?.longitude)};
  });
  const owned=assignments.filter(a=>a.trip_id===trip.id);
  return (owned.length?owned:[null]).map(assignment=>{
   const driver=drivers.find(d=>d.id===assignment?.driver_id),truck=trucks.find(t=>t.id===assignment?.truck_id);
   const location=locations.find(l=>l.assignment_id===assignment?.id&&l.profile_id===driver?.profile_id&&l.enabled&&(!scope||l.assignment_id===scope.assignmentId&&l.profile_id===scope.profileId));
   const cache=caches.find(c=>c.assignment_id===assignment?.id),context=contexts.get(String(assignment?.id));
   let cacheMatches=false;
   try{cacheMatches=!!context&&cache?.destination_fingerprint===destinationFingerprint(String(assignment?.id),context.destinations as Parameters<typeof destinationFingerprint>[1],String(context.context_token));}catch{/* Missing/invalid destination coordinates never become a guessed route. */}
   const plannedContext=plannedContexts.get(String(assignment?.id));let plannedMatches=false;
   try{plannedMatches=!!plannedContext&&cache?.planned_fingerprint===destinationFingerprint(String(assignment?.id),plannedContext.destinations as Parameters<typeof destinationFingerprint>[1],String(plannedContext.context_token));}catch{/* Do not use changed/missing planned inputs. */}
   return {key:String(assignment?.id??`trip:${trip.id}`),assignmentId:assignment?.id??null,tripId:String(trip.id),dispatchNumber:trip.dispatch_number??null,tripStatus:trip.status,
    plateNumber:truck?.plate_number??null,driverName:[driver?.first_name,driver?.last_name].filter(Boolean).join(" ")||null,
    warehouse:{id:trip.warehouse_id??null,name:String(warehouse?.name??"Warehouse unavailable"),point:coordinatePair(warehouse?.latitude,warehouse?.longitude)},stops:ordered,
    position:location&&coordinatePair(location.latitude,location.longitude)?{...coordinatePair(location.latitude,location.longitude)!,capturedAt:location.captured_at,accuracyMeters:location.accuracy_meters}:null,
    plannedCache:cache?.planned_geometry?{mode:"planned",matchesContext:plannedMatches,geometry:cache.planned_geometry,calculatedAt:cache.planned_calculated_at,expiresAt:cache.planned_expires_at,distanceMeters:cache.planned_distance_meters,durationSeconds:cache.planned_duration_seconds,error:cache.planned_error?"Last planned refresh failed":null}:null,
    cache:cache?{mode:"remaining",matchesContext:cacheMatches,geometry:cache.route_geometry,calculatedAt:cache.calculated_at,distanceMeters:cache.distance_meters,durationSeconds:cache.duration_seconds,error:cache.last_error_code?"Last route refresh failed":null}:null};
  });
 });
}
