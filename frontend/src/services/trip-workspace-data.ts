import type {ConfirmedProgressState} from './operational-progress';
import type {TripAssignmentRecord,TripChildRecord} from './trip.service';
import type {RoadTrip} from './road-routing';
export type Allocation={id:string;assignment_id:string;trip_line_item_id:string;quantity:string|number;allocated_cbm:string|number};
export type Responsibility={assignment_id:string;trip_stop_id:string;progress:string};
export type Convoy={operational_state?:ConfirmedProgressState[];assignments:TripAssignmentRecord[];stops:TripChildRecord[];cargo:TripChildRecord[];allocations:Allocation[];responsibilities:Responsibility[]};
export const tripText=(value:unknown,fallback='Not recorded')=>typeof value==='string'&&value.trim()?value:typeof value==='number'?String(value):fallback;
export const tripAmount=(value:number)=>value.toLocaleString('en-PH',{maximumFractionDigits:2});
export const tripDone=(value:unknown)=>['COMPLETED','DELIVERED','FINISHED'].includes(String(value??'').toUpperCase());
export const tripStatus=(value:unknown)=>tripText(value).replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
export function assignmentWorkspace(assignment:TripAssignmentRecord|undefined,convoy:Convoy|null,fallbackStops:TripChildRecord[],road:RoadTrip|undefined,bookingRows:Record<string,unknown>[]){
 const id=assignment?.id;
 const assignments=convoy?.assignments??[];
 const allStops=convoy?.stops??fallbackStops;
 const responsibilities=convoy?.responsibilities.filter(r=>r.assignment_id===id)??[];
 const ownedStops=id?allStops.filter(stop=>assignment?.stop_scope==='ALL'||responsibilities.some(r=>r.trip_stop_id===stop.id)):[];
 const selectedRoad=road&&assignment&&road.assignmentId===id&&road.tripId===assignment.trip_id?road:undefined;
 const stops=ownedStops.slice().sort((a,b)=>Number(a.stop_sequence??Infinity)-Number(b.stop_sequence??Infinity)||String(a.id).localeCompare(String(b.id))).map((stop,index)=>{
  const responsibility=responsibilities.find(r=>r.trip_stop_id===stop.id),mapStop=selectedRoad?.stops.find(r=>r.id===stop.id),booking=bookingRows.find(r=>String(r.trip_stop_id??r._trip_stop_id??'')===stop.id);
  const shared=assignments.filter(a=>!a.unassigned_at&&(a.stop_scope==='ALL'||convoy?.responsibilities.some(r=>r.assignment_id===a.id&&r.trip_stop_id===stop.id))).length>1;
  return {...stop,id:String(stop.id),sequence:Number(stop.stop_sequence??index+1),name:mapStop?.name??tripText(booking?.store_name,tripText(stop.delivery_location,`Delivery stop ${stop.stop_sequence??index+1}`)),status:responsibility?.progress??tripText(stop.delivery_status,'PENDING'),progressScope:responsibility?'Truck progress':'Trip stop status',shared,arrival_time:stop.arrival_time,start_unloading_time:stop.start_unloading_time,finish_unloading_time:stop.finish_unloading_time,departure_time:stop.departure_time};
 });
 const allocations=convoy?.allocations.filter(a=>a.assignment_id===id)??[];
 const cargo=allocations.map(allocation=>{const item=convoy?.cargo.find(i=>i.id===allocation.trip_line_item_id);const product=item?.product as Record<string,unknown>|undefined;return {id:allocation.id,itemId:allocation.trip_line_item_id,stopId:String(item?.trip_stop_id??''),name:tripText(item?.customer_model,tripText(product?.name,tripText(product?.model_code,'Cargo item'))),quantity:Number(allocation.quantity),cbm:Number(allocation.allocated_cbm),dr:tripText(item?.dr_number)};});
 const progressKnown=assignments.filter(a=>!a.unassigned_at).length<=1||stops.every(s=>s.progressScope==='Truck progress');
 return {stops,cargo,progressKnown,completed:stops.filter(s=>tripDone(s.status)).length,cbm:cargo.reduce((n,c)=>n+(Number.isFinite(c.cbm)?c.cbm:0),0),quantity:cargo.reduce((n,c)=>n+(Number.isFinite(c.quantity)?c.quantity:0),0)};
}
