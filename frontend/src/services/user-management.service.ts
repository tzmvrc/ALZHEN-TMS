import { apiGetCached, apiPatch, apiPost,invalidateApiCache,getCachedApiResponse,apiCacheGeneration,getAppSessionHeaders, handleSessionExpiredResponse, type ApiResponse } from "./api.service";
import {fetchTruckers,getCachedTruckers,type TruckerListItem} from "./trucker.service";

export type ManagedUser = {
  account_status?:string;deactivated_at?:string|null;
  id: string; first_name: string | null; last_name: string | null; role: "ADMIN" | "STAFF" | "TRUCKER";
  contact_number?:string|null; is_admin: boolean; email: string | null; profile_picture_path: string | null; profile_picture_url?: string | null;
  driver: { id: string; contact_number: string | null; license_number: string | null; trucking_company_id: string | null; status: string | null; notes: string | null } | null;
};
export type UserInput = { first_name: string; last_name: string; email: string; password?: string; role: "ADMIN" | "STAFF" | "TRUCKER"; is_admin: boolean; contact_number?: string; license_number?: string; trucking_company_id?: string | null; driver_status?: string; driver_notes?: string };

async function unwrap<T>(promise: Promise<ApiResponse<T>>, fallback: string) {
  const response = await promise;
  if (!response.success || response.data === undefined) throw new Error(response.message ?? fallback);
  return response.data;
}

function invalidateUsers(){invalidateApiCache("/users");invalidateApiCache("/lookups/profiles");invalidateApiCache("/truckers");}
export const fetchManagedUsers = (token: string) => unwrap(apiGetCached<ApiResponse<ManagedUser[]>>("/users", token), "Unable to load users.");
export type UsersDirectory={users:ManagedUser[];truckers:TruckerListItem[]};
const directoryQuery={search:"",status:"all",assignment:"all" as const,limit:100};
/** Reconstruct the directory from the existing token-scoped page caches. */
export function getCachedUsersDirectory(token:string,role:string):UsersDirectory|null{
 if(!["ADMIN","STAFF"].includes(role))return null;
 const users=role==="ADMIN"?getCachedApiResponse<ApiResponse<ManagedUser[]>>("/users",token,300000)?.data:[];
 if(!users)return null;
 const first=getCachedTruckers(token,{...directoryQuery,page:1});if(!first)return null;
 const truckers=[...first.rows];
 for(let page=2;page<=first.pagination.totalPages;page++){const cached=getCachedTruckers(token,{...directoryQuery,page});if(!cached)return null;truckers.push(...cached.rows);}
 return {users,truckers};
}
export async function fetchUsersDirectory(token:string,role:string):Promise<UsersDirectory>{
 if(!["ADMIN","STAFF"].includes(role))throw Error("Users directory access denied.");
 const generation=apiCacheGeneration();
 const [users,truckers]=await Promise.all([role==="ADMIN"?fetchManagedUsers(token):Promise.resolve([]), (async()=>{
  const first=await fetchTruckers(token,{...directoryQuery,page:1}),rows=[...first.rows];
  for(let page=2;page<=first.pagination.totalPages;page++){if(apiCacheGeneration()!==generation)throw Error("Session changed.");const next=await fetchTruckers(token,{...directoryQuery,page});rows.push(...next.rows);}
  return rows;
 })()]);
 if(apiCacheGeneration()!==generation)throw Error("Session changed.");
 return {users,truckers};
}
export function filterDirectoryTruckers(rows:TruckerListItem[],search:string,status:string,assignment:string){
 const term=search.trim().toLocaleLowerCase();
 return rows.filter(row=>(!term||[row.full_name,row.email,row.contact_number,row.plate_number,row.active_trip_number,row.dr_number].some(value=>String(value??"").toLocaleLowerCase().includes(term)))
  &&(status==="all"||row.status?.toUpperCase()===status.toUpperCase())
  &&(assignment==="all"||(assignment==="assigned"?Boolean(row.active_trip_id):!row.active_trip_id)));
}
export async function createManagedUser(token:string,value:UserInput){const result=await unwrap(apiPost<ApiResponse<{user:{id:string};profile:ManagedUser}>>("/users",value,token),"Unable to create user.");invalidateUsers();return result;}
export async function updateManagedUser(token:string,id:string,value:UserInput){const result=await unwrap(apiPatch<ApiResponse<ManagedUser>>(`/users/${encodeURIComponent(id)}`,value,token),"Unable to update user.");invalidateUsers();return result;}
export async function uploadManagedProfilePicture(token: string, id: string, file: File) {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"}/users/${encodeURIComponent(id)}/profile-picture`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, ...getAppSessionHeaders(), "Content-Type": file.type }, body: file,
  });
  const payload = await response.json().catch(() => null) as ApiResponse<{ path: string; signed_url: string | null }> | null;
  if (!response.ok) await handleSessionExpiredResponse(response.status, payload, true);
  if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.message ?? "Profile picture upload failed.");
  invalidateUsers();return payload.data;
}

export type CompanyOption = { id: string; name: string };
export async function fetchCompanyOptions(token: string) {
  const response = await unwrap(apiGetCached<ApiResponse<Array<CompanyOption>>>("/lookups/trucking-companies", token), "Unable to load trucking companies.");
  return response;
}
