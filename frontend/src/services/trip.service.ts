import type {DeliveryEvent} from './delivery.service';
import { apiDelete, apiGetCached, apiPatch, apiPost, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportPageCache } from "./report.service";

export async function updateMasterListCell(token: string, trip: string, stop: string | undefined, line: string | undefined, field: string, value: unknown) {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(`/trips/${encodeURIComponent(trip)}/master-list-cell`, { stop_id: stop ?? null, line_item_id: line ?? null, field, value }, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to save Master List value.");
  invalidateTripRelatedCache();
  return response.data;
}

export function invalidateTripListCache() {
  // The query marker keeps this scoped to paginated trip lists, not trip
  // details, events, images, stops, or line-item responses.
  invalidateApiCache("/trips?");
}
export async function createProductRows(token: string, trip: string, stop: string, rows: { id: string; values: Record<string, unknown> }[]) {
  const response = await apiPost<ApiResponse<Record<string, unknown>[]>>(`/trips/${encodeURIComponent(trip)}/stops/${encodeURIComponent(stop)}/line-items/batch`, { rows }, token);
  if (!response.success || !response.data || response.data.length !== rows.length) throw new Error(response.message ?? "New row save was not confirmed. Retry the same drafts.");
  invalidateTripRelatedCache();
  return response.data;
}

/* Drops every cached response for one trip (details, stops, line items, events, photos).
   Call it when a realtime update says something changed, so the next read is fresh. */
export function invalidateTripCache(tripId: string) {
  invalidateApiCache(`/trips/${encodeURIComponent(tripId)}`);
}

export function invalidateTripEventsCache(tripId: string) {
  invalidateApiCache(`/trips/${encodeURIComponent(tripId)}/events`);
}

function invalidateTripRelatedCache() {
  invalidateApiCache("/trips");
  invalidateApiCache("/truckers");
  invalidateApiCache("/reports");
  invalidateReportPageCache();
}

export async function saveTransactionReference(token: string, tripId: string, stopId: string, value: unknown, expectedVersion: number) {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(`/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/transmittal-reference`, { value, expected_version: expectedVersion }, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to save Transmittal reference.");
  invalidateTripRelatedCache();
  return response.data;
}

export async function archiveTransaction(token: string, tripId: string, stopId: string | null, archived: boolean) {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(`/trips/${encodeURIComponent(tripId)}/transaction-archive`, { trip_stop_id: stopId, archived }, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to archive transaction.");
  invalidateTripRelatedCache();
  return response.data;
}

export type TransactionDeletion = { operation_id: string; transaction_id: string; trip_id: string; trip_stop_id: string | null; cleanup_pending: boolean };
export type TransactionCleanup = { id: string; transaction_id: string; trip_id: string; trip_stop_id: string | null };
export async function deleteTransaction(token: string, tripId: string, stopId: string | null, _currentPassword?: string) {
  void _currentPassword; // Compatibility argument; authorization uses the current session.
  const path = `/trips/${encodeURIComponent(tripId)}${stopId ? `/stops/${encodeURIComponent(stopId)}` : ""}`;
  const response = await apiDelete<ApiResponse<TransactionDeletion>>(path, token, {});
  if (!response.success || !response.data) throw new Error(response.message ?? "Deletion could not be confirmed. Retry the same transaction.");
  invalidateTripRelatedCache();
  return response.data;
}
export async function fetchTransactionCleanup(token: string) {
  // Share concurrent mount reads without retaining stale cleanup status.
  const response = await apiGetCached<ApiResponse<TransactionCleanup[]>>("/trips/transaction-cleanup", token, 0);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load pending cleanup.");
  return response.data;
}
export async function retryTransactionCleanup(token: string, id: string) {
  const response = await apiPost<ApiResponse<TransactionDeletion>>(`/trips/transaction-cleanup/${encodeURIComponent(id)}/retry`, {}, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Image cleanup could not be confirmed.");
  return response.data;
}

export type TripRecord = Record<string, unknown> & {
  id?: string;
  trip_reference?: string | null;
  dispatch_number?: string | null;
  loading_date?: string | null;
  estimated_delivery_date?: string | null;
  status?: string | null;
};

export type TripPage = {
  rows: TripRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type TripEvent = {
  delivery_metadata?: DeliveryEvent['delivery_metadata'];
  assignment_id?: string | null;
  id: string;
  trip_id: string;
  trip_stop_id?: string | null;
  event_type: string;
  event_time: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  notes?: string | null;
  recorded_by?: string | null;
};

const TRIP_EVENT_CACHE_TTL_MS = 45_000;

export type TripDetail = {
  trip: TripRecord;
  trip_type: Record<string, unknown> | null;
  warehouse: Record<string, unknown> | null;
  created_by_profile: Record<string, unknown> | null;
};

export type TripChildRecord = Record<string, unknown>;
export type TripAssignmentRecord = Record<string, unknown> & {
  id: string;
  trip_id: string;
  truck?: Record<string, unknown> | null;
  driver?: Record<string, unknown> | null;
  trucking_company?: Record<string, unknown> | null;
};

export async function fetchTrips(
  token: string,
  options: {
    limit: number;
    page?: number;
    archiveScope?: "active";
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: "loading_date" | "dispatch_number";
    sortOrder?: "asc" | "desc";
  },
): Promise<TripPage> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit),
    sort_by: options.sortBy ?? "loading_date",
    sort_order: options.sortOrder ?? "desc",
  });
  if (options.status) params.set("status", options.status);
  if (options.dateFrom) params.set("loading_date_from", options.dateFrom);
  if (options.dateTo) params.set("loading_date_to", options.dateTo);
  if (options.archiveScope) params.set("archive_scope", options.archiveScope);
  if (options.search?.trim()) params.set("search", options.search.trim());

  const response = await apiGetCached<ApiResponse<TripPage>>(
    `/trips?${params.toString()}`,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trips.");
  }
  return response.data;
}

export async function fetchTripEvents(
  token: string,
  tripId: string,
): Promise<TripEvent[]> {
  const response = await apiGetCached<ApiResponse<TripEvent[]>>(
    `/trips/${encodeURIComponent(tripId)}/events`,
    token,
    TRIP_EVENT_CACHE_TTL_MS,undefined,20_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trip events.");
  }
  return response.data;
}

async function fetchTripChildren(
  token: string,
  tripId: string,
  resource: "stops" | "line-items",
): Promise<TripChildRecord[]> {
  const response = await apiGetCached<ApiResponse<TripChildRecord[]>>(
    `/trips/${encodeURIComponent(tripId)}/${resource}`,
    token,undefined,undefined,20_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? `Unable to load trip ${resource}.`);
  }
  return response.data;
}

