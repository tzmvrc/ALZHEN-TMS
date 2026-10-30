import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { createMasterListEditNotifications } from "./notification.service.js";

type Row = Record<string, unknown>;
const FIELDS = [
  "remarks","trip_type","letter_status","plate_number","trucking_company","trip_number","request_received_at","added_by_name",
  "warehouse_code","warehouse_name","store_name","customer_name","dr_number","sap_so_number","customer_po_number","internal_po_number",
  "source_product_category","customer_model","quantity","cbm","source_province","source_city",
  "incident_date","backload_reason","backload_number_of_boxes","ir_status","ir_submitted_date","backload_comments","offload_number_of_boxes","offload_reason",
  "delivery_status","delivery_completed_date","pod_status","signed_dr_upload_date","transmittal_date","tms_date","tms_done_by_name","pod_ac_shipping_date","lbc_tracking_number","pod_remarks","invoice_number",
] as const;
const GROUP_FIELDS:Record<string,readonly string[]>={booking:FIELDS.slice(0,8),cargo:FIELDS.slice(8,22),incident:FIELDS.slice(22,30),delivery:FIELDS.slice(30)};
// Row editors need their current values even when their columns are in another group.
const selectedFields=(group:unknown)=>group==="all"?FIELDS:[...new Set(["added_by_name","store_name","customer_name","customer_model","dr_number","remarks","plate_number","trucking_company","trip_number","delivery_status",...(GROUP_FIELDS[String(group)]??GROUP_FIELDS.booking)])];
const clean = (value: unknown) => value == null || value === "" || value === "#ERROR!" || value === "#REF!" ? "" : String(value);
const numeric = (value: unknown) => { const number=Number(value); return Number.isFinite(number)?number:0; };

function summarize(rows: Row[],fields:readonly string[],assignmentAware=false) {
  const values: Record<string,{value:string;detail?:string;count?:number}>={};
  const uniqueLines=new Map<string,Row>();
  rows.forEach((row,index)=>uniqueLines.set(clean(row._trip_line_item_id)||"missing:"+index,row));
  for (const field of [...new Set(["quantity","cbm","delivery_status",...fields])]) {
    if (field === "quantity" || field === "cbm") {
      const total=[...uniqueLines.values()].reduce((sum,row)=>sum+numeric(row[field]),0);
      values[field]={value:field==="cbm"?total.toFixed(4):String(total)};
      continue;
    }
    const source=assignmentAware&&["plate_number","trucking_company","trip_number"].includes(field)&&rows.some(row=>row._allocation_match===true)
      ?rows.filter(row=>row._allocation_match===true):rows;
    const unique=[...new Set(source.map(row=>clean(row[field]).trim()).filter(Boolean))];
    if(field==="trip_number"&&unique.length>1){
      const numbers=unique.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      values[field]={value:numbers[0],detail:numbers.join(", "),count:numbers.length};
      continue;
    }
    if(assignmentAware&&["plate_number","trucking_company"].includes(field)&&unique.length>1){
      values[field]={value:unique[0],detail:unique.join(", "),count:unique.length};
      continue;
    }
    values[field]=unique.length===0?{value:"—"}:unique.length===1?{value:unique[0]}:{value:unique[0],detail:unique.join(", "),count:unique.length};
  }
  const stops=new Set(rows.map(row=>clean(row._trip_stop_id)+"|"+clean(row.dr_number)).filter(key=>key!=="|"));
  const lines=new Set(rows.map(row=>clean(row._trip_line_item_id)).filter(Boolean));
  const statuses=new Map<string,string>();
  for (const row of rows) { const id=clean(row._trip_stop_id)+"|"+clean(row.dr_number); if(id!=="|") statuses.set(id,clean(row.delivery_status)); }
  const delivered=[...statuses.values()].filter(status=>/delivered|completed/i.test(status)).length;
  return {values,dr_count:stops.size,line_count:lines.size,delivered_count:delivered,quantity:values.quantity.value,cbm:values.cbm.value};
}

