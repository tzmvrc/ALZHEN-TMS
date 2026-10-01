import { apiGetCached, type ApiResponse } from "./api.service";

export type TruckerListItem = {
  id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  assigned_truck_id: string | null;
  plate_number: string | null;
  active_trip_id: string | null;
  active_trip_number: string | null;
  current_trip_status: string | null;
  delivery_status: string | null;
  loading_date: string | null;
};

export type TruckerDetail = {
  id: string;
  driver_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  truck: {
    id: string | null;
    plate_number: string | null;
    truck_number: string | null;
    make: string | null;
    model: string | null;
    status: string | null;
  } | null;
  active_trip: {
    id: string | null;
    trip_number: string | null;
    dispatch_number: string | null;
    status: string | null;
    loading_date: string | null;
    estimated_delivery_date: string | null;
    route: string | null;
    delivery_status: string | null;
  } | null;
  trip_history: Array<{
    id: string;
    trip_number: string | null;
    dispatch_number: string | null;
    status: string | null;
    loading_date: string | null;
    estimated_delivery_date: string | null;
    origin: string | null;
    destination: string | null;
    customer: string | null;
    store: string | null;
    delivery_status: string | null;
    plate_number: string | null;
  }>;
};

export async function fetchTruckers(token: string, params: {
  search?: string;
  status?: string;
  assignment?: "all" | "assigned" | "unassigned";
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.assignment && params.assignment !== "all") searchParams.set("assignment", params.assignment);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const response = await apiGetCached<ApiResponse<{ rows: TruckerListItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>>(
    `/truckers${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load truckers.");
  }

  return response.data;
}

export async function fetchTruckerDetail(token: string, truckerId: string): Promise<TruckerDetail> {
  const response = await apiGetCached<ApiResponse<TruckerDetail>>(
    `/truckers/${encodeURIComponent(truckerId)}`,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trucker details.");
  }

  return response.data;
}
