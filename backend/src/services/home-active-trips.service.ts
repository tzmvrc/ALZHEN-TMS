import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {buildPaginationMeta,normalizePagination} from '../utils/pagination.js';
import {buildIlikeOrFilter} from '../utils/postgrest-search.js';
import {getTripList} from './trip.service.js';
import {readConfirmedOperationalState,type OperationalState} from './confirmed-operational-state.service.js';
import {withSupabaseDeadline} from '../utils/supabase-request-scope.js';
type Row=Record<string,any>;
const fail=()=>new ApiError('Active trip delivery progress could not load. Please retry.',503);
async function scoped(table:string,select:string,ids:string[],key='trip_id',activeField?:string){
 if(!ids.length)return [];
 const rows:Row[]=[];
 for(let offset=0;;offset+=500){let query=db.from(table).select(select).in(key,ids).order('id').range(offset,offset+499);if(activeField)query=query.is(activeField,null);const result=await query;if(result.error)throw fail();rows.push(...result.data??[]);if((result.data?.length??0)<500)return rows;}
}
const name=(person:Row|undefined|null)=>person?[person.first_name,person.last_name].filter(Boolean).join(' '):'';
const physicalDone=(state:Row|undefined)=>Boolean(state?.departure_time&&Number.isFinite(Date.parse(state.departure_time)));
function progress(completed:number,total:number,known:boolean){return {completed,total,percent:known&&total>0?Math.round(completed/total*100):null};}
/** Counts stop identities, never receipt approvals, products or repeated DR labels. */
export function projectActiveTrips(trips:Row[],assignments:Row[],stops:Row[],responsibilities:Row[],crew:Row[],states:OperationalState[]){
 return trips.map(trip=>{
  const destinations=stops.filter(stop=>stop.trip_id===trip.id).sort((a,b)=>a.stop_sequence-b.stop_sequence||a.id.localeCompare(b.id));
  const stateMap=new Map(states.filter(state=>state.trip_id===trip.id).map(state=>[`${state.assignment_id}:${state.trip_stop_id}`,state]));
  const trucks=assignments.filter(a=>a.trip_id===trip.id&&!a.unassigned_at).map(assignment=>{
   const assignedStops=destinations.filter(stop=>assignment.stop_scope==='ALL'||responsibilities.some(r=>r.assignment_id===assignment.id&&r.trip_stop_id===stop.id));
   const crewRows=crew.filter(c=>c.assignment_id===assignment.id&&!c.removed_at);
   const driver=name(assignment.driver)||name(crewRows.find(c=>c.crew_role==='DRIVER')?.profile)||(assignment.driver_id?'Unknown Driver':null);
   const helpers=crewRows.filter(c=>c.crew_role==='HELPER').map(c=>({id:c.profile_id,name:name(c.profile)||'Unknown',role:'Helper'})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
   const known=assignedStops.every(stop=>stateMap.has(`${assignment.id}:${stop.id}`));
   return {id:assignment.id,plate:assignment.truck?.plate_number??null,driver,helpers,crew_count:helpers.length+(assignment.driver_id||crewRows.some(c=>c.crew_role==='DRIVER')?1:0),stop_ids:assignedStops.map(stop=>stop.id),destination:assignedStops.at(-1)?.store?.name||assignedStops.at(-1)?.delivery_location||null,progress:progress(assignedStops.filter(stop=>physicalDone(stateMap.get(`${assignment.id}:${stop.id}`))).length,assignedStops.length,known)};
  });
  const complete=destinations.filter(stop=>{const owners=trucks.filter(truck=>truck.stop_ids.includes(stop.id));return owners.length>0&&owners.every(truck=>physicalDone(stateMap.get(`${truck.id}:${stop.id}`)));}).length;
  const known=destinations.every(stop=>{const owners=trucks.filter(truck=>truck.stop_ids.includes(stop.id));return owners.length>0&&owners.every(truck=>stateMap.has(`${truck.id}:${stop.id}`));});
  return {id:trip.id,reference:trip.trip_reference||null,trip_number:trip.trip_number??null,dispatch:trip.dispatch_number??null,status:trip.status,origin:trip.origin_name??null,loading_date:trip.loading_date??null,destinations:destinations.map(stop=>({id:stop.id,name:stop.store?.name||stop.delivery_location||null,sequence:stop.stop_sequence})),trucks,progress:progress(complete,destinations.length,known)};
 });
}
export async function homeActiveTrips(query:Record<string,unknown>){
 for(const key of ['page','limit','search'])if(query[key]!==undefined&&typeof query[key]!=='string')throw new ApiError('Invalid active trip query.',400);
 const {page,limit,from}=normalizePagination({page:query.page as string,limit:query.limit as string||'25'},50);
 const search=String(query.search??'').trim().replace(/\s+/g,' '),filter=buildIlikeOrFilter(['_home_search_text'],search);
 // Same canonical non-archived listing and exact status used by Home's headline count.
 let builder=db.from('v_home_trip_listing').select('id,trip_reference,trip_number,dispatch_number,status,origin_name,loading_date',{count:'exact'}).eq('status','IN_PROGRESS');
 if(filter)builder=builder.or(filter);
 const result=await builder.order('loading_date',{ascending:false,nullsFirst:false}).order('id').range(from,from+limit-1);if(result.error)throw fail();
 const ids=(result.data??[]).map(row=>row.id),total=result.count??0;
 const activeTotal=search?(await getTripList({archive_scope:'active',status:'IN_PROGRESS',limit:'1',page:'1'})).pagination.total:total;
 if(!ids.length)return {rows:[],pagination:buildPaginationMeta(page,limit,total),active_total:activeTotal};
 const assignmentRead=scoped('trip_truck_assignments','id,trip_id,stop_scope,unassigned_at',ids,'trip_id','unassigned_at');
 const [assignments,stops,responsibilities,progressState]=await Promise.all([
  assignmentRead,
  scoped('trip_stops','id,trip_id,stop_sequence,delivery_location,store:customer_stores(name)',ids,'trip_id','archived_at'),
  scoped('trip_assignment_stops','id,assignment_id,trip_stop_id,trip_id',ids),withSupabaseDeadline(8000,()=>readConfirmedOperationalState(ids)).then(states=>({states,available:true}),()=>({states:[],available:false}))
 ]);
 const rows=projectActiveTrips(result.data??[],assignments,stops,responsibilities,[],progressState.states).map(trip=>({id:trip.id,reference:trip.reference,trip_number:trip.trip_number,origin:trip.origin,destinations:trip.destinations,progress:trip.progress}));
 return {rows,pagination:buildPaginationMeta(page,limit,total),active_total:activeTotal,...(!progressState.available?{warning:'Delivery progress is temporarily unavailable. Saved trip and assignment details remain available.'}:{})};
}
