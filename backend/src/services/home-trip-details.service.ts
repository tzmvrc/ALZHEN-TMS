import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {listOverviewTripImages} from "./trip-image.service.js";

/** A bounded parent set replaces two HTTP/authorization queries per dashboard trip. */
export async function homeTripDetails(input:unknown){
 if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=="string"||!isValidUuid(id)))throw new ApiError("Provide at most 100 trip IDs.",400);
 const ids=[...new Set(input)] as string[];
 if(!ids.length)return {events:[],images:[]};
 const events=async()=>{const rows:Record<string,unknown>[]=[];for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from("trip_events").select("*").in("trip_id",ids).order("event_time").order("id").range(offset,offset+999);if(result.error)throw new ApiError("Unable to load dashboard activity.",503);rows.push(...result.data);if(result.data.length<1000)return rows;}};
 const [activity,images]=await Promise.all([events(),listOverviewTripImages(ids)]);
 return {events:activity,images};
}
