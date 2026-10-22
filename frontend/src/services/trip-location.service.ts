import { apiGet, type ApiResponse } from "./api.service";
import type { LocationSearchResult } from "./master-data.service";

export type TripLocationLookup = {
  status: "found" | "multiple" | "missing_province" | "missing_city" | "not_found" | "review_required" | "lookup_failed";
  message: string;
  candidates: LocationSearchResult[];
  source: "store" | "geoapify" | "nominatim" | "none";
  source_key?: string;
};
export type TripLocationSource = { key: string; customer: string; shipTo: string; province: string; city: string };
export async function resolveTripLocation(token: string, source: TripLocationSource): Promise<TripLocationLookup> {
  const params = new URLSearchParams({ ship_to: source.shipTo, province: source.province, city: source.city, customer_name: source.customer });
  const response = await apiGet<ApiResponse<TripLocationLookup>>(`/trips/import/location?${params}`, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Location lookup is unavailable.");
  return { ...response.data, source_key: source.key };
}
export function failedTripLocation(source: TripLocationSource): TripLocationLookup {
  return { status: "lookup_failed", message: `Cannot find exact location for Ship To ${source.shipTo} (${[source.province, source.city].filter(Boolean).join(", ")}) - Location lookup is unavailable. The destination can be saved with blank coordinates.`, candidates: [], source: "none", source_key: source.key };
}
