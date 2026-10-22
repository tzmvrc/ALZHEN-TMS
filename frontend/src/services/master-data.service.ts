import { ApiError, apiGet, apiGetCached, getCachedApiResponse, invalidateApiCache, apiPatch, apiPost, getAppSessionHeaders, handleSessionExpiredResponse, type ApiResponse } from "./api.service";

export type MasterDataKey = "customers" | "warehouses" | "trucks" | "stores" | "store-contacts" | "products" | "drivers" | "trucking-companies";
export type MasterDataRow = Record<string, unknown> & { id: string };
export type MasterDataPage = { location_verification_supported?:boolean; rows: MasterDataRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type LocationSearchResult = { display_name: string; latitude: number; longitude: number };
export type SavedMapLocation = {
  id: string;
  kind: "warehouse" | "store";
  name: string;
  code: string;
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
};

export const getCachedMasterData=(token:string,resource:MasterDataKey,search="",page=1,limit=100,sort="",direction="asc")=>{
  const query=new URLSearchParams({page:String(page),limit:String(limit)});if(search.trim())query.set("search",search.trim());if(sort){query.set("sort",sort);query.set("direction",direction);}
  return getCachedApiResponse<ApiResponse<MasterDataPage>>(`/master-data/${resource}?${query}`,token,5*60_000)?.data??null;
};

export async function fetchMasterData(token: string, resource: MasterDataKey, search: string, page = 1, limit=100, sort="", direction="asc"): Promise<MasterDataPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set("search", search.trim());
  if(sort){query.set("sort",sort);query.set("direction",direction);}
  const response = await apiGetCached<ApiResponse<MasterDataPage>>(`/master-data/${resource}?${query}`, token,30_000);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load master data.");
  return response.data;
}

export async function fetchSavedMapLocations(token: string): Promise<SavedMapLocation[]> {
  const resources = ["warehouses", "stores"] as const;
  const pages = await Promise.all(resources.map(async (resource) => {
    const firstPage = await fetchMasterData(token, resource, "");
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, firstPage.pagination.totalPages - 1) }, (_, index) =>
        fetchMasterData(token, resource, "", index + 2),
      ),
    );
    return { resource, rows: [...firstPage.rows, ...remainingPages.flatMap((page) => page.rows)] };
  }));

  return pages.flatMap(({ resource, rows }) => rows.flatMap((row): SavedMapLocation[] => {
    if (row.location_verified !== true) return [];
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (
      row.latitude === null || row.latitude === undefined || row.latitude === "" ||
      row.longitude === null || row.longitude === undefined || row.longitude === "" ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) return [];
    const name = typeof row.name === "string" ? row.name : "";
    const code = typeof row.code === "string" ? row.code : "";
    return [{
      id: row.id,
      kind: resource === "warehouses" ? "warehouse" : "store",
      name: name || code || (resource === "warehouses" ? "Warehouse" : "Store"),
      code,
      address: typeof row.address === "string" ? row.address : "",
      city: typeof row.city === "string" ? row.city : "",
      province: typeof row.province === "string" ? row.province : "",
      latitude,
      longitude,
    }];
  }));
}

export async function saveMasterData(token: string, resource: MasterDataKey, values: Record<string, unknown>, id?: string) {
  const response = id
    ? await apiPatch<ApiResponse<MasterDataRow>>(`/master-data/${resource}/${encodeURIComponent(id)}`, values, token)
    : await apiPost<ApiResponse<MasterDataRow>>(`/master-data/${resource}`, values, token);
  if (!response.success || !response.data || typeof response.data.id!=="string" || (id&&response.data.id!==id)) throw new Error(response.message ?? "The server did not confirm this record update. Your draft is preserved.");
  invalidateApiCache(`/master-data/${resource}`);
  invalidateApiCache("/lookups/");
  return response.data;
}

export async function searchWarehouseLocations(token: string, query: string): Promise<LocationSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const response = await apiGet<ApiResponse<LocationSearchResult[]>>(`/master-data/locations/search?${params}`, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to search map locations.");
  return response.data;
}

export type TruckImage = { id: string; truck_id: string; storage_path: string; file_name: string; display_order: number; created_at: string; updated_at: string; signed_url: string };
const apiBaseUrl = import.meta.env?.VITE_API_URL ?? "http://localhost:5000/api";

async function imageRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...getAppSessionHeaders(), ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok) await handleSessionExpiredResponse(response.status, payload, true);
  if (!response.ok || !payload?.success || payload.data === undefined) throw new Error(payload?.message ?? "Truck image request failed.");
  return payload.data;
}

export const fetchTruckImages = (token: string, truckId: string) => imageRequest<TruckImage[]>(`/master-data/trucks/${encodeURIComponent(truckId)}/images`, token);

export const uploadTruckImage = (token: string, truckId: string, file: File) => imageRequest<TruckImage>(`/master-data/trucks/${encodeURIComponent(truckId)}/images`, token, {
  method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file,
});

export const deleteTruckImage = (token: string, truckId: string, imageId: string) => imageRequest<{ id: string }>(`/master-data/trucks/${encodeURIComponent(truckId)}/images/${encodeURIComponent(imageId)}`, token, { method: "DELETE" });

export async function fetchCalendarEvents(token: string, start: string, end: string) {
  const query = new URLSearchParams({ start, end });
  const response = await apiGet<ApiResponse<Array<{ id: string; date: string; title: string; type: string; detail: string; trip_id?: string | null }>>>(`/calendar/events?${query}`, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load calendar events.");
  return response.data;
}

export async function deleteMasterDataRecords(token:string,resource:MasterDataKey,ids:string[]){
 const response=await apiPost<ApiResponse<{deleted:string[];failed:Array<{id:string;message:string}>}>>(`/master-data/${resource}/delete-records`,{ids},token);
 if(!response.success||!response.data)throw Error("Unable to delete the selected records. Please try again.");
 if(response.data.deleted.length){invalidateApiCache(`/master-data/${resource}`);invalidateApiCache("/lookups/");}
 return response.data;
}

export async function readMasterDataRecord(token:string,resource:MasterDataKey,id:string):Promise<MasterDataRow|null>{
 try{const response=await apiGet<ApiResponse<MasterDataRow>>(`/master-data/${resource}/${encodeURIComponent(id)}`,token);if(!response.success||!response.data)throw Error("Unable to read this record.");return response.data;}catch(error){if(error instanceof ApiError&&error.status===404)return null;throw error;}
}

export type MasterDataSelection = {search:string;before:string;total:number};
export async function readMasterDataSelection(token:string,resource:MasterDataKey,input:{search:string;before?:string;after?:string;includeIds?:boolean;excluded?:string[]}){
 const response=await apiPost<ApiResponse<MasterDataSelection&{ids:string[];next:string|null}>>(`/master-data/${resource}/selection`,input,token);
 if(!response.success||!response.data)throw Error(response.message??"Unable to select matching records.");
 return response.data;
}