// Scoped Master List rows need only the selected trips. Reading the CSV
// presentation view here also evaluates its unrelated operational joins.
async function readSummaryRows(tripIds:string[],fields:readonly string[],includeAllocations=false):Promise<{rows:Row[];assignments:Row[]}> {
  if(!tripIds.length)return {rows:[],assignments:[]};
  const wanted=new Set(fields);
  const read=async(table:string,select:string,ids=tripIds):Promise<Row[]>=>{
    if(!ids.length)return [];
    const rows:Row[]=[];
    for(let index=0;index<ids.length;index+=80){
      const batch=ids.slice(index,index+80);
      for(let offset=0;;offset+=1000){
        const {data,error}=await supabaseAdmin.from(table).select(select).in(table==="trips"?"id":"trip_id",batch).order("id").range(offset,offset+999);
        if(error)throw new ApiError(`Unable to load Master List ${table}.`,503,"MASTER_LIST_READ_FAILED");
        rows.push(...(data??[]) as unknown as Row[]);
        if((data?.length??0)<1000)break;
      }
    }
    return rows;
  };
  const [trips,stops,lines,assignments,scopes,incidents,backloads,offloads,pods,billings,allocations]=await Promise.all([
    read("trips","id,dispatch_number,trip_reference,trip_number,remarks,trip_type_id,letter_status,request_received_at,created_by,warehouse_id,signed_dr_upload_date,transmittal_date,tms_date,tms_done_by,pod_ac_shipping_date,lbc_tracking_number"),
    read("trip_stops","id,trip_id,stop_sequence,dr_number,store_id,customer_id,delivery_status,finish_unloading_time"),
    read("trip_line_items","id,trip_id,trip_stop_id,dr_number,sap_so_number,customer_po_number,internal_po_number,source_product_category,customer_model,quantity,cbm,source_province,source_city,product_id"),
    read("trip_truck_assignments","id,trip_id,trip_reference,truck_id,trucking_company_id,stop_scope,unassigned_at"),
    wanted.has("plate_number")||wanted.has("trucking_company")||wanted.has("trip_number")?read("trip_assignment_stops","id,trip_id,trip_stop_id,assignment_id"):Promise.resolve([]),
    [...wanted].some(field=>["incident_date","ir_status","ir_submitted_date"].includes(field))?read("incidents","id,trip_id,trip_stop_id,incident_date,status,submitted_date"):Promise.resolve([]),
    [...wanted].some(field=>["backload_reason","backload_number_of_boxes","backload_comments"].includes(field))?read("backloads","id,trip_id,trip_stop_id,reason,number_of_boxes,comments"):Promise.resolve([]),
    [...wanted].some(field=>["offload_reason","offload_number_of_boxes"].includes(field))?read("offloads","id,trip_id,trip_stop_id,reason,number_of_boxes"):Promise.resolve([]),
    [...wanted].some(field=>["pod_status","pod_remarks"].includes(field))?read("pod_records","id,trip_id,trip_stop_id,dr_number,pod_status,remarks"):Promise.resolve([]),
    wanted.has("invoice_number")?read("billings","id,trip_id,invoice_number"):Promise.resolve([]),
    includeAllocations?read("trip_cargo_allocations","id,trip_id,trip_line_item_id,assignment_id,quantity,allocated_cbm"):Promise.resolve([]),
  ]);
  const ids=(rows:Row[],field:string)=>[...new Set(rows.map(row=>clean(row[field])).filter(Boolean))];
  const lookup=async(table:string,select:string,values:string[]):Promise<Map<string,Row>>=>{
    if(!values.length)return new Map();
    const {data,error}=await supabaseAdmin.from(table).select(select).in("id",values);
    if(error)throw new ApiError(`Unable to load Master List ${table}.`,503,"MASTER_LIST_READ_FAILED");
    return new Map(((data??[]) as unknown as Row[]).map(row=>[clean(row.id),row]));
  };
  const [warehouses,types,profiles,stores,customers,trucks,companies,products]=await Promise.all([
    wanted.has("warehouse_code")||wanted.has("warehouse_name")?lookup("warehouses","id,code,name",ids(trips,"warehouse_id")):new Map(),
    wanted.has("trip_type")?lookup("trip_types","id,name",ids(trips,"trip_type_id")):new Map(),
    wanted.has("added_by_name")||wanted.has("tms_done_by_name")?lookup("profiles","id,first_name,last_name",[...new Set([...ids(trips,"created_by"),...ids(trips,"tms_done_by")])]):new Map(),
    wanted.has("store_name")||wanted.has("source_province")||wanted.has("source_city")?lookup("customer_stores","id,name,province,city",ids(stops,"store_id")):new Map(),
    wanted.has("customer_name")?lookup("customers","id,name",ids(stops,"customer_id")):new Map(),
    wanted.has("plate_number")?lookup("trucks","id,plate_number",ids(assignments,"truck_id")):new Map(),
    wanted.has("trucking_company")?lookup("trucking_companies","id,name",ids(assignments,"trucking_company_id")):new Map(),
    wanted.has("source_product_category")?lookup("products","id,category",ids(lines,"product_id")):new Map(),
  ]);
  const grouped=(rows:Row[],field:string)=>{const map=new Map<string,Row[]>();for(const row of rows){const key=clean(row[field]),list=map.get(key)??[];list.push(row);map.set(key,list);}return map;};
  const stopByTrip=grouped(stops,"trip_id"),lineByStop=grouped(lines,"trip_stop_id"),assignmentByTrip=grouped(assignments.filter(row=>!row.unassigned_at),"trip_id");
  const referenceByTrip=new Map<string,string>();
  for(const assignment of assignments)if(!referenceByTrip.has(clean(assignment.trip_id))&&clean(assignment.trip_reference))referenceByTrip.set(clean(assignment.trip_id),clean(assignment.trip_reference));
  const allocationByPair=new Map(allocations.map(row=>[`${clean(row.trip_line_item_id)}:${clean(row.assignment_id)}`,row]));
  const allocationTotals=new Map<string,{quantity:number;cbm:number}>();
  for(const allocation of allocations){const key=clean(allocation.trip_line_item_id),total=allocationTotals.get(key)??{quantity:0,cbm:0};total.quantity+=numeric(allocation.quantity);total.cbm+=numeric(allocation.allocated_cbm);allocationTotals.set(key,total);}
  const permitted=new Set(scopes.map(row=>`${clean(row.assignment_id)}:${clean(row.trip_stop_id)}`));
  const related=(rows:Row[],trip:string,stop:string,dr?:string)=>rows.filter(row=>clean(row.trip_id)===trip&&clean(row.trip_stop_id)===stop&&(dr===undefined||clean(row.dr_number)===dr));
  const single=(rows:Row[],trip:string,stop:string,dr?:string)=>{const matches=related(rows,trip,stop,dr);return matches.length===1?matches[0]:{} as Row;};
  const name=(row:Row|undefined)=>row?[row.first_name,row.last_name].map(clean).filter(Boolean).join(" "):"";
  const output:Row[]=[];
  for(const trip of trips){
    const tripId=clean(trip.id),tripStops=[...(stopByTrip.get(tripId)??[])];
    if(!tripStops.length||lines.some(line=>clean(line.trip_id)===tripId&&!clean(line.trip_stop_id)))tripStops.push({});
    for(const stop of tripStops){
      const stopId=clean(stop.id),store=stores.get(clean(stop.store_id)),customer=customers.get(clean(stop.customer_id));
      const stopLines=(stopId?lineByStop.get(stopId):lines.filter(line=>clean(line.trip_id)===tripId&&!clean(line.trip_stop_id)))??[{}];
      const scoped=assignmentByTrip.get(tripId)?.filter(assignment=>!stopId||assignment.stop_scope==="ALL"||permitted.has(`${clean(assignment.id)}:${stopId}`))??[];
      for(const line of stopLines){
        const dr=clean(line.dr_number)||clean(stop.dr_number),incident=single(incidents,tripId,stopId),backload=single(backloads,tripId,stopId),offload=single(offloads,tripId,stopId),pod=single(pods,tripId,stopId,dr),billing=billings.filter(row=>clean(row.trip_id)===tripId);
        for(const assignment of scoped.length?scoped:[{}]){const allocation=allocationByPair.get(`${clean(line.id)}:${clean(assignment.id)}`),allocated=allocationTotals.get(clean(line.id));output.push({
          dispatch_number:trip.dispatch_number,trip_id:tripId,_trip_stop_id:stop.id,_trip_line_item_id:line.id,_assignment_id:assignment.id,stop_sequence:stop.stop_sequence,
          _allocation_match:Boolean(allocation),_allocation_id:allocation?.id,_allocation_quantity:allocation?.quantity,_allocation_cbm:allocation?.allocated_cbm,
          _line_allocated_quantity:allocated?.quantity??0,_line_allocated_cbm:allocated?.cbm??0,
          dr_number:dr,quantity:line.quantity,cbm:line.cbm,customer_model:line.customer_model,delivery_status:stop.delivery_status,
          remarks:trip.remarks,trip_type:types.get(clean(trip.trip_type_id))?.name,letter_status:trip.letter_status,
          plate_number:trucks.get(clean(assignment.truck_id))?.plate_number,trucking_company:companies.get(clean(assignment.trucking_company_id))?.name,
          trip_number:trip.trip_reference||referenceByTrip.get(tripId)||(trip.trip_number!=null?`Trip ${trip.trip_number}`:null),request_received_at:trip.request_received_at,added_by_name:name(profiles.get(clean(trip.created_by))),
          warehouse_code:warehouses.get(clean(trip.warehouse_id))?.code,warehouse_name:warehouses.get(clean(trip.warehouse_id))?.name,
          store_name:store?.name,customer_name:customer?.name,sap_so_number:line.sap_so_number,customer_po_number:line.customer_po_number,internal_po_number:line.internal_po_number,
          source_product_category:line.source_product_category||products.get(clean(line.product_id))?.category,
          source_province:line.source_province||store?.province,source_city:line.source_city||store?.city,
          incident_date:incident.incident_date,ir_status:incident.status,ir_submitted_date:incident.submitted_date,
          backload_reason:backload.reason,backload_number_of_boxes:backload.number_of_boxes,backload_comments:backload.comments,
          offload_reason:offload.reason,offload_number_of_boxes:offload.number_of_boxes,
          delivery_completed_date:stop.finish_unloading_time,pod_status:pod.pod_status,pod_remarks:pod.remarks,
          signed_dr_upload_date:trip.signed_dr_upload_date,transmittal_date:trip.transmittal_date,tms_date:trip.tms_date,
          tms_done_by_name:name(profiles.get(clean(trip.tms_done_by))),pod_ac_shipping_date:trip.pod_ac_shipping_date,lbc_tracking_number:trip.lbc_tracking_number,
          invoice_number:billing.length===1?billing[0].invoice_number:null,
        });}
      }
    }
  }
  return {rows:output,assignments:assignments.filter(row=>!row.unassigned_at).map(row=>({...row,_plate_number:trucks.get(clean(row.truck_id))?.plate_number,_trucking_company:companies.get(clean(row.trucking_company_id))?.name}))};
}

