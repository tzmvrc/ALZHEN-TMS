import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {listOverviewTripImages} from "./trip-image.service.js";

async function overviewBookingRows(ids:string[]){
 const page=async(table:"trip_stops"|"trip_truck_assignments",projection:string,activeColumn:string)=>{
  const rows:Record<string,any>[]=[];
  for(let offset=0;offset<2500;offset+=500){
   const result=await supabaseAdmin.from(table).select(projection).in("trip_id",ids).is(activeColumn,null).order("id").range(offset,offset+499);
   if(result.error)throw new ApiError("Overview trip details could not load.",503,"OVERVIEW_DETAILS_UNAVAILABLE");
   rows.push(...(result.data??[]));
   if((result.data?.length??0)<500)return {rows,limited:false};
  }
  return {rows,limited:true};
 };
 const [trips,stops,assignments]=await Promise.all([
  supabaseAdmin.from("trips").select("id,warehouse_id,warehouse:warehouses(code,name)").in("id",ids).is("archived_at",null),
  page("trip_stops","id,trip_id,store_id,delivery_status,finish_unloading_time,store:customer_stores(name)","archived_at"),
  page("trip_truck_assignments","id,trip_id,truck_id,truck:trucks(plate_number),driver:drivers(first_name,last_name)","unassigned_at"),
 ]);
 if(trips.error)throw new ApiError("Overview trip details could not load.",503,"OVERVIEW_DETAILS_UNAVAILABLE");
 const one=(value:any)=>Array.isArray(value)?value[0]:value;
 const base=new Map((trips.data??[]).map(trip=>[trip.id,{trip_id:trip.id,_trip_id:trip.id,warehouse_id:trip.warehouse_id,_warehouse_id:trip.warehouse_id,warehouse_name:one(trip.warehouse)?.name??null,warehouse_code:one(trip.warehouse)?.code??null}]));
 const bookingRows:Record<string,unknown>[]=[];
 for(const stop of stops.rows){const parent=base.get(stop.trip_id);if(!parent)continue;bookingRows.push({...parent,trip_stop_id:stop.id,_trip_stop_id:stop.id,store_id:stop.store_id,_store_id:stop.store_id,store_name:one(stop.store)?.name??null,delivery_status:stop.delivery_status,finish_unloading_time:stop.finish_unloading_time});}
 for(const assignment of assignments.rows){const parent=base.get(assignment.trip_id);if(!parent)continue;bookingRows.push({...parent,assignment_id:assignment.id,_assignment_id:assignment.id,truck_id:assignment.truck_id,_truck_id:assignment.truck_id,plate_number:one(assignment.truck)?.plate_number??null,driver_name:[one(assignment.driver)?.first_name,one(assignment.driver)?.last_name].filter(Boolean).join(" ")});}
 for(const parent of base.values())if(!bookingRows.some(row=>row.trip_id===parent.trip_id))bookingRows.push(parent);
 return {bookingRows,bookingLimited:stops.limited||assignments.limited};
}

/** A bounded parent set replaces two HTTP/authorization queries per dashboard trip. */
export async function homeTripDetails(input:unknown){
 if(!Array.isArray(input)||input.length>100||input.some(id=>typeof id!=="string"||!isValidUuid(id)))throw new ApiError("Provide at most 100 trip IDs.",400);
 const ids=[...new Set(input)] as string[];
 if(!ids.length)return {events:[],images:[],bookingRows:[],bookingUnavailable:false,bookingLimited:false};
 const events=async()=>{const result=await supabaseAdmin.from("trip_events").select("id,trip_id,assignment_id,trip_stop_id,event_type,event_time,recorded_by,notes,latitude,longitude,verification_method,delivery_metadata").in("trip_id",ids).order("event_time",{ascending:false}).order("id").limit(200);if(result.error)throw new ApiError("Unable to load dashboard activity.",503);return result.data;};
 const [activity,images,booking]=await Promise.all([events(),listOverviewTripImages(ids),overviewBookingRows(ids).catch(()=>null)]);
 return {events:activity,images,activityWindow:200,bookingRows:booking?.bookingRows??[],bookingUnavailable:booking===null,bookingLimited:booking?.bookingLimited??false};
}
