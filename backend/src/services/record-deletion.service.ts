import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {collaborationEvents} from "./collaboration-events.js";
type Actor={id:string;role:string};
const allowed=(actor:Actor)=>{if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Access denied.",403);};
let capabilityRead:Promise<{storeCalls:boolean;emptyStops:boolean}>|undefined;
let capabilityUntil=0;
/** Metadata GET only: never probe a destructive RPC to discover its availability. */
export async function recordDeletionCapabilities(actor:Actor){allowed(actor);if(capabilityRead&&Date.now()<capabilityUntil)return capabilityRead;capabilityUntil=Date.now()+30000;
 capabilityRead=(async()=>{try{const key=process.env.SUPABASE_SERVICE_ROLE_KEY!,response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/openapi+json"},signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const schema=await response.json();const has=(name:string)=>Boolean(schema.paths?.[`/rpc/${name}`]);return {storeCalls:has("delete_store_call_record_v1"),emptyStops:has("delete_empty_trip_stop_v1")};}catch{capabilityUntil=0;return {storeCalls:false,emptyStops:false};}})();return capabilityRead;
}
export async function deletePhysicalRecord(actor:Actor,source:"store_calls"|"trip_stops",id:string,version:unknown,tripId?:string){
 allowed(actor);if(!isValidUuid(id)||!isValidUuid(actor.id)||source==="trip_stops"&&(!tripId||!isValidUuid(tripId)))throw new ApiError("Invalid physical record identity.",400);
 if(!Number.isSafeInteger(version)||Number(version)<0)throw new ApiError("Reload this record before deleting.",400);
 const fn=source==="store_calls"?"delete_store_call_record_v1":"delete_empty_trip_stop_v1";
 const {data,error}=await supabaseAdmin.rpc(fn,{p_id:id,p_actor:actor.id,p_expected_version:version,...(source==="trip_stops"?{p_trip:tripId}:{})});
 if(error){if(["42883","PGRST202"].includes(error.code))throw new ApiError("Record deletion requires the reviewed database function. Nothing was deleted.",503,"RECORD_DELETE_MIGRATION_REQUIRED");if(error.code==="P0002")throw new ApiError("The selected record no longer exists.",404);if(error.code==="40001")throw new ApiError("The record changed. Reload and review it before retrying.",409);if(["55000","23503","23514"].includes(error.code))throw new ApiError("Related records prevent this deletion. Nothing was deleted.",409);if(error.code==="42501")throw new ApiError("Access denied.",403);throw new ApiError("Deletion could not be confirmed. Reload before retrying the same record.",503);}
 if(!data||data.id!==id||!isValidUuid(data.trip_id)||source==="trip_stops"&&data.trip_id!==tripId)throw new ApiError("Deletion outcome could not be confirmed. Reload the selected record.",503);
 collaborationEvents.emit("commit",{source,recordId:id,tripId:data.trip_id,...(source==="trip_stops"?{stopId:id}:{}),fields:[],version:null,operation:"DELETE",actorId:actor.id,eventId:`${source}:${id}:deleted`});
 return data;
}