type TripIndexRow={id:string;dispatch_number:string|null;created_at:string;loading_date:string|null;warehouse_id:string|null;trip_number:number|null};
type DispatchIndexRow={dispatch_number:string;trip_ids:string[];loading_date:string|null;latest_at:string};
let dispatchRpcRetryAfter=0;

export async function masterListDeleteDispatchTrips(input:unknown) {
  if(!Array.isArray(input)||input.length<1||input.length>50||input.some(value=>typeof value!=="string"||!value.trim()||value.length>200))throw new ApiError("Choose up to 50 dispatches.",400);
  const requested=[...new Set(input as string[])];
  const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
  const ids=requested.filter(value=>uuid.test(value));
  const numbers=requested.filter(value=>!uuid.test(value));
  const matches=new Map<string,string[]>();
  if(numbers.length){
    for(let offset=0;;offset+=1000){
      const {data,error}=await supabaseAdmin.from("trips").select("id,dispatch_number").is("archived_at",null).in("dispatch_number",numbers).order("id").range(offset,offset+999);
      if(error)throw new ApiError("Unable to resolve selected dispatches.",503);
      for(const row of data??[]){const key=String(row.dispatch_number);matches.set(key,[...(matches.get(key)??[]),String(row.id)]);}
      if((data?.length??0)<1000)break;
    }
  }
  if(ids.length){
    const {data,error}=await supabaseAdmin.from("trips").select("id").is("archived_at",null).in("id",ids);
    if(error)throw new ApiError("Unable to resolve selected dispatches.",503);
    for(const row of data??[])matches.set(String(row.id),[String(row.id)]);
  }
  if(requested.some(value=>!matches.get(value)?.length))throw new ApiError("A selected dispatch is no longer available. Reload the Master List before deleting.",409);
  return Object.fromEntries(requested.map(value=>[value,matches.get(value)!]));
}

