import { apiGet, apiPatch, apiPost, getAppSessionHeaders, handleSessionExpiredResponse, type ApiResponse } from "./api.service";

export type MasterDataKey = "warehouses" | "trucks" | "stores" | "store-contacts" | "products";
export type MasterDataRow = Record<string, unknown> & { id: string };
export type MasterDataPage = { rows: MasterDataRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

export async function fetchMasterData(token: string, resource: MasterDataKey, search: string, page = 1): Promise<MasterDataPage> {
  const query = new URLSearchParams({ page: String(page), limit: "100" });
  if (search.trim()) query.set("search", search.trim());
  const response = await apiGet<ApiResponse<MasterDataPage>>(`/master-data/${resource}?${query}`, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load master data.");
  return response.data;
}

export async function saveMasterData(token: string, resource: MasterDataKey, values: Record<string, unknown>, id?: string) {
  const response = id
    ? await apiPatch<ApiResponse<MasterDataRow>>(`/master-data/${resource}/${encodeURIComponent(id)}`, values, token)
    : await apiPost<ApiResponse<MasterDataRow>>(`/master-data/${resource}`, values, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to save this record.");
  return response.data;
}

export type TruckImage = { id: string; truck_id: string; storage_path: string; file_name: string; display_order: number; created_at: string; updated_at: string; signed_url: string };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

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
