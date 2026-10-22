import type { LocationSearchResult } from "./location-search.service.js";

export type Destination = { ship_to: string; province: string; city: string; customer_name?: string };
export type LocationLookup = {
  status: "found" | "multiple" | "missing_province" | "missing_city" | "not_found" | "review_required" | "lookup_failed";
  message: string;
  candidates: LocationSearchResult[];
  source: "store" | "geoapify" | "nominatim" | "none";
};
export const locationIdentity = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const geography = (value: string) => locationIdentity(value.replace(/\b(?:province|city|of)\b/gi, ""));
export const storeIdentityText = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const destinationLookupKey = (source: Destination) => JSON.stringify([source.ship_to, source.province, source.city].map(storeIdentityText));
export function locationMessage(source: Destination, status: LocationLookup["status"], address = ""): string {
  const name = source.ship_to || "(unnamed destination)";
  const area = [source.province, source.city].filter(Boolean).join(", ");
  const suffix = area ? ` (${area})` : "";
  if (status === "missing_province") return `Cannot find exact location for Ship To ${name} - Province is missing.`;
  if (status === "missing_city") return `Cannot find exact location for Ship To ${name}${suffix} - City is missing.`;
  if (status === "found") return `Exact location found for Ship To ${name}${suffix}, at ${address}. Please verify.`;
  if (status === "multiple") return `Multiple locations found for Ship To ${name}${suffix}. Please select the correct location.`;
  if (status === "review_required") return `Location candidate found for Ship To ${name}${suffix}. The exact store address is not confirmed. Please select and verify the correct location.`;
  if (status === "lookup_failed") return `Cannot find exact location for Ship To ${name}${suffix} - Location lookup is unavailable. The destination can be saved with blank coordinates.`;
  return `Cannot find exact location for Ship To ${name}${suffix}. Please review the address; coordinates will remain blank.`;
}
export function classifyLocations(source: Destination, candidates: LocationSearchResult[], origin: LocationLookup["source"]): LocationLookup {
  const unique = [...new Map(candidates.map(candidate => [JSON.stringify([locationIdentity(candidate.display_name), candidate.latitude.toFixed(6), candidate.longitude.toFixed(6)]), candidate])).values()];
  let status: LocationLookup["status"] = !unique.length ? "not_found" : unique.length > 1 ? "multiple" : "review_required";
  if (!source.province.trim()) status = "missing_province";
  else if (!source.city.trim()) status = "missing_city";
  else if (unique.length === 1) {
    const candidate = unique[0];
    const administrative = /^(city|town|village|municipality|state|county|country|postcode|suburb|district|region)$/i.test(candidate.result_type ?? "");
    const province = candidate.provinces?.some(value => geography(value) === geography(source.province));
    const city = candidate.cities?.some(value => geography(value) === geography(source.city));
    const named = locationIdentity(candidate.name ?? "") === locationIdentity(source.ship_to)
      || locationIdentity(candidate.display_name).includes(locationIdentity(source.ship_to));
    if (origin === "store" || (!administrative && named && province && city && candidate.country_code?.toLowerCase() === "ph")) status = "found";
  }
  return { status, message: locationMessage(source, status, status === "found" ? unique[0].display_name : ""), candidates: unique, source: origin };
}
