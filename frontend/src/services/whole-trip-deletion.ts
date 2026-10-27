import { apiPost, apiCacheGeneration, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportPageCache } from "./report.service";

export type WholeTripImpact = {
  trips: Array<{ id: string; dispatch_number: string | null }>;
  counts: Record<string, number>;
  blockers: string[];
  can_delete: boolean;
  attachment_review?: Array<{ update_id: string; trip_id: string; image_id: string | null; trip_stop_id: string | null; status: "VERIFIED" | "BLOCKED"; reason: string }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WHOLE_TRIP_DELETE_LIMIT = 20;
/** A missing/stale row fails closed. Never infer physical trips from DR/dispatch. */
function parentTripIds(rows: readonly ({ trip_id?: unknown; _trip_id?: unknown } | undefined)[]): string[] | null {
  const idOf = (row: { trip_id?: unknown; _trip_id?: unknown } | undefined) =>
    typeof row?.trip_id === "string" && uuid.test(row.trip_id) ? row.trip_id : row?._trip_id;
  if (!rows.length || rows.some(row => { const id = idOf(row); return typeof id !== "string" || !uuid.test(id); })) return null;
  const ids = [...new Set(rows.map(row => String(idOf(row)).toLowerCase()))].sort();
  return ids;
}
export function selectedParentTripCount(rows: readonly ({ trip_id?: unknown; _trip_id?: unknown } | undefined)[]): number | null {
  return parentTripIds(rows)?.length ?? null;
}
export function selectedParentTripIds(rows: readonly ({ trip_id?: unknown; _trip_id?: unknown } | undefined)[]): string[] | null {
  return parentTripIds(rows);
}
export async function fetchWholeTripImpact(token: string, tripIds: string[],signal?:AbortSignal): Promise<WholeTripImpact> {
  const response = await apiPost<ApiResponse<WholeTripImpact>>(tripIds.length>WHOLE_TRIP_DELETE_LIMIT?"/trips/whole-delete/bulk/impact":"/trips/whole-delete/impact", { trip_ids: tripIds }, token,signal);
  if (!response.success || !response.data) throw Error("Impact unavailable");
  return response.data;
}

export type WholeTripBulkResult={deleted_trip_ids:string[];remaining_trip_ids:string[];deleted_trips:number;cleanup_pending:boolean;stopped_error?:string;stopped_status?:number};
const pendingBulkDeletions=new Map<string,Promise<WholeTripBulkResult>>();
export async function deleteWholeTripSelection(token:string,tripIds:string[]):Promise<WholeTripBulkResult>{
 const ids=[...new Set(tripIds)].sort();
 if(ids.length<=WHOLE_TRIP_DELETE_LIMIT){const result=await deleteWholeTrips(token,ids);return {...result,deleted_trip_ids:ids,remaining_trip_ids:[],deleted_trips:ids.length};}
 const key=JSON.stringify([apiCacheGeneration(),token,ids]),pending=pendingBulkDeletions.get(key);if(pending)return pending;
 const request=(async()=>{
  const response=await apiPost<ApiResponse<WholeTripBulkResult>>("/trips/whole-delete/bulk",{trip_ids:ids},token);
  const result=response.data;
  if(!response.success||!result||!Array.isArray(result.deleted_trip_ids)||!Array.isArray(result.remaining_trip_ids)||typeof result.cleanup_pending!=="boolean")throw Error("Deletion was not confirmed. Reload to check the selected trips.");
  const partition=[...result.deleted_trip_ids,...result.remaining_trip_ids],expected=new Set(ids);
  if(result.deleted_trips!==result.deleted_trip_ids.length||partition.length!==ids.length||new Set(partition).size!==ids.length||partition.some(id=>!expected.has(id))||result.remaining_trip_ids.length&&!result.stopped_error)throw Error("Deletion acknowledgement is incomplete. Reload before retrying.");
  if(result.deleted_trip_ids.length)invalidateWholeTripCaches();
  return result;
 })();
 pendingBulkDeletions.set(key,request);
 try{return await request;}finally{if(pendingBulkDeletions.get(key)===request)pendingBulkDeletions.delete(key);}
}
export function invalidateWholeTripCaches() {
  invalidateReportPageCache();
  for (const prefix of ["/reports", "/transmittal-tracker", "/trips", "/truckers", "/tracking", "/dashboard", "/flexible-tables", "/calendar/events", "/documents"]) invalidateApiCache(prefix);
}
type DeletionResult={cleanup_pending:boolean;deleted_trips?:number};
// Only reuse a pending request for the same session and exact immutable batch.
// Entries are removed on settlement; no authorization or password is persisted.
const pendingDeletions=new Map<string,Promise<DeletionResult>>();
export async function deleteWholeTrips(token: string, tripIds: string[], _currentPassword?: string) {
  void _currentPassword; // Compatibility argument; confirmation uses the current authenticated session.
  const ids=[...new Set(tripIds)].sort(),key=JSON.stringify([apiCacheGeneration(),token,ids]);
  if(!ids.length||ids.length>WHOLE_TRIP_DELETE_LIMIT)throw Error("Select one to twenty unique trips.");
  const pending=pendingDeletions.get(key);if(pending)return pending;
  const request=(async()=>{
    const response = await apiPost<ApiResponse<DeletionResult>>("/trips/whole-delete", { trip_ids: ids }, token);
    if (!response.success || !response.data || typeof response.data.cleanup_pending !== "boolean" || (response.data.deleted_trips!==undefined&&response.data.deleted_trips!==ids.length)) throw Error("Deletion was not confirmed");
    invalidateWholeTripCaches();
    return response.data;
  })();
  pendingDeletions.set(key,request);
  try{return await request;}finally{if(pendingDeletions.get(key)===request)pendingDeletions.delete(key);}
}
