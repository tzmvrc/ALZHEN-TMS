import { ApiError, apiGet, type ApiResponse } from "./api.service";
import type { LocationSearchResult } from "./master-data.service";

export type TripLocationLookup = {
  status: "found" | "multiple" | "missing_province" | "missing_city" | "not_found" | "review_required" | "lookup_failed" | "not_configured" | "rate_limited" | "network_error";
  message: string;
  candidates: LocationSearchResult[];
  source: "store" | "geoapify" | "nominatim" | "none";
  source_key?: string;
  error_code?: string;
  retryable?: boolean;
};
export type TripLocationSource = { key: string; customer: string; shipTo: string; province: string; city: string };
export function verifiedStoreCoordinates(values: Record<string, string | undefined> = {}) {
  return values.location_verified === "true" && Boolean(values.address?.trim() && values.province?.trim() && values.city?.trim() && values.latitude?.trim() && values.longitude?.trim()) && Number.isFinite(Number(values.latitude)) && Math.abs(Number(values.latitude)) <= 90 && Number.isFinite(Number(values.longitude)) && Math.abs(Number(values.longitude)) <= 180;
}
export const locationLookupFailed = (lookup: TripLocationLookup | undefined) => Boolean(lookup && ["lookup_failed", "not_configured", "rate_limited", "network_error"].includes(lookup.status));
export async function resolveTripLocation(token: string, source: TripLocationSource, query = ""): Promise<TripLocationLookup> {
  const params = new URLSearchParams({ ship_to: source.shipTo, province: source.province, city: source.city, customer_name: source.customer });
  if (query.trim()) params.set("q", query.trim());
  const response = await apiGet<ApiResponse<TripLocationLookup>>(`/trips/import/location?${params}`, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Location lookup is unavailable.");
  return { ...response.data, source_key: locationLookupFailed(response.data) ? undefined : source.key };
}
export function failedTripLocation(source: TripLocationSource, error?: unknown): TripLocationLookup {
  const code = error instanceof ApiError ? error.code ?? `HTTP_${error.status}` : "LOCATION_NETWORK_ERROR";
  console.error("Delivery location request failed", { code });
  return { status: error instanceof ApiError && error.status === 429 ? "rate_limited" : code === "LOCATION_NETWORK_ERROR" ? "network_error" : "lookup_failed", error_code: code, retryable: true, message: `Cannot find exact location for Ship To ${source.shipTo} (${[source.province, source.city].filter(Boolean).join(", ")}) - Location lookup is unavailable. The destination can be saved with blank coordinates.`, candidates: [], source: "none" };
}
