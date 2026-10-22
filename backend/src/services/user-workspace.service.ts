import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {buildIlikeOrFilter} from "../utils/postgrest-search.js";
import {uploadProfilePicture} from "./user.service.js";
type Actor={id:string;role:string};
const db=supabaseAdmin as any;
const valid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function userId(id:string){if(!valid(id))throw new ApiError("Invalid user record.",400);return id;}
function assertView(actor:Actor,id:string){userId(id);if(actor.id!==id&&actor.role!=="ADMIN")throw new ApiError("You cannot view this profile or activity history.",403);}
function rpcError(error:any){if(!error)return;console.error("User workspace operation failed",{code:error.code});throw new ApiError(error.code==='42501'?"This action is not permitted for this account.":error.code==='23505'?"The truck is already assigned to another driver. Refresh and choose another truck.":error.code==='P0002'?"The selected account or driver is no longer available.":error.code==='23514'||error.code==='22023'?"Review the selected values and account status before saving.":"The operation could not be completed. Your changes have not been confirmed.",error.code==='42501'?403:400);}
export async function profileRecord(actor:Actor,id:string){
 assertView(actor,id);const {data,error}=await db.from('profiles').select('id,first_name,last_name,role,is_admin,contact_number,created_at,updated_at,deactivated_at,profile_picture_path,drivers(id,contact_number,license_number,trucking_company_id,status,notes,assigned_truck_id,trucking_companies(id,name),trucks!drivers_assigned_truck_id_fkey(id,truck_type,plate_number))').eq('id',id).maybeSingle();
 if(error||!data)throw new ApiError("Profile is unavailable.",404);
 const auth=await db.from('v_managed_users_directory').select('email').eq('id',id).maybeSingle();const driver=Array.isArray(data.drivers)?data.drivers[0]:data.drivers;let picture=null;
 if(data.profile_picture_path){if(/^https?:\/\//.test(data.profile_picture_path))picture=data.profile_picture_path;else{const signed=await supabaseAdmin.storage.from('profile-pictures').createSignedUrl(data.profile_picture_path,3600);picture=signed.data?.signedUrl??null;}}
 return {...data,driver:driver??null,drivers:undefined,email:auth.data?.email??null,profile_picture_url:picture,account_status:data.deactivated_at?'DEACTIVATED':'ACTIVE'};
}
export async function userSheet(actor:Actor,query:Record<string,unknown>){
 if(!['ADMIN','STAFF'].includes(actor.role))throw new ApiError('Access denied.',403);
 const category=query.category==='truckers'?'truckers':'staff';if(category==='staff'&&actor.role!=='ADMIN')throw new ApiError('Admin access required.',403);
 const page=Math.max(1,Math.floor(Number(query.page)||1)),limit=30;
 const sort=typeof query.sort==='string'&&['first_name','last_name','role','created_at','contact_number','email','plate_number','driver_status','license_number'].includes(query.sort)?query.sort:'created_at';
 let request=db.from('v_managed_users_directory').select('*',{count:'exact'}).is('deactivated_at',null).in('role',category==='staff'?['ADMIN','STAFF']:['TRUCKER']).order(sort,{ascending:query.direction==='asc'}).order('id').range((page-1)*limit,page*limit-1);
 const filter=buildIlikeOrFilter(['first_name','last_name','contact_number','email','plate_number','license_number'],query.search);if(filter)request=request.or(filter);
 const {data,error,count}=await request;if(error)throw new ApiError('Unable to load users. Retry loading.',502);
 const rows=(data??[]).map((row:any)=>query.selection_only==='true'?{id:row.id,is_admin:row.is_admin,created_at:row.created_at,role:row.role}:{...row,trucking_companies:row.trucking_company_name?{name:row.trucking_company_name}:null});
 return {rows,pagination:{page,limit,total:count??0,totalPages:Math.max(1,Math.ceil((count??0)/limit))}};
}
export async function patchProfile(actor:Actor,id:string,patch:Record<string,unknown>){
 assertView(actor,id);const {error}=await db.rpc('user_profile_patch_v1',{p_actor:actor.id,p_subject:id,p_patch:patch});rpcError(error);
 const value=await profileRecord(actor,id);return {...value,driver_id:value.driver?.id??null,contact_number:value.driver?.contact_number??value.contact_number,license_number:value.driver?.license_number??null,driver_notes:value.driver?.notes??null,driver_status:value.driver?.status??null,trucking_company_id:value.driver?.trucking_company_id??null,trucking_companies:value.driver?.trucking_companies??null,assigned_truck_id:value.driver?.assigned_truck_id??null,plate_number:value.driver?.trucks?.plate_number??null,truck_type:value.driver?.trucks?.truck_type??null};
}
export async function currentDriverTruck(actor:Actor,driverId:string,truckId:unknown){
 userId(driverId);if(truckId!==null&&(typeof truckId!=='string'||!valid(truckId)))throw new ApiError('Select a truck or remove the assignment.',400);
 const truck=truckId===null?null:await db.from('trucks').select('plate_number,truck_type').eq('id',truckId).maybeSingle();
 if(truck?.error)throw new ApiError('Unable to verify the selected truck. Please retry.',502);
 const result=await db.rpc('user_assign_current_truck_v1',{p_actor:actor.id,p_driver:driverId,p_truck:truckId});rpcError(result.error);return {...result.data,plate_number:truck?.data?.plate_number??null,truck_type:truck?.data?.truck_type??null};
}
export async function availableDriverTrucks(actor:Actor,driverId:string,query:Record<string,unknown>){
 userId(driverId);const {data,error}=await db.rpc('user_available_trucks_v1',{p_actor:actor.id,p_driver:driverId,p_search:String(query.q??'').slice(0,100),p_after:typeof query.after==='string'?query.after:null});rpcError(error);
 const current=await db.from('drivers').select('assigned_truck_id,trucking_companies(id,name),trucks!drivers_assigned_truck_id_fkey(id,truck_type,plate_number)').eq('id',driverId).maybeSingle();
 return {rows:(data??[]).slice(0,50).map((row:any)=>({id:row.id,plate_number:row.plate_number,truck_type:row.truck_type})),current:current.data?.trucks??null,has_more:(data??[]).length>50,next:(data??[])[49]?.plate_number??null};
}
export async function deactivateUsers(actor:Actor,input:unknown){
 if(actor.role!=='ADMIN')throw new ApiError('Admin access required.',403);
 if(!Array.isArray(input)||!input.length||input.length>100||input.some(id=>typeof id!=='string'||!valid(id)))throw new ApiError('Choose between 1 and 100 valid accounts.',400);
 const deleted:string[]=[],failed:Array<{id:string;message:string}>=[];
 for(const id of new Set<string>(input)){const {data,error}=await db.rpc('user_deactivate_v1',{p_actor:actor.id,p_subject:id});if(error){failed.push({id,message:id===actor.id?'Your signed-in account cannot be deleted.':error.code==='42501'?'A required administrator cannot be deleted.':'The account could not be deactivated. Its history is preserved.'});}else if(data?.deleted)deleted.push(id);else failed.push({id,message:'Account deactivation was not confirmed.'});}
 return {deleted,failed,retention:'Accounts are deactivated; operational and audit history is retained.'};
}
const privateKey=/password|token|secret|authorization|cookie|session|storage_path|profile_picture_path|ip_address|user_agent/i;
export function safeActivity(value:unknown,depth=0):unknown{
 if(depth>4)return undefined;if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return /(?:Bearer\s|eyJ[a-zA-Z0-9_-]{15,}\.)/.test(value)?'[private]':value.slice(0,1000);
 if(Array.isArray(value))return value.slice(0,30).map(v=>safeActivity(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!privateKey.test(key)).slice(0,40).map(([key,v])=>[key,safeActivity(v,depth+1)]));return undefined;
}
export async function userActivity(actor:Actor,id:string,query:Record<string,unknown>){
 assertView(actor,id);const page=Math.max(1,Math.floor(Number(query.page)||1)),limit=30;
 let request=db.from('v_user_activity').select('*',{count:'exact'}).eq('user_id',id).neq('action','REQUEST_STARTED').order('created_at',{ascending:false}).order('id').range((page-1)*limit,page*limit-1);
 for(const key of ['from','to'])if(query[key]){const value=String(query[key]);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value)))throw new ApiError('Choose a valid date range.',400);request=key==='from'?request.gte('created_at',value+'T00:00:00+08:00'):request.lte('created_at',value+'T23:59:59.999+08:00');}
 if(query.action){const action=String(query.action).replace(/[^A-Z_]/g,'');if(action)request=request.ilike('action',action+'%');}
 const search=buildIlikeOrFilter(['search_text'],query.search);if(search)request=request.or(search);
 const {data,error,count}=await request;if(error)throw new ApiError('Activity could not be loaded.',502);
 return {rows:(data??[]).map(({search_text:_search,...row}:any)=>({...row,old_data:safeActivity(row.old_data),new_data:safeActivity(row.new_data)})),pagination:{page,limit,total:count??0,totalPages:Math.max(1,Math.ceil((count??0)/limit))}};
}
export async function activityStats(actor:Actor,id:string,days:unknown){assertView(actor,id);const {data,error}=await db.rpc('user_activity_stats_v1',{p_actor:actor.id,p_subject:id,p_days:Math.min(90,Math.max(1,Number(days)||30))});rpcError(error);return data;}
export async function userPicture(actor:Actor,id:string,bytes:Buffer,mime:string){assertView(actor,id);return uploadProfilePicture(id,bytes,mime,actor.id);}
