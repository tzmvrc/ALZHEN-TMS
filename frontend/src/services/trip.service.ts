import { apiGet, type ApiResponse } from "./api.service";

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

  const response = await apiGet<ApiResponse<TripPage>>(
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
  const response = await apiGet<ApiResponse<TripEvent[]>>(
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
  const response = await apiGet<ApiResponse<TripChildRecord[]>>(
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
  const response = await apiGet<ApiResponse<TripDetail>>(
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
  const response = await apiGet<ApiResponse<{ id: string; dispatch_number: string }>>(
    `/trips/dispatch/${encodeURIComponent(dispatchNumber)}`,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to resolve dispatch number.");
  }
  return response.data;
}

export function fetchTripStops(token: string, tripId: string) {
  return fetchTripChildren(token, tripId, "stops");
}

export function fetchTripLineItems(token: string, tripId: string) {
  return fetchTripChildren(token, tripId, "line-items");
}