// Keep the read-only Master List usable until the paging migration is applied.
// Only trip metadata is scanned here; DR and product rows still load for the selected page.
async function fallbackDispatchPage(page:number,dateFrom:string|null,dateTo:string|null,search:string,trucker:string,warehouse:string,deliveryStatus:string) {
  const trips:TripIndexRow[]=[];
  for(let offset=0;;offset+=1000) {
    let request=supabaseAdmin.from("trips").select("id,dispatch_number,created_at,loading_date,warehouse_id,trip_number")
      .is("archived_at",null).order("created_at",{ascending:false}).range(offset,offset+999);
    if(dateFrom)request=request.gte("loading_date",dateFrom);
    if(dateTo)request=request.lte("loading_date",dateTo);
    const {data,error}=await request;
    if(error)throw new ApiError(error.message??"Unable to load dispatches.",503);
    trips.push(...(data??[]));
    if((data?.length??0)<1000)break;
  }
  let matched=trips.filter(trip=>!search || (trip.dispatch_number??"").toLowerCase().includes(search.toLowerCase()) || String(trip.trip_number??"").includes(search));
  if(warehouse) {
    const {data,error}=await supabaseAdmin.from("warehouses").select("id,code,name");
    if(error)throw new ApiError(error.message??"Unable to filter warehouses.",503);
    const ids=new Set((data??[]).filter(row=>[row.code,row.name].some(value=>String(value??"").toLowerCase().includes(warehouse.toLowerCase()))).map(row=>row.id));
    matched=matched.filter(trip=>trip.warehouse_id && ids.has(trip.warehouse_id));
  }
  if(trucker && matched.length) {
    const {data:companies,error}=await supabaseAdmin.from("trucking_companies").select("id,name");
    if(error)throw new ApiError(error.message??"Unable to filter truckers.",503);
    const ids=(companies??[]).filter(row=>String(row.name??"").toLowerCase().includes(trucker.toLowerCase())).map(row=>row.id);
    const tripIds=new Set<string>();
    if(ids.length)for(let offset=0;offset<matched.length;offset+=100) {
      const {data,error:assignmentError}=await supabaseAdmin.from("trip_truck_assignments").select("trip_id")
        .in("trip_id",matched.slice(offset,offset+100).map(trip=>trip.id)).in("trucking_company_id",ids).is("unassigned_at",null);
      if(assignmentError)throw new ApiError(assignmentError.message??"Unable to filter truckers.",503);
      (data??[]).forEach(row=>tripIds.add(row.trip_id));
    }
    matched=matched.filter(trip=>tripIds.has(trip.id));
  }
  if(deliveryStatus && matched.length) {
    const tripIds=new Set<string>();
    for(let offset=0;offset<matched.length;offset+=100) {
      const {data,error}=await supabaseAdmin.from("trip_stops").select("trip_id")
        .in("trip_id",matched.slice(offset,offset+100).map(trip=>trip.id)).is("archived_at",null).ilike("delivery_status",deliveryStatus);
      if(error)throw new ApiError(error.message??"Unable to filter delivery status.",503);
      (data??[]).forEach(row=>tripIds.add(row.trip_id));
    }
    matched=matched.filter(trip=>tripIds.has(trip.id));
  }
  const grouped=new Map<string,DispatchIndexRow>();
  for(const trip of matched) {
    const key=trip.dispatch_number || trip.id;
    const existing=grouped.get(key);
    if(existing) {
      existing.trip_ids.push(trip.id);
      if(trip.created_at>existing.latest_at)existing.latest_at=trip.created_at;
      if(trip.loading_date && (!existing.loading_date || trip.loading_date>existing.loading_date))existing.loading_date=trip.loading_date;
    } else grouped.set(key,{dispatch_number:key,trip_ids:[trip.id],loading_date:trip.loading_date,latest_at:trip.created_at});
  }
  const ordered=[...grouped.values()].sort((a,b)=>b.latest_at.localeCompare(a.latest_at)||b.dispatch_number.localeCompare(a.dispatch_number));
  return {rows:ordered.slice((page-1)*50,page*50),total:ordered.length};
}

