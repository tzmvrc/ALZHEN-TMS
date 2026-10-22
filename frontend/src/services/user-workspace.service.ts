import {apiGetCached,apiGet,apiPatch,apiPut,apiPost,getAppSessionHeaders,handleSessionExpiredResponse,getCachedApiResponse,invalidateApiCache,type ApiResponse} from './api.service';
import type {MasterDataPage,MasterDataRow} from './master-data.service';
export type UserProfile=MasterDataRow&{first_name:string;last_name:string;email:string|null;role:string;is_admin:boolean;contact_number:string|null;created_at:string;account_status:string;profile_picture_url:string|null;driver:{id:string;status:string;contact_number:string|null;license_number:string|null;trucking_company_id:string|null;notes:string|null;assigned_truck_id:string|null;trucks?:{id:string;plate_number:string;truck_type:string}|null}|null};
export type UserActivity={id:string;user_id:string;action:string;module:string;entity_id:string|null;created_at:string;old_data:Record<string,unknown>|null;new_data:Record<string,unknown>|null};
export type ActivityPage={rows:UserActivity[];pagination:{page:number;total:number;totalPages:number}};
export type ActivityStats={period_days:number;daily:Array<{day:string;actions:number}>;breakdown:Array<{module:string;actions:number}>;coverage:string};
const unwrap=async<T>(request:Promise<ApiResponse<T>>)=>{const response=await request;if(!response.success||response.data===undefined)throw Error(response.message??'The request could not be completed.');return response.data;};
const directory=(category:string,search:string,page:number,sort:string,direction:string)=>`/users/directory?${new URLSearchParams({category,search,page:String(page),sort,direction})}`;
export const loadUserSheet=(token:string,category:string,search='',page=1,sort='',direction='asc')=>unwrap(apiGetCached<ApiResponse<MasterDataPage>>(directory(category,search,page,sort,direction),token,30_000));
export const cachedUserSheet=(token:string,category:string,search='',sort='',direction='asc')=>getCachedApiResponse<ApiResponse<MasterDataPage>>(directory(category,search,1,sort,direction),token,300_000)?.data??null;
export function invalidateUserWorkspace(){invalidateApiCache('/users');invalidateApiCache('/truckers');invalidateApiCache('/lookups/drivers');invalidateApiCache('/lookups/trucks');}
export const fetchUserProfile=(token:string,id:string)=>unwrap(apiGetCached<ApiResponse<UserProfile>>(`/users/${id}/profile`,token,15_000));
export const readUserProfile=(token:string,id:string)=>unwrap(apiGet<ApiResponse<UserProfile>>(`/users/${id}/profile`,token));
export async function saveUserProfile(token:string,id:string,values:Record<string,unknown>){const result=await unwrap(apiPatch<ApiResponse<MasterDataRow>>(`/users/${id}/profile`,values,token));invalidateUserWorkspace();return result;}
export async function deleteUsers(token:string,ids:string[]){const result=await unwrap(apiPost<ApiResponse<{deleted:string[];failed:Array<{id:string;message:string}>}>>('/users/delete-records',{ids},token));invalidateUserWorkspace();return result;}
export type CurrentTruck={id:string;truck_type:string|null;plate_number:string};
export const availableDriverTrucks=(token:string,id:string,q='',after?:string)=>unwrap(apiGet<ApiResponse<{rows:CurrentTruck[];current:CurrentTruck|null;has_more:boolean;next:string|null}>>(`/users/drivers/${id}/available-trucks?${new URLSearchParams({q,...(after?{after}:{})})}`,token));
export async function assignDriverTruck(token:string,id:string,truck_id:string|null){const response=await unwrap(apiPut<ApiResponse<{driver_id:string;assigned_truck_id:string|null;plate_number:string|null;truck_type:string|null}>>(`/users/drivers/${id}/current-truck`,{truck_id},token));invalidateUserWorkspace();return response;}
export const fetchUserActivity=(token:string,id:string,filters:Record<string,string|number>)=>unwrap(apiGetCached<ApiResponse<ActivityPage>>(`/users/${id}/activity?${new URLSearchParams(Object.fromEntries(Object.entries(filters).map(([key,value])=>[key,String(value)])))}`,token,10_000));
export const fetchUserActivityStats=(token:string,id:string,days=30)=>unwrap(apiGetCached<ApiResponse<ActivityStats>>(`/users/${id}/activity-stats?days=${days}`,token,10_000));

export async function uploadUserPicture(token:string,id:string,file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
 const response=await fetch(`${import.meta.env.VITE_API_URL??'http://localhost:5000/api'}/users/${id}/picture`,{method:'POST',headers:{Authorization:`Bearer ${token}`,...getAppSessionHeaders(),'Content-Type':file.type},body:file});
 const result=await response.json().catch(()=>null);if(!response.ok)await handleSessionExpiredResponse(response.status,result,true);if(!response.ok||!result?.success||!result.data)throw Error(result?.message??'Profile image could not be saved.');invalidateUserWorkspace();return result.data as {path:string;signed_url:string|null};
}