export async function fetchTripDetail(
  token: string,
  tripId: string,
): Promise<TripDetail> {
  const response = await apiGetCached<ApiResponse<TripDetail>>(
    `/trips/${encodeURIComponent(tripId)}`,
    token,undefined,undefined,20_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trip details.");
  }
  return response.data;
}

export async function fetchTripAssignments(
  token: string,
  tripId: string,
): Promise<TripAssignmentRecord[]> {
  const response = await apiGetCached<ApiResponse<TripAssignmentRecord[]>>(
    `/trips/${encodeURIComponent(tripId)}/assignments`,
    token,
    undefined,
    undefined,
    20_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trip truck assignments.");
  }
  return response.data;
}

export async function fetchTripByDispatchNumber(
  token: string,
  dispatchNumber: string,
): Promise<{ id: string; dispatch_number: string }> {
  const response = await apiGetCached<
    ApiResponse<{ id: string; dispatch_number: string }>
  >(`/trips/dispatch/${encodeURIComponent(dispatchNumber)}`, token);
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to resolve dispatch number.");
  }
  return response.data;
}

export function fetchTripStops(token: string, tripId: string) {
  return fetchTripChildren(token, tripId, "stops");
}

export type TripStopRecord = Record<string, unknown> & {
  id?: string;
  trip_id?: string | null;
  stop_sequence?: number | string | null;
  delivery_status?: string | null;
};

export function fetchTripLineItems(token: string, tripId: string) {
  return fetchTripChildren(token, tripId, "line-items");
}