export async function masterListDispatchPage(query: Record<string,unknown>) {
  const page=Math.max(1,Number(query.page)||1);
  const dateFrom=typeof query.date_from==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(query.date_from)?query.date_from:null;
  const dateTo=typeof query.date_to==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(query.date_to)?query.date_to:null;
  const filter=(key:string)=>typeof query[key]==="string"?String(query[key]).trim().slice(0,100):"";
  let result:{rows?:{dispatch_number:string;trip_ids:string[];loading_date:string|null}[];total?:number};
  let editingAvailable=true;
  if(Date.now()<dispatchRpcRetryAfter) {
    editingAvailable=false;
    result=await fallbackDispatchPage(page,dateFrom,dateTo,filter("search"),filter("trucker"),filter("warehouse"),filter("delivery_status"));
  } else {
    const {data,error}=await supabaseAdmin.rpc("master_list_dispatch_page_v1",{p_page:page,p_limit:50,p_search:filter("search"),p_date_from:dateFrom,p_date_to:dateTo,p_trucker:filter("trucker"),p_warehouse:filter("warehouse"),p_delivery_status:filter("delivery_status")});
    if(error && ["PGRST202","42883"].includes(error.code??"")) {
      dispatchRpcRetryAfter=Date.now()+60_000;
      editingAvailable=false;
      result=await fallbackDispatchPage(page,dateFrom,dateTo,filter("search"),filter("trucker"),filter("warehouse"),filter("delivery_status"));
    } else if(error)throw new ApiError(error.message??"Unable to load dispatches.",503);
    else result=data as typeof result;
  }
  const dispatches=result.rows??[];
  const fields=selectedFields(query.group);
  // Summaries are calculated on the server; no DR or line payload is sent until expanded.
  const {rows}=await readSummaryRows(dispatches.flatMap(row=>row.trip_ids),fields);
  const byDispatch=new Map<string,Row[]>();
  const tripDispatch=new Map(dispatches.flatMap(dispatch=>dispatch.trip_ids.map(id=>[id,dispatch.dispatch_number] as const)));
  for(const row of rows){const key=tripDispatch.get(clean(row.trip_id))??clean(row.dispatch_number);const group=byDispatch.get(key)??[];group.push(row);byDispatch.set(key,group);}
  const enriched=dispatches.map(dispatch=>({...dispatch,...summarize(byDispatch.get(dispatch.dispatch_number)??[],fields)}));
  return {rows:enriched,page,total:result.total??0,limit:50,editingAvailable};
}

