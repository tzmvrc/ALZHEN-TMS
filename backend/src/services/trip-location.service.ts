import { saveTripDeliveryAddress } from "./trip-delivery-address.service.js";
import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { searchLocations, LocationSearchError, type LocationSearchResult } from "./location-search.service.js";
import { deliveryLocationQuery, rankDeliveryLocations } from "../../../packages/trip-import/location-query.js";
import { classifyLocations, destinationLookupKey, storeIdentityText, locationMessage, type Destination, type LocationLookup } from "./trip-location.logic.js";
import { importStoreResolver } from "./trip-store-identity.service.js";

const exactLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const lookupCache = new Map<string, { expires: number; result: LocationLookup }>();
const lookups = new Map<string, Promise<LocationLookup>>();
let lookupRevision = 0;
/** A reviewed store update must not leave its former pin in the suggestion cache. */
export function invalidateDeliveryLocationLookup(shipTo: string) {
  lookupRevision++;
  for (const key of new Set([...lookupCache.keys(), ...lookups.keys()])) {
    const [, destination] = JSON.parse(key) as [string, string, string];
    const [name] = JSON.parse(destination) as string[];
    if (storeIdentityText(name) === storeIdentityText(shipTo)) { lookupCache.delete(key); lookups.delete(key); }
  }
}
export function parseDestination(input: Record<string, unknown>): Destination {
  const result = Object.fromEntries(["ship_to", "province", "city", "customer_name"].map(key => {
    const value = input[key];
    if (value != null && (typeof value !== "string" || value.length > 200)) throw new ApiError("Use a destination, province and city of 200 characters or fewer.", 400);
    return [key, typeof value === "string" ? value.trim() : ""];
  })) as Destination;
  if (!result.ship_to) throw new ApiError("Ship To is required for a location lookup.", 400);
  return result;
}
async function readSavedLocations(source: Destination): Promise<LocationSearchResult[]> {
  let query = db.from("customer_stores").select("id,name,address,province,city,latitude,longitude,location_verified,status")
    .ilike("name", exactLike(source.ship_to)).eq("status", "ACTIVE");
  if (source.customer_name) {
    const customers = await db.from("customers").select("id").ilike("name", exactLike(source.customer_name)).limit(2);
    if (customers.error) throw customers.error;
    if (customers.data?.length !== 1) return [];
    query = query.eq("customer_id", customers.data[0].id);
  }
  const result = await query.limit(100);
  if (result.error) throw result.error;
  return (result.data ?? []).flatMap(row => {
    if (storeIdentityText(row.province) !== storeIdentityText(source.province) || storeIdentityText(row.city) !== storeIdentityText(source.city)
      || !row.address || row.latitude == null || row.longitude == null) return [];
    const latitude = Number(row.latitude), longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return [];
    return [{ display_name: row.address, latitude, longitude, name: row.name, provinces: [row.province], cities: [row.city], country_code: "ph", result_type: "store" }];
  });
}
export async function resolveTripDestination(source: Destination, typedQuery = ""): Promise<LocationLookup> {
  if (!source.province.trim()) return classifyLocations(source, [], "none");
  if (!source.city.trim()) return classifyLocations(source, [], "none");
  const key = JSON.stringify([source.customer_name ?? "", destinationLookupKey(source), typedQuery.trim().toLowerCase()]);
  const saved = lookupCache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  const active = lookups.get(key); if (active) return active;
  const revision = lookupRevision;
  const request = (async (): Promise<LocationLookup> => {
    try {
      const existing = typedQuery.trim() ? [] : await readSavedLocations(source);
      if (existing.length) return classifyLocations(source, existing, "store");
      const candidates = await searchLocations(deliveryLocationQuery(typedQuery || source.ship_to, source.city, source.province));
      return classifyLocations(source, rankDeliveryLocations(candidates, source.province, source.city), candidates[0]?.provider ?? "none");
    } catch (error) {
      const code = error instanceof LocationSearchError ? error.code : typeof error === "object" && error && "code" in error ? String(error.code) : "LOCATION_LOOKUP_FAILED";
      const status = ["GEOCODING_NOT_CONFIGURED", "GEOCODING_INVALID_KEY"].includes(code) ? "not_configured" : ["GEOCODING_RATE_LIMITED", "GEOCODING_BUDGET_EXCEEDED"].includes(code) ? "rate_limited" : code === "GEOCODING_NETWORK_ERROR" ? "network_error" : "lookup_failed";
      console.error("Delivery location lookup failed", { code, provider: process.env.GEOCODING_PROVIDER ?? "geoapify" });
      return { status, message: error instanceof LocationSearchError ? error.message : locationMessage(source, status), error_code: code, retryable: status !== "not_configured", candidates: [], source: "none" };
    }
  })();
  lookups.set(key, request);
  try {
    const result = await request;
    if (revision === lookupRevision && !["lookup_failed", "not_configured", "rate_limited", "network_error"].includes(result.status)) lookupCache.set(key, { result, expires: Date.now() + 600000 });
    if (lookupCache.size > 2000) lookupCache.delete(lookupCache.keys().next().value!);
    return result;
  } finally { if (lookups.get(key) === request) lookups.delete(key); }
}

