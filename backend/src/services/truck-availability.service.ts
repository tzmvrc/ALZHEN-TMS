import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";

export type TruckAvailability={id:string;plate_number:string;truck_type:string|null;capacity_cbm:number|null;available_cbm:number|null;availability:"AVAILABLE"|"CONFLICT"|"REVIEW";reason:string};
function day(value:unknown,end=false):number|null{
 if(typeof value==="string"&&value.length>10)value=value.slice(0,10);
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const parsed=Date.parse(`${value}T${end?"23:59:59.999":"00:00:00"}+08:00`);return Number.isFinite(parsed)?parsed:null;
}
/** Read-only planning snapshot. Incomplete schedules never imply availability. */
export async function getTruckAvailability(start?:string,end?:string,excludeTripId?:string,truckIds?:string[]):Promise<TruckAvailability[]>{
 const from=day(start),to=day(end,true);
 if(start&&from===null||end&&to===null||from!==null&&to!==null&&to<from||excludeTripId&&!isValidUuid(excludeTripId))throw new ApiError("Choose a valid loading and delivery date.",400);
 let truckQuery=supabaseAdmin.from("trucks").select("id,plate_number,truck_type,capacity_cbm,status").eq("status","ACTIVE").order("id");
 if(truckIds?.length)truckQuery=truckQuery.in("id",truckIds);
 const trucks:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){const {data,error}=await truckQuery.range(offset,offset+999);if(error)throw new ApiError("Unable to check truck availability.",503);trucks.push(...(data??[]));if((data?.length??0)<1000)break;if(offset>=9000)throw new ApiError("Truck availability requires a narrower search.",503);}
 if(!trucks.length)return [];
 const assignments:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){let query=supabaseAdmin.from("trip_truck_assignments").select("id,trip_id,truck_id,assigned_at,unassigned_at,trips!inner(id,status,loading_date,estimated_delivery_date,archived_at)").order("id").range(offset,offset+999);if(truckIds?.length)query=query.in("truck_id",truckIds);if(excludeTripId)query=query.neq("trip_id",excludeTripId);
  const {data,error}=await query;if(error)throw new ApiError("Unable to check existing truck schedules.",503);assignments.push(...(data??[]));if((data?.length??0)<1000)break;if(offset>=19000)throw new ApiError("Truck schedules require review before assignment.",503);
 }
 return trucks.map(truck=>{
  const capacity=truck.capacity_cbm==null?null:Number(truck.capacity_cbm);
  let availability:TruckAvailability["availability"]=from===null||to===null?"REVIEW":"AVAILABLE";
  let reason=availability==="REVIEW"?"Confirm loading and delivery dates":"No conflicting scheduled assignment";
  for(const assignment of assignments){if(assignment.truck_id!==truck.id)continue;
   const trip=(Array.isArray(assignment.trips)?assignment.trips[0]:assignment.trips) as Record<string,unknown>|undefined;
   if(!trip) {availability="REVIEW";reason="Existing assignment requires schedule review";continue;}
   if(trip.archived_at||assignment.unassigned_at||["CANCELLED","CANCELED","DELIVERED","COMPLETED"].includes(String(trip.status).toUpperCase()))continue;
   const released=assignment.unassigned_at?Date.parse(String(assignment.unassigned_at)):null;
   if(released!==null&&Number.isFinite(released)&&from!==null&&released<from)continue;
   const otherFrom=day(trip.loading_date),otherTo=day(trip.estimated_delivery_date,true);
   if(from!==null&&to!==null&&otherFrom!==null&&otherFrom>to)continue;
   if(from!==null&&to!==null&&otherFrom!==null&&otherTo!==null&&otherTo>=otherFrom){
    const effectiveEnd=released!==null&&Number.isFinite(released)?Math.min(released,otherTo):otherTo;
    if(effectiveEnd>=from&&otherFrom<=to){availability="CONFLICT";reason="Conflicting active assignment during these dates";break;}
   }else {availability="REVIEW";reason="Existing assignment has an incomplete schedule";}
  }
  return {id:String(truck.id),plate_number:String(truck.plate_number),truck_type:truck.truck_type?String(truck.truck_type):null,capacity_cbm:capacity!==null&&Number.isFinite(capacity)&&capacity>0?capacity:null,available_cbm:availability==="AVAILABLE"?capacity!==null&&Number.isFinite(capacity)&&capacity>0?capacity:null:null,availability,reason};
 });
}
export async function getDriverAvailability(start?:string,end?:string,excludeTripId?:string,driverIds?:string[]){
 const from=day(start),to=day(end,true);
 if((start&&from===null)||(end&&to===null)||(from!==null&&to!==null&&to<from)||(excludeTripId&&!isValidUuid(excludeTripId)))throw new ApiError("Choose valid trip dates.",400);
 if(driverIds&&(!driverIds.length||driverIds.length>100||driverIds.some(id=>!isValidUuid(id))))throw new ApiError("Choose valid driver identities.",400);
 const drivers:Record<string,unknown>[]=[],assignments:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){let query=supabaseAdmin.from("drivers").select("id").eq("status","ACTIVE").order("id").range(offset,offset+999);if(driverIds)query=query.in("id",driverIds);const result=await query;if(result.error)throw new ApiError("Unable to check driver availability.",503);drivers.push(...(result.data??[]));if((result.data?.length??0)<1000)break;if(offset>=19000)throw new ApiError("Driver availability requires a narrower search.",503);}
 for(let offset=0;;offset+=1000){let query=supabaseAdmin.from("trip_truck_assignments").select("id,driver_id,trip_id,trips!inner(status,loading_date,estimated_delivery_date,archived_at)").is("unassigned_at",null).not("driver_id","is",null).order("id").range(offset,offset+999);if(excludeTripId)query=query.neq("trip_id",excludeTripId);if(driverIds)query=query.in("driver_id",driverIds);const result=await query;if(result.error)throw new ApiError("Unable to check driver schedules.",503);assignments.push(...(result.data??[]));if((result.data?.length??0)<1000)break;if(offset>=19000)throw new ApiError("Driver schedules require review.",503);}
 return drivers.map(driver=>{let availability:TruckAvailability["availability"]=from===null||to===null?"REVIEW":"AVAILABLE",reason=availability==="REVIEW"?"Complete loading and delivery dates":"No overlapping active trip";
  for(const assignment of assignments){if(assignment.driver_id!==driver.id)continue;const trip=(Array.isArray(assignment.trips)?assignment.trips[0]:assignment.trips) as Record<string,unknown>|undefined;if(!trip||trip.archived_at||["CANCELLED","CANCELED","COMPLETED","DELIVERED"].includes(String(trip.status).toUpperCase()))continue;const otherFrom=day(trip.loading_date),otherTo=day(trip.estimated_delivery_date,true);if(from!==null&&to!==null&&otherFrom!==null&&otherTo!==null){if(otherFrom<=to&&otherTo>=from){availability="CONFLICT";reason="Driver has a conflicting active trip";break;}}else{availability="REVIEW";reason="Driver has an incomplete trip schedule";}}
  return {id:String(driver.id),availability,reason};
 });
}