function groupChildren(rows:Row[],fields:readonly string[]) {
  const groups=new Map<string,Row[]>();
  for(const row of rows) {
    const stop=clean(row._trip_stop_id);
    const key=(stop||"no-stop:"+clean(row.trip_id))+"|"+clean(row.dr_number);
    const group=groups.get(key)??[];group.push(row);groups.set(key,group);
  }
  return [...groups].map(([key,items])=>{
    const lineGroups=new Map<string,Row[]>();
    for(const item of items){const id=clean(item._trip_line_item_id);if(!id)continue;const group=lineGroups.get(id)??[];group.push(item);lineGroups.set(id,group);}
    return {id:key,trip_id:clean(items[0].trip_id),stop_id:clean(items[0]._trip_stop_id),stop_sequence:items[0].stop_sequence==null?null:Number(items[0].stop_sequence),dr_number:clean(items[0].dr_number)||"No DR",...summarize(items,fields,true),lines:[...lineGroups].map(([id,lineRows])=>{
      const item=lineRows.find(row=>row._allocation_match===true)??lineRows[0];
      const vehicle=summarize(lineRows,["plate_number","trucking_company","trip_number"],true).values;
      return {id,trip_id:clean(item.trip_id),stop_id:clean(item._trip_stop_id),read_only:item._allocation_view===true,values:Object.fromEntries([...new Set(["customer_model","dr_number",...fields])].map(field=>[field,["plate_number","trucking_company","trip_number"].includes(field)?vehicle[field]:{value:clean(item[field])||"—"}]))};
    })};
  }).sort((left,right)=>{
    const first=(value:string)=>value.split(", ",1)[0];
    const leftTrip=first(left.values.trip_number?.value??""),rightTrip=first(right.values.trip_number?.value??"");
    if(!leftTrip||leftTrip==="—")return !rightTrip||rightTrip==="—"?0:1;
    if(!rightTrip||rightTrip==="—")return -1;
    return leftTrip.localeCompare(rightTrip,undefined,{numeric:true})
      ||(left.stop_sequence??Number.MAX_SAFE_INTEGER)-(right.stop_sequence??Number.MAX_SAFE_INTEGER)
      ||left.dr_number.localeCompare(right.dr_number,undefined,{numeric:true});
  });
}

