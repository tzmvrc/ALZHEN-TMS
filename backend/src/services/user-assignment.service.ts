import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {changeHelperAssignment} from './helper-assignment.service.js';
import {collaborationEvents} from './collaboration-events.js';
type Actor={id:string;role:string};
async function subject(actor:Actor,id:string){
 if(!['ADMIN','STAFF'].includes(actor.role))throw new ApiError('Management access required.',403);
 if(!isValidUuid(id))throw new ApiError('Choose a Trucker account.',400);
 const r=await db.from('profiles').select('id,crew_role,drivers(id)').eq('id',id).eq('role','TRUCKER').is('deactivated_at',null).is('locked_at',null).maybeSingle();
 if(r.error||!r.data)throw new ApiError('Active Trucker account required.',409);
 if(r.data.crew_role==='HELPER'&&actor.role!=='ADMIN')throw new ApiError('Admin access required.',403);
 return {...r.data,driver:(Array.isArray(r.data.drivers)?r.data.drivers[0]:r.data.drivers) as {id:string}|null};
}
export async function userAssignmentOptions(actor:Actor,id:string,query:any){
 const p=await subject(actor,id);
 let q=db.from('trip_truck_assignments').select('id,trip_id,truck_id,driver_id,truck:trucks!inner(plate_number,status),driver:drivers(first_name,last_name),trip:trips!inner(dispatch_number,archived_at,status)').is('unassigned_at',null).eq('truck.status','ACTIVE').is('trip.archived_at',null).not('trip.status','in','(CANCELLED,COMPLETED,DELIVERED,CLOSED)').order('id').limit(51);
 if(p.crew_role==='DRIVER')q=q.or(`driver_id.is.null${p.driver?`,driver_id.eq.${p.driver.id}`:''}`);
 if(query.after){if(!isValidUuid(query.after))throw new ApiError('Invalid assignment cursor.',400);q=q.gt('id',query.after);}
 if(typeof query.q==='string'&&query.q.trim())q=q.ilike('truck.plate_number','%'+query.q.replace(/[%_]/g,'').slice(0,80)+'%');
 const {data,error}=await q;if(error)throw new ApiError('Truck assignments could not load.',503);
 const page=(data??[]).slice(0,50);let rows=page;const crew:any[]=[];
 if(p.crew_role==='DRIVER'&&page.length){
  const occupied=await db.from('drivers').select('assigned_truck_id').in('assigned_truck_id',page.map(a=>a.truck_id).filter(Boolean)).eq('status','ACTIVE').neq('profile_id',id);
  if(occupied.error)throw new ApiError('Driver availability could not load.',503);
  const blocked=new Set((occupied.data??[]).map(d=>d.assigned_truck_id));rows=page.filter(a=>!blocked.has(a.truck_id));
 }
 if(rows.length)for(let start=0;;start+=1000){const r=await db.from('trip_truck_crew_members').select('assignment_id,profile_id,crew_role,profile:profiles!trip_truck_crew_members_profile_id_fkey(first_name,last_name)').in('assignment_id',rows.map(a=>a.id)).is('removed_at',null).order('id').range(start,start+999);if(r.error)throw new ApiError('Assigned crew could not load.',503);crew.push(...r.data??[]);if((r.data?.length??0)<1000)break;}
 crew.sort((a,b)=>(a.crew_role==='DRIVER'?0:1)-(b.crew_role==='DRIVER'?0:1)||`${a.profile?.first_name??''} ${a.profile?.last_name??''}`.localeCompare(`${b.profile?.first_name??''} ${b.profile?.last_name??''}`));
 return {role:p.crew_role,rows:rows.map(a=>({...a,member:crew.some(c=>c.assignment_id===a.id&&c.profile_id===id),crew:crew.filter(c=>c.assignment_id===a.id)})),next:(data?.length??0)>50?page.at(-1)?.id:null};
}
export async function changeUserAssignment(actor:Actor,id:string,input:any){
 const p=await subject(actor,id);
 if(!isValidUuid(input.assignment_id)||typeof input.add!=='boolean')throw new ApiError('Choose an existing assignment.',400);
 if(p.crew_role==='HELPER'){
  const a=await db.from('trip_truck_assignments').select('id,truck:trucks!inner(status),trip:trips!inner(status,archived_at)').eq('id',input.assignment_id).is('unassigned_at',null).eq('truck.status','ACTIVE').is('trip.archived_at',null).not('trip.status','in','(CANCELLED,COMPLETED,DELIVERED,CLOSED)').maybeSingle();
  if(a.error||!a.data)throw new ApiError('Active truck assignment required.',409);
  return changeHelperAssignment(actor,id,input);
 }
 const {data,error}=await db.rpc('select_driver_assignment_v1',{p_actor:actor.id,p_profile:id,p_assignment:input.assignment_id,p_add:input.add});
 if(error)throw new ApiError(error.code==='42501'?'Assignment access denied.':error.code==='P0409'?'This assignment already has a Driver. Refresh and choose another.':'The assignment changed or is unavailable. Refresh and retry.',error.code==='42501'?403:409);
 const a=await db.from('trip_truck_assignments').select('trip_id').eq('id',input.assignment_id).single();
 collaborationEvents.emit('commit',{source:'trip_truck_assignments',recordId:input.assignment_id,tripId:a.data?.trip_id,fields:['driver_id','crew'],actorId:actor.id,version:null,eventId:`driver-assignment:${input.assignment_id}:${Date.now()}`});return data;
}
