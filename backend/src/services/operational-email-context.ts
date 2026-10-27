import {supabaseAdmin as db} from '../config/supabase.js';
import type {OperationalEmailContext} from './operational-email-template.js';
const one=(v:any)=>Array.isArray(v)?v[0]:v;
const str=(v:unknown)=>v==null?'':String(v);
async function required(query:any){const r=await query;if(r.error||!r.data)throw Error('Saved report context is unavailable.');return r.data;}
export async function loadOperationalEmailContext(type:string,id:string):Promise<OperationalEmailContext>{
 const table=type==='BACKLOAD'?'backloads':type==='OFFLOAD'?'offloads':'demurrages';
 const report=await required(db.from(table).select('*').eq('id',id).single());
 const [trip,event,stop,items]=await Promise.all([
  required(db.from('trips').select('id,dispatch_number,trip_reference,warehouse:warehouses(name)').eq('id',report.trip_id).single()),
  db.from('trip_events').select('id,assignment_id,recorded_by,notes,delivery_metadata,event_time').eq('trip_id',report.trip_id).eq(type==='BACKLOAD'?'backload_id':type==='OFFLOAD'?'offload_id':'demurrage_id',id).limit(1).maybeSingle(),
  report.trip_stop_id?db.from('trip_stops').select('id,dr_number,delivery_location,store:customer_stores(name),customer:customers(name)').eq('id',report.trip_stop_id).maybeSingle():Promise.resolve({data:null,error:null}),
  type==='DEMURRAGE'?Promise.resolve({data:[],error:null}):db.from(type==='BACKLOAD'?'backload_items':'offload_items').select('*,line:trip_line_items(id,trip_id,trip_stop_id,dr_number,sap_so_number,customer_po_number,internal_po_number,customer_model,stop:trip_stops(dr_number,delivery_location,store:customer_stores(name),customer:customers(name)))').eq(type==='BACKLOAD'?'backload_id':'offload_id',id).order('id'),
 ]);
 if(event.error||stop.error||items.error)throw Error('Linked report details are unavailable.');
 let assignment:any=null;
 if(event.data?.assignment_id)assignment=await required(db.from('trip_truck_assignments').select('id,driver:drivers(first_name,last_name),truck:trucks(plate_number,company:trucking_companies(name)),company:trucking_companies(name)').eq('id',event.data.assignment_id).eq('trip_id',trip.id).single());
 // New simplified reports retain receipt links on their authoritative event, not
 // invented offload quantities. Resolve context only from this assignment's cargo.
 const relatedDrs=Array.isArray(event.data?.delivery_metadata?.related_dr_numbers)
  ? [...new Set<string>(event.data!.delivery_metadata.related_dr_numbers.filter((v:unknown):v is string=>typeof v==='string'&&!!v.trim()))] : null;
 const assignedContext=relatedDrs!==null&&!(items.data??[]).length;
 if(assignment?.id&&((relatedDrs?.length??0)>0||(relatedDrs===null&&type==='DEMURRAGE'&&report.trip_stop_id))){
  let query=db.from('trip_cargo_allocations').select('quantity,allocated_cbm,line:trip_line_items!inner(id,trip_id,trip_stop_id,dr_number,sap_so_number,customer_po_number,internal_po_number,customer_model,stop:trip_stops(dr_number,delivery_location,store:customer_stores(name),customer:customers(name)))').eq('assignment_id',assignment.id).eq('trip_id',trip.id).order('id');
  if(relatedDrs===null)query=query.eq('line.trip_stop_id',report.trip_stop_id);
  if(!(items.data??[]).length){
   const cargo:any[]=[];
   for(let offset=0;;offset+=1000){const page=await query.range(offset,offset+999);if(page.error)throw Error('Related assigned cargo is unavailable.');cargo.push(...page.data??[]);if((page.data?.length??0)<1000)break;}
   (items as any).data=cargo.filter((r:any)=>relatedDrs===null||relatedDrs.includes(str(one(r.line)?.dr_number||one(one(r.line)?.stop)?.dr_number).trim())).map((r:any)=>({...r,total_cbm:r.allocated_cbm}));
  }
 }
 const destinations=[...new Set((items.data??[]).map((r:any)=>{const stop=one(one(r.line)?.stop);return one(stop?.store)?.name??stop?.delivery_location?.name??stop?.delivery_location?.label;}).filter(Boolean))];
 const driver=one(assignment?.driver),person=[driver?.first_name,driver?.last_name].filter(Boolean).join(' ');
 const base=(process.env.FRONTEND_URL??process.env.CLIENT_URL??'').replace(/\/$/,'');
 return {type,subject:str(report.subject),letterDate:str(report.report_date),date:new Date(report.submitted_at??report.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}),dispatch:str(report.dispatch_number_snapshot??trip.dispatch_number),tripReference:str(trip.trip_reference),driver:str(report.driver_name_snapshot??person),plate:str(report.plate_number_snapshot??one(assignment?.truck)?.plate_number),company:str(one(assignment?.company)?.name??one(one(assignment?.truck)?.company)?.name),warehouse:str(report.pickup_location??one(trip.warehouse)?.name),destination:str(destinations.length?destinations.join(', '):one(stop.data?.store)?.name??stop.data?.delivery_location?.name??stop.data?.delivery_location?.label),dr:relatedDrs!==null?relatedDrs.join(', '):str(report.dr_number??stop.data?.dr_number??event.data?.delivery_metadata?.dr_number),reason:str(report.reason),remarks:str(report.narrative??report.comments??report.remarks),boxes:str(report.number_of_boxes),waiting:str(report.waiting_minutes),
 assignedCargoContext:assignedContext,evidenceEventId:event.data?.assignment_id?event.data?.id:undefined,
 cargo:(items.data??[]).map((row:any)=>{const li=one(row.line);if(li&&li.trip_id!==trip.id)throw Error('Cargo ownership mismatch.');return {ship_to:row.ship_to_snapshot??one(one(li?.stop)?.store)?.name??one(stop.data?.store)?.name,customer_name:row.customer_name_snapshot??one(one(li?.stop)?.customer)?.name??one(stop.data?.customer)?.name,dr_number:row.dr_number||li?.dr_number||one(li?.stop)?.dr_number,sap_so_number:row.sap_so_number??li?.sap_so_number,customer_po_number:row.customer_po_number??li?.customer_po_number,internal_po_number:li?.internal_po_number,customer_model:row.customer_model??li?.customer_model,quantity:row.quantity,total_cbm:row.total_cbm};}),
 ...(base.startsWith('https://')||/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)?{appLink:`${base}/trips/${encodeURIComponent(trip.id)}${assignment?`?assignment=${encodeURIComponent(assignment.id)}`:''}`}:{})};
}