type HierarchyTrip={id:string;dispatch_number:string|null;trip_reference:string|null;trip_number:number|null};
async function groupTripHierarchy(trips:HierarchyTrip[],fields:readonly string[]){
  if(!trips.length)return [];
  const {rows,assignments:assignmentRows}=await readSummaryRows(trips.map(trip=>trip.id),fields,true);
  const rowsByTrip=new Map<string,Row[]>(),assignmentsByTrip=new Map<string,Row[]>();
  for(const row of rows){const id=clean(row.trip_id),items=rowsByTrip.get(id)??[];items.push(row);rowsByTrip.set(id,items);}
  for(const row of assignmentRows){const id=clean(row.trip_id),items=assignmentsByTrip.get(id)??[];items.push(row);assignmentsByTrip.set(id,items);}
  const ordered=[...trips].sort((a,b)=>a.trip_number!=null&&b.trip_number!=null?a.trip_number-b.trip_number:(a.trip_reference??"").localeCompare(b.trip_reference??"",undefined,{numeric:true})||a.id.localeCompare(b.id));
  return ordered.map((trip,index)=>{
    const number=clean(trip.trip_reference)||clean(rowsByTrip.get(trip.id)?.[0]?.trip_number)||`Trip ${trip.trip_number??index+1}`;
    const tripRows:Row[]=(rowsByTrip.get(trip.id)??[]).map(row=>({...row,trip_number:number}));
    const activeAssignments=assignmentsByTrip.get(trip.id)??[],convoy=activeAssignments.length>1;
    const summary=summarize(tripRows,fields);
    const logicalDrs=groupChildren(tripRows,fields);
    summary.values.trip_number={value:number};
    if(!convoy)return {id:trip.id,trip_id:trip.id,trip_number:number,convoy:false,...summary,drs:logicalDrs,assignments:[],unallocated_drs:[]};
    const assignments=activeAssignments.map((assignment,assignmentIndex)=>{
      const assignmentId=clean(assignment.id),plate=clean(assignment._plate_number)||`Truck ${assignmentIndex+1}`;
      const company=clean(assignment._trucking_company);
      const scoped=tripRows.filter(row=>clean(row._assignment_id)===assignmentId);
      const groups=new Map<string,Row[]>();
      for(const row of scoped){const key=`${clean(row._trip_stop_id)}:${clean(row.dr_number)}`,items=groups.get(key)??[];items.push(row);groups.set(key,items);}
      const allocated:Row[]=[];
      for(const items of groups.values()){
        const cargo=items.filter(row=>row._allocation_match===true&&clean(row._trip_line_item_id));
        if(cargo.length)allocated.push(...cargo.map(row=>({...row,quantity:row._allocation_quantity,cbm:row._allocation_cbm,_allocation_view:true})));
        else if(assignment.stop_scope==="SELECTED"||items.every(row=>!clean(row._trip_line_item_id)))allocated.push({...items[0],_trip_line_item_id:null,quantity:0,cbm:0});
      }
      const assignmentSummary=summarize(allocated,fields,true);
      assignmentSummary.values.plate_number={value:plate};
      assignmentSummary.values.trucking_company={value:company||"—"};
      assignmentSummary.values.trip_number={value:number};
      return {id:assignmentId,trip_id:trip.id,plate_number:plate,trucking_company:company,...assignmentSummary,
        drs:groupChildren(allocated,fields).map(dr=>({...dr,id:`${assignmentId}:${dr.id}`,read_only:true}))};
    });
    const sourceLines=new Map<string,Row>();
    for(const row of tripRows){const id=clean(row._trip_line_item_id);if(id&&!sourceLines.has(id))sourceLines.set(id,row);}
    const unallocated=[...sourceLines.values()].flatMap(row=>{
      const quantity=Math.max(0,numeric(row.quantity)-numeric(row._line_allocated_quantity));
      const cbm=Math.max(0,numeric(row.cbm)-numeric(row._line_allocated_cbm));
      const partial=numeric(row._line_allocated_quantity)>0||numeric(row._line_allocated_cbm)>0;
      return !partial||quantity>0||cbm>0?[{...row,_assignment_id:null,_allocation_match:false,plate_number:null,trucking_company:null,quantity,cbm,_allocation_view:partial}]:[];
    });
    const unallocatedDrs=groupChildren(unallocated,fields).map(dr=>({...dr,id:`unallocated:${trip.id}:${dr.id}`,read_only:dr.lines.some(line=>line.read_only)}));
    return {id:trip.id,trip_id:trip.id,trip_number:number,convoy:true,...summary,drs:[],flat_drs:logicalDrs,assignments,unallocated_drs:unallocatedDrs};
  });
}