export async function updateTripRecord(
  token: string,
  tripId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}`,
    updates,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save trip update.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateTripStopRecord(
  token: string,
  tripId: string,
  stopId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}`,
    updates,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save stop update.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateTripLineItemRecord(
  token: string,
  tripId: string,
  stopId: string,
  lineItemId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/line-items/${encodeURIComponent(lineItemId)}`,
    updates,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save line item update.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateTripUnscopedLineItemRecord(
  token: string,
  tripId: string,
  lineItemId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/line-items/${encodeURIComponent(lineItemId)}`,
    updates,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save trip line item update.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateTripAssignmentRecord(
  token: string,
  tripId: string,
  assignmentId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/assignments/${encodeURIComponent(assignmentId)}`,
    updates,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(
      response.message ?? "Unable to save trip assignment update.",
    );
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function createTripAssignmentRecord(
  token: string,
  tripId: string,
  assignment: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPost<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/assignments`,
    assignment,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to create trip assignment.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateTripBillingRecord(
  token: string,
  tripId: string,
  billingId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/trips/${encodeURIComponent(tripId)}/billings/${encodeURIComponent(billingId)}`,
    updates,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save billing update.");
  }
  invalidateTripRelatedCache();
  return response.data;
}

export async function updateStoreCallRecord(
  token: string,
  storeCallId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPatch<ApiResponse<Record<string, unknown>>>(
    `/store-calls/${encodeURIComponent(storeCallId)}`,
    updates,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save store call update.");
  }
  invalidateApiCache("/store-calls");
  invalidateApiCache("/reports/store-calling");
  invalidateReportPageCache("store-calling");
  return response.data;
}

/* Persists the trip bundle through the backend, including stops, product lines,
   and any initial vehicle assignment. */
export async function createTrip(
  token: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await apiPost<ApiResponse<Record<string, unknown>>>(
    "/trips",
    payload,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to create trip.");
  }
  invalidateTripRelatedCache();
  invalidateTripListCache();
  return response.data;
}

export type LineItemDeletionTarget={tripId:string;stopId:string;id:string};
/** Exact child record identities only; never falls back to stop or parent deletion. */
export function lineItemDeletionTargets(rows:Record<string,unknown>[]):LineItemDeletionTarget[]|null {
 if(!rows.length || rows.some(row => row._new_product_draft))return null;
 const unique=new Map<string,LineItemDeletionTarget>();
 const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 for(const row of rows){const tripId=row.trip_id??row._trip_id,stopId=row.trip_stop_id??row._trip_stop_id,id=row.trip_line_item_id??row._trip_line_item_id;
  if(!uuid(tripId)||!uuid(stopId)||!uuid(id))return null;
  const previous=unique.get(id);if(previous&&(previous.tripId!==tripId||previous.stopId!==stopId))return null;
  unique.set(id,{tripId,stopId,id});
 }
 return [...unique.values()];
}
export async function deleteSelectedLineItems(token:string,targets:LineItemDeletionTarget[]){
 const bounded=lineItemDeletionTargets(targets.map(target=>({trip_id:target.tripId,trip_stop_id:target.stopId,trip_line_item_id:target.id})));
 if(!bounded||bounded.length>20)throw Error("Select at most 20 verified line items.");
 const deleted:LineItemDeletionTarget[]=[],failed:LineItemDeletionTarget[]=[];
 for(const target of bounded){try{
  const response=await apiDelete<ApiResponse<{id:string}>>(`/trips/${encodeURIComponent(target.tripId)}/stops/${encodeURIComponent(target.stopId)}/line-items/${encodeURIComponent(target.id)}`,token);
  if(!response.success||response.data?.id!==target.id)throw Error("Deletion was not confirmed.");
  deleted.push(target);invalidateTripCache(target.tripId);
 }catch{failed.push(target);}}
 if(deleted.length){invalidateApiCache("/reports");invalidateReportPageCache();}
 return {deleted,failed};
}

export async function fetchHomeTripDetails(token:string,tripIds:string[]){
 const result=await apiPost<ApiResponse<{events:TripEvent[];images:import("./trip-image.service").TripImage[]}>>("/trips/overview-details",{trip_ids:tripIds},token);
 if(!result.success||!result.data)throw new Error(result.message??"Unable to load dashboard details.");return result.data;
}
