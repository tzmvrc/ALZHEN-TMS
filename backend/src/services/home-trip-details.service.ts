import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {listOverviewTripImages} from "./trip-image.service.js";

/** A bounded parent set replaces two HTTP/authorization queries per dashboard trip. */
export async function homeTripDetails(input:unknown){
 if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=="string"||!isValidUuid(id)))throw new ApiError("Provide at most 100 trip IDs.",400);
 const ids=[...new Set(input)] as string[];
 if(!ids.length)return {events:[],images:[]};
 const events=async()=>{const result=await supabaseAdmin.from("trip_events").select("id,trip_id,assignment_id,trip_stop_id,event_type,event_time,recorded_by,notes,latitude,longitude,verification_method,delivery_metadata").in("trip_id",ids).order("event_time",{ascending:false}).order("id").limit(200);if(result.error)throw new ApiError("Unable to load dashboard activity.",503);return result.data;};
 const [activity,images]=await Promise.all([events(),listOverviewTripImages(ids)]);
 return {events:activity,images,activityWindow:200};
}