export async function masterListDispatchChildren(dispatchNumber:string,group:unknown) {
  if (!dispatchNumber || dispatchNumber.length>200) throw new ApiError("Invalid dispatch number.",400);
  let query=supabaseAdmin.from("trips").select("id,dispatch_number,trip_reference,trip_number").is("archived_at",null);
  query=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(dispatchNumber)?query.eq("id",dispatchNumber):query.eq("dispatch_number",dispatchNumber);
  const {data:trips,error}=await query;
  if(error) throw new ApiError("Unable to load dispatch trips.",503);
  const fields=selectedFields(group);
  return groupTripHierarchy(trips??[],fields);
}

export async function masterListDispatchChildrenBatch(input:unknown,group:unknown) {
  if(!Array.isArray(input)||input.length>50||input.some(item=>typeof item!=="string"||item.length>200))throw new ApiError("Choose up to 50 dispatches.",400);
  if(!input.length)return {};
  const named=input.filter(item=>!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(item));
  const synthetic=input.filter(item=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(item));
  const trips:HierarchyTrip[]=[];
  if(named.length){const result=await supabaseAdmin.from("trips").select("id,dispatch_number,trip_reference,trip_number").in("dispatch_number",named).is("archived_at",null);if(result.error)throw new ApiError("Unable to load dispatch trips.",503);trips.push(...(result.data??[]));}
  if(synthetic.length){const result=await supabaseAdmin.from("trips").select("id,dispatch_number,trip_reference,trip_number").in("id",synthetic).is("archived_at",null);if(result.error)throw new ApiError("Unable to load dispatch trips.",503);trips.push(...(result.data??[]));}
  const fields=selectedFields(group);
  const grouped=new Map<string,HierarchyTrip[]>();
  for(const trip of trips){const dispatch=trip.dispatch_number||trip.id,list=grouped.get(dispatch)??[];list.push(trip);grouped.set(dispatch,list);}
  const all=await groupTripHierarchy(trips,fields);
  const byTrip=new Map(all.map(trip=>[trip.trip_id,trip]));
  return Object.fromEntries(input.map(dispatch=>[dispatch,(grouped.get(dispatch)??[]).map(trip=>byTrip.get(trip.id)).filter(Boolean)]));
}

export async function saveMasterListBatch(actor:string,input:unknown) {
  if(!Array.isArray(input)||input.length>200) throw new ApiError("Use a batch of up to 200 changes.",400);
  for(const item of input) if(!item||typeof item!=="object"||typeof item.scope!=="string"||typeof item.id!=="string"||typeof item.field!=="string"||!["string","number"].includes(typeof item.value)) throw new ApiError("Invalid Master List change.",400);
  const {data,error}=await supabaseAdmin.rpc("master_list_save_batch_v1",{p_actor:actor,p_changes:input});
  if(error && ["PGRST202","42883"].includes(error.code??""))
    throw new ApiError("Master List editing needs the pending database migration. No changes were saved.",503,"MASTER_LIST_SETUP_REQUIRED");
  if(error) throw new ApiError(error.message??"Unable to save Master List changes.",error.code==="42501"?403:400);
  const saved=Number((data as {saved?:number}|null)?.saved??0);
  let notificationWarning:string|null=null;
  if(saved>0)try{await createMasterListEditNotifications(actor,input as Array<{scope:string;id:string;field:string}>,saved);}catch(error){console.warn("Master List edit notification unavailable:",error);notificationWarning="Changes were saved, but collaborators could not be notified.";}
  return {...(data as Record<string,unknown>),notification_warning:notificationWarning};
}