type SourceRow = { source_identity: string; values: Record<string, string | null>; filename?: string; line?: number };
type Outcome = { source_identity: string; status: string; line_item_id?: string; original_batch_id?: string };
type Decision = Record<string, unknown>;
export async function prepareImportDestinationDecisions(rows: SourceRow[], provided: Record<string, Decision>): Promise<Record<string, Decision>> {
  const prepared: Record<string, Decision> = {};
  const resolveStore = importStoreResolver();
  const chosenIdentities = new Map<string, string>();
  for (const row of rows) {
    const source = parseDestination({ ship_to: row.values.ship_to, province: row.values.province, city: row.values.city, customer_name: row.values.customer_name });
    const choice = provided[row.source_identity] ?? {};
    const key = JSON.stringify([storeIdentityText(source.customer_name), destinationLookupKey(source)]);
    const chosen = JSON.stringify([choice.customer_id ?? "", choice.store_id ?? "", storeIdentityText(String(choice.province || source.province)), storeIdentityText(String(choice.city || source.city))]);
    if (chosenIdentities.has(key) && chosenIdentities.get(key) !== chosen) throw new ApiError("Products for the same Ship To / Province / City must use the same store identity. Review the destination choices.", 400);
    chosenIdentities.set(key, chosen);
    let decision: Decision;
    try { decision = await resolveStore(source, provided[row.source_identity] ?? {}); }
    catch (error) { throw new ApiError(`${row.filename ?? "Source file"}, CSV row ${row.line ?? "unknown"}, ${row.values.customer_model ?? "product"}: expected Qty ${row.values.quantity}, CBM ${row.values.cbm}. Customer/store resolution failed: ${error instanceof Error ? error.message : "Review this destination identity."}`, 400, "IMPORT_DESTINATION_REVIEW_REQUIRED"); }
    // Suggestions are informational until a user explicitly selects a candidate.
    if (decision.pin_address_mismatch === true && decision.verified === true) throw new ApiError("Review the address against the moved map pin before verifying this destination.", 400, "LOCATION_PIN_ADDRESS_MISMATCH");
    // Find address is an explicit action. Saving only resolves the store identity;
    // optional map searches must never delay or determine the result of a save.
    prepared[row.source_identity] = decision;
  }
  return prepared;
}

/** Follow-up writes never erase operational rows or previously reviewed points. */
export async function persistImportDestinationLocations(_actor: string, batch: string, rows: SourceRow[], outcomes: Outcome[], decisions: Record<string, Decision>) {
  const owned = outcomes.filter(row => decisions[row.source_identity]?.verified === true && row.line_item_id && (row.status === "imported" || row.status === "skipped" && row.original_batch_id === batch));
  if (!owned.length) return;
  const lines = await db.from("trip_line_items").select("id,trip_id,trip_stop_id").in("id", [...new Set(owned.map(row => row.line_item_id!))]);
  if (lines.error) throw lines.error;
  const stops = await db.from("trip_stops").select("id,store_id").in("id", [...new Set((lines.data ?? []).map(row => row.trip_stop_id).filter(Boolean))]);
  if (stops.error) throw stops.error;
  const rowsByIdentity = new Map(rows.map(row => [row.source_identity, row]));
  const linesById = new Map((lines.data ?? []).map(line => [line.id, line]));
  const stopsById = new Map((stops.data ?? []).map(stop => [stop.id, stop]));
  const seen = new Set<string>();
  for (const outcome of owned) {
    const row = rowsByIdentity.get(outcome.source_identity);
    const line = linesById.get(outcome.line_item_id!);
    const stop = line ? stopsById.get(line.trip_stop_id) : undefined;
    if (!row || !line || !stop?.store_id) continue;
    const decision = decisions[outcome.source_identity];
    const identity = JSON.stringify([stop.id,decision.address,decision.province,decision.city,decision.latitude,decision.longitude]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (decision.update_store_location !== undefined) await saveTripDeliveryAddress(stop.id, decision);
  }
}
