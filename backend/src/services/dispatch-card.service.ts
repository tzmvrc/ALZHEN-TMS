import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { signStoragePaths } from "./storage-links.service.js";

const idsOf=(rows:Record<string,unknown>[],field:string)=>[...new Set(rows.map(row=>row[field]).filter((value):value is string=>typeof value==="string"&&isValidUuid(value)))];
const byId=(rows:Record<string,unknown>[])=>new Map(rows.map(row=>[String(row.id),row]));
const settledRows=<T extends Record<string,unknown>>(result:PromiseSettledResult<{data:T[]|null;error:unknown}>):T[]=>
  result.status==="fulfilled"&&!result.value.error?result.value.data??[]:[];

/** Small card projection over physical tables. It never reads the wide CSV view. */
export async function getDispatchCards(tripIds:string[]){
  if(!tripIds.length||tripIds.length>3||tripIds.some(id=>!isValidUuid(id)))throw new ApiError("Select up to three trips for card details.",400,"INVALID_CARD_SCOPE");
  const tripsResult=await supabaseAdmin.from("trips")
    .select("id,dispatch_number,trip_reference,loading_date,estimated_delivery_date,status,warehouse_id,letter_status")
    .in("id",tripIds);
  if(tripsResult.error)throw new ApiError("Unable to load dispatch cards.",503,"DISPATCH_CARDS_UNAVAILABLE");
  const requested=(tripsResult.data??[]) as Record<string,unknown>[];
  const dispatchNumbers=[...new Set(requested.map(trip=>String(trip.dispatch_number??"").trim()).filter(Boolean))];
  const linkedResult=dispatchNumbers.length
    ? await supabaseAdmin.from("trips").select("id,dispatch_number,estimated_delivery_date").in("dispatch_number",dispatchNumbers).limit(1000)
    : {data:[],error:null};
  const linked=linkedResult.error?requested:(linkedResult.data??[]) as Record<string,unknown>[];
  const allTripIds=idsOf(linked,"id");
  const [stopsResult,assignmentsResult,linesResult]=await Promise.allSettled([
    supabaseAdmin.from("trip_stops").select("id,trip_id,store_id,delivery_status,finish_unloading_time,dr_number").in("trip_id",allTripIds).is("archived_at",null).limit(1000),
    supabaseAdmin.from("trip_truck_assignments").select("id,trip_id,assignment_type,truck_id,driver_id,trucking_company_id").in("trip_id",tripIds).limit(100),
    supabaseAdmin.from("trip_line_items").select("trip_id,dr_number,customer_model").in("trip_id",tripIds).limit(1000),
  ]);
  const stops=settledRows(stopsResult),assignments=settledRows(assignmentsResult),lines=settledRows(linesResult);
  const [warehousesResult,storesResult,trucksResult,driversResult,companiesResult]=await Promise.allSettled([
    idsOf(requested,"warehouse_id").length?supabaseAdmin.from("warehouses").select("id,name,code").in("id",idsOf(requested,"warehouse_id")):Promise.resolve({data:[],error:null}),
    idsOf(stops,"store_id").length?supabaseAdmin.from("customer_stores").select("id,name").in("id",idsOf(stops,"store_id")):Promise.resolve({data:[],error:null}),
    idsOf(assignments,"truck_id").length?supabaseAdmin.from("trucks").select("id,plate_number,trucking_company_id").in("id",idsOf(assignments,"truck_id")):Promise.resolve({data:[],error:null}),
    idsOf(assignments,"driver_id").length?supabaseAdmin.from("drivers").select("id,first_name,last_name,profile_id,trucking_company_id").in("id",idsOf(assignments,"driver_id")):Promise.resolve({data:[],error:null}),
    idsOf(assignments,"trucking_company_id").length?supabaseAdmin.from("trucking_companies").select("id,name").in("id",idsOf(assignments,"trucking_company_id")):Promise.resolve({data:[],error:null}),
  ]);
  const warehouses=byId(settledRows(warehousesResult)),stores=byId(settledRows(storesResult)),trucks=byId(settledRows(trucksResult)),drivers=byId(settledRows(driversResult));
  const companies=byId(settledRows(companiesResult));
  const profileIds=idsOf([...drivers.values()],"profile_id");
  const profilesResult=profileIds.length?await supabaseAdmin.from("profiles").select("id,profile_picture_path").in("id",profileIds):{data:[],error:null};
  const profiles=byId(profilesResult.error?[]:(profilesResult.data??[]) as Record<string,unknown>[]);
  const paths=[...profiles.values()].map(profile=>profile.profile_picture_path).filter((path):path is string=>typeof path==="string"&&!/^https?:\/\//i.test(path));
  const signed=await Promise.race([
    signStoragePaths("profile-pictures",paths,3600).catch(()=>new Map<string,string>()),
    new Promise<Map<string,string>>(resolve=>setTimeout(()=>resolve(new Map()),750)),
  ]);
  const requestedById=byId(requested);
  return tripIds.flatMap(id=>{
    const trip=requestedById.get(id);if(!trip)return [];
    const dispatch=String(trip.dispatch_number??"").trim();
    const linkedIds=new Set(linked.filter(item=>String(item.dispatch_number??"").trim()===dispatch).map(item=>String(item.id)));
    if(!linkedIds.size)linkedIds.add(id);
    const dispatchStops=stops.filter(stop=>linkedIds.has(String(stop.trip_id)));
    const ownStops=stops.filter(stop=>String(stop.trip_id)===id);
    const primary=assignments.find(assignment=>String(assignment.trip_id)===id&&assignment.assignment_type==="PRIMARY")??assignments.find(assignment=>String(assignment.trip_id)===id);
    const truck=trucks.get(String(primary?.truck_id??""));
    const driver=drivers.get(String(primary?.driver_id??""));
    const carrier=companies.get(String(primary?.trucking_company_id??truck?.trucking_company_id??driver?.trucking_company_id??""));
    const warehouse=warehouses.get(String(trip.warehouse_id??""));
    const profile=profiles.get(String(driver?.profile_id??""));
    const photo=profile?.profile_picture_path;
    const ownLines=lines.filter(line=>String(line.trip_id)===id);
    const dates=linked.filter(item=>linkedIds.has(String(item.id))).map(item=>String(item.estimated_delivery_date??"")).filter(Boolean).sort();
    return [{
      _card_summary:true,
      trip_id:id,dispatch_number:trip.dispatch_number,trip_reference:trip.trip_reference,
      trip_status:trip.status,loading_date:trip.loading_date,estimated_delivery_date:trip.estimated_delivery_date,
      letter_status:trip.letter_status,warehouse_name:warehouse?.name??null,warehouse_code:warehouse?.code??null,
      store_name:stores.get(String(ownStops[0]?.store_id??""))?.name??null,
      card_destinations:[...new Set(dispatchStops.map(stop=>String(stores.get(String(stop.store_id??""))?.name??"")).filter(Boolean))],
      plate_number:truck?.plate_number??null,driver_name:[driver?.first_name,driver?.last_name].filter(Boolean).join(" "),
      trucking_company:carrier?.name??null,delivery_status:ownStops[0]?.delivery_status??null,
      card_stop_total:dispatchStops.length,
      card_stop_completed:dispatchStops.filter(stop=>["COMPLETED","DELIVERED","FINISHED"].includes(String(stop.delivery_status??"").toUpperCase())||Boolean(stop.finish_unloading_time)).length,
      card_delivery_date:dates.at(-1)??null,
      driver_photo_url:typeof photo==="string"?(/^https?:\/\//i.test(photo)?photo:signed.get(photo)??null):null,
      card_dr_numbers:[...new Set([...ownLines.map(line=>String(line.dr_number??"")),...ownStops.map(stop=>String(stop.dr_number??""))].filter(Boolean))],
      card_products:[...new Set(ownLines.map(line=>String(line.customer_model??"")).filter(Boolean))],
    }];
  });
}
