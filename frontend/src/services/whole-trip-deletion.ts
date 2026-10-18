import { apiPost, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportPageCache } from "./report.service";

export type WholeTripImpact = {
  trips: Array<{ id: string; dispatch_number: string | null }>;
  counts: Record<string, number>;
  blockers: string[];
  can_delete: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Selection is page-scoped; a missing/stale row fails closed. Never infer from DR/dispatch. */
function parentTripIds(rows: readonly ({ trip_id?: unknown } | undefined)[]): string[] | null {
  if (!rows.length || rows.some(row => !row || typeof row.trip_id !== "string" || !uuid.test(row.trip_id))) return null;
  const ids = [...new Set(rows.map(row => (row!.trip_id as string).toLowerCase()))].sort();
  return ids;
}
export function selectedParentTripCount(rows: readonly ({ trip_id?: unknown } | undefined)[]): number | null {
  return parentTripIds(rows)?.length ?? null;
}
export function selectedParentTripIds(rows: readonly ({ trip_id?: unknown } | undefined)[]): string[] | null {
  const ids=parentTripIds(rows);
  return ids && ids.length <= 20 ? ids : null;
}
export async function fetchWholeTripImpact(token: string, tripIds: string[]): Promise<WholeTripImpact> {
  const response = await apiPost<ApiResponse<WholeTripImpact>>("/trips/whole-delete/impact", { trip_ids: tripIds }, token);
  if (!response.success || !response.data) throw Error("Impact unavailable");
  return response.data;
}
export function invalidateWholeTripCaches() {
  invalidateReportPageCache();
  for (const prefix of ["/reports", "/transmittal-tracker", "/trips", "/truckers", "/tracking", "/dashboard", "/flexible-tables", "/calendar/events", "/documents"]) invalidateApiCache(prefix);
}
export async function deleteWholeTrips(token: string, tripIds: string[], currentPassword: string) {
  if (!currentPassword) throw Error("Enter your current account password.");
  const response = await apiPost<ApiResponse<{ cleanup_pending: boolean; deleted_trips?: number }>>("/trips/whole-delete", { trip_ids: tripIds, current_password: currentPassword }, token);
  if (!response.success || !response.data || typeof response.data.cleanup_pending !== "boolean") throw Error("Deletion was not confirmed");
  invalidateWholeTripCaches();
  return response.data;
}
