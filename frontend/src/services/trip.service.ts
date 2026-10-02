import { apiGetCached, apiPatch, type ApiResponse } from "./api.service";

export type TripRecord = Record<string, unknown> & {
  id?: string;
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

export type TripDetail = {
  trip: TripRecord;
  trip_type: Record<string, unknown> | null;
  warehouse: Record<string, unknown> | null;
  created_by_profile: Record<string, unknown> | null;
};

export type TripChildRecord = Record<string, unknown>;

export async function fetchTrips(
  token: string,
  options: {
    limit: number;
    status?: string;
    search?: string;
    sortBy?: "loading_date" | "dispatch_number";
    sortOrder?: "asc" | "desc";
  },
): Promise<TripPage> {
  const params = new URLSearchParams({
    page: "1",
    limit: String(options.limit),
    sort_by: options.sortBy ?? "loading_date",
    sort_order: options.sortOrder ?? "desc",
  });
  if (options.status) params.set("status", options.status);
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
    token,
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
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trip details.");
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
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ id: string }>>(
    `/trips/${encodeURIComponent(tripId)}`,
    updates,
    token,
  );

  if (!response.success) {
    throw new Error(response.message ?? "Unable to save trip update.");
  }
}

export async function updateTripStopRecord(
  token: string,
  tripId: string,
  stopId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ id: string }>>(
    `/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}`,
    updates,
    token,
  );

  if (!response.success) {
    throw new Error(response.message ?? "Unable to save stop update.");
  }
}

export async function updateTripLineItemRecord(
  token: string,
  tripId: string,
  stopId: string,
  lineItemId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ id: string }>>(
    `/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/line-items/${encodeURIComponent(lineItemId)}`,
    updates,
    token,
  );

  if (!response.success) {
    throw new Error(response.message ?? "Unable to save line item update.");
  }
}

export async function updateTripAssignmentRecord(
  token: string,
  tripId: string,
  assignmentId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ id: string }>>(
    `/trips/${encodeURIComponent(tripId)}/assignments/${encodeURIComponent(assignmentId)}`,
    updates,
    token,
  );

  if (!response.success) {
    throw new Error(
      response.message ?? "Unable to save trip assignment update.",
    );
  }
}

export async function updateStoreCallRecord(
  token: string,
  storeCallId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ id: string }>>(
    `/store-calls/${encodeURIComponent(storeCallId)}`,
    updates,
    token,
  );

  if (!response.success) {
    throw new Error(response.message ?? "Unable to save store call update.");
  }
}
