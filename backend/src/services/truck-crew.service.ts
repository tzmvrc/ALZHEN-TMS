import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {collaborationEvents} from './collaboration-events.js';
export async function hasCrewAccess(profile:string,assignment:string){
 const {data,error}=await db.rpc('crew_assignment_access_v1',{p_actor:profile,p_assignment:assignment});
 if(error)throw new ApiError('Crew authorization could not be confirmed. Retry.',503);return data===true;
}
export async function activeCrewAssignmentIds(profile:string,trip?:string){
 const ids:string[]=[];
 for(let offset=0;;offset+=1000){let query=db.from('trip_truck_crew_members').select('assignment_id,assignment:trip_truck_assignments!inner(id,trip_id,unassigned_at)').eq('profile_id',profile).is('removed_at',null).is('assignment.unassigned_at',null).order('id').range(offset,offset+999);if(trip)query=query.eq('assignment.trip_id',trip);
 const {data,error}=await query;if(error)throw new ApiError('Assigned crew could not be loaded.',503);ids.push(...(data??[]).map(row=>row.assignment_id));if((data?.length??0)<1000)return ids;}
}
export async function readTripCrew(trip:string){
 const members:any[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('trip_truck_crew_members').select('id,assignment_id,profile_id,crew_role,assigned_at,removed_at,profile:profiles!trip_truck_crew_members_profile_id_fkey(id,first_name,last_name,crew_role),assignment:trip_truck_assignments!inner(trip_id)').eq('assignment.trip_id',trip).is('removed_at',null).order('id').range(offset,offset+999);if(error)throw new ApiError('Truck crew could not load.',503);members.push(...data??[]);if((data?.length??0)<1000)break;}
 return members.sort((a,b)=>(a.crew_role==='DRIVER'?0:1)-(b.crew_role==='DRIVER'?0:1)||`${a.profile?.last_name??''} ${a.profile?.first_name??''}`.localeCompare(`${b.profile?.last_name??''} ${b.profile?.first_name??''}`)||a.id.localeCompare(b.id));
}
export async function crewCandidates(actor:{id:string;role:string},search:unknown,after:unknown){
 if(!['ADMIN','STAFF'].includes(actor.role))throw new ApiError('Management access required.',403);
 let query=db.from('profiles').select('id,first_name,last_name,crew_role').eq('role','TRUCKER').is('deactivated_at',null).is('locked_at',null).order('id').limit(51);
 if(after){if(typeof after!=='string'||!isValidUuid(after))throw new ApiError('Invalid crew cursor.',400);query=query.gt('id',after);}
 if(typeof search==='string'&&search.trim()){const term=search.trim().replace(/[^\p{L}\p{N} .'-]/gu,'').slice(0,80);if(term)query=query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);}
 const {data,error}=await query;if(error)throw new ApiError('Crew accounts could not load.',503);const rows=(data??[]).slice(0,50);return {rows,next:(data?.length??0)>50?rows.at(-1)?.id:null};
}
export async function saveTruckCrew(actor:{id:string;role:string},trip:string,assignment:string,input:any){
 if(!['ADMIN','STAFF'].includes(actor.role))throw new ApiError('Management access required.',403);
 if(!isValidUuid(trip)||!isValidUuid(assignment)||!Array.isArray(input.helper_ids)||input.helper_ids.some((id:any)=>typeof id!=='string'||!isValidUuid(id))||new Set(input.helper_ids).size!==input.helper_ids.length||!Number.isSafeInteger(input.expected_version))throw new ApiError('Choose distinct Helper accounts and reload the crew version.',400);
 const {data,error}=await db.rpc('save_assignment_crew_v1',{p_actor:actor.id,p_trip:trip,p_assignment:assignment,p_helpers:input.helper_ids,p_expected:input.expected_version});
 if(error)throw new ApiError(error.code==='42501'?'Crew access denied.':error.code==='P0409'?'Crew changed. Refresh before saving.':'Choose active Helper accounts for this assignment.',error.code==='42501'?403:409);
 collaborationEvents.emit('commit',{source:'trip_truck_crew_members',recordId:assignment,tripId:trip,fields:['crew'],actorId:actor.id,version:null,eventId:`crew:${assignment}:${data.crew_version}`});
 return data;
}
