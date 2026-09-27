import { supabaseAdmin } from "../config/supabase.js";
import { TripListResponse, TripQueryParams } from "../types/trip.types.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../utils/pagination.js";
import {
  isValidUuid,
  normalizeSortOrder,
  normalizeText,
} from "../utils/validation.js";

const ALLOWED_TRIP_SORTS = [
  "loading_date",
  "dispatch_number",
  "trip_number",
  "status",
  "estimated_delivery_date",
  "created_at",
];

function normalizeTripQuery(query: Record<string, unknown>) {
  const sortBy = ALLOWED_TRIP_SORTS.includes(String(query.sort_by ?? ""))
    ? String(query.sort_by)
    : "loading_date";
  const sortOrder = normalizeSortOrder(
    typeof query.sort_order === "string" ? query.sort_order : undefined,
    "desc",
  );

  if (
    query.page &&
    (Number(query.page) <= 0 || !Number.isInteger(Number(query.page)))
  ) {
    throw new Error("page must be a positive integer");
  }

  if (
    query.limit &&
    (Number(query.limit) <= 0 ||
      Number(query.limit) > 200 ||
      !Number.isInteger(Number(query.limit)))
  ) {
    throw new Error("limit must be a positive integer up to 200");
  }

  return { sortBy, sortOrder };
}

export async function getTripList(
  query: TripQueryParams,
): Promise<TripListResponse> {
  const { sortBy, sortOrder } = normalizeTripQuery(
    query as Record<string, unknown>,
  );
  const { page, limit, from } = normalizePagination(query);
  const search = normalizeText(query.search);
  const status = normalizeText(query.status);
  const loadingDateFrom = normalizeText(query.loading_date_from);
  const loadingDateTo = normalizeText(query.loading_date_to);
  const warehouseId = normalizeText(query.warehouse_id);
  const tripTypeId = normalizeText(query.trip_type_id);

  let queryBuilder = supabaseAdmin
    .from("trips")
    .select("*", { count: "exact" });

  if (status) queryBuilder = queryBuilder.eq("status", status);
  if (loadingDateFrom)
    queryBuilder = queryBuilder.gte("loading_date", loadingDateFrom);
  if (loadingDateTo)
    queryBuilder = queryBuilder.lte("loading_date", loadingDateTo);
  if (warehouseId) queryBuilder = queryBuilder.eq("warehouse_id", warehouseId);
  if (tripTypeId) queryBuilder = queryBuilder.eq("trip_type_id", tripTypeId);
  if (search) {
    queryBuilder = queryBuilder.or(
      `dispatch_number.ilike.%${search}%,transaction_number.ilike.%${search}%,trip_number.ilike.%${search}%`,
    );
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.range(from, from + limit - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Trip list query error:", { query, error });
    throw new Error("Unable to fetch trips");
  }

  return {
    rows: data ?? [],
    pagination: buildPaginationMeta(page, limit, count ?? (data ?? []).length),
  };
}

export async function getTripById(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trips")
    .select(
      "id, dispatch_number, trip_type_id, warehouse_id, loading_date, estimated_delivery_date, status, authorization_letter, page_no, remarks, created_by, created_at, updated_at, transaction_number, trip_number, added_to_report, letter_status, truck_allocated_by, subcon_rate_manual, signed_dr_upload_date, transmittal_date, tms_date, tms_done_by, pod_ac_shipping_date, lbc_tracking_number",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Trip detail query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip details");
  }

  if (!data) {
    throw new Error("Trip not found");
  }

  return {
    trip: data,
    trip_type: null,
    warehouse: null,
    created_by_profile: null,
  };
}

export async function getTripStops(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .select("*")
    .eq("trip_id", id)
    .order("stop_sequence", { ascending: true });

  if (error) {
    console.error("Trip stop query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip stops");
  }

  return data ?? [];
}

export async function getTripLineItems(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_line_items")
    .select("*")
    .eq("trip_id", id)
    .order("id", { ascending: true });

  if (error) {
    console.error("Trip line item query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip line items");
  }

  return data ?? [];
}

export async function getTripEvents(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_events")
    .select("*")
    .eq("trip_id", id)
    .order("event_time", { ascending: true });

  if (error) {
    console.error("Trip event query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip events");
  }

  return data ?? [];
}
