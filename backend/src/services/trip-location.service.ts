import { createHash } from "node:crypto";
import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { searchLocations, type LocationSearchResult } from "./location-search.service.js";
import { classifyLocations, destinationLookupKey, storeIdentityText, locationMessage, type Destination, type LocationLookup } from "./trip-location.logic.js";
import { importStoreResolver } from "./trip-store-identity.service.js";

const exactLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const lookupCache = new Map<string, { expires: number; result: LocationLookup }>();
const lookups = new Map<string, Promise<LocationLookup>>();
function uuidFor(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
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
    if (customers.data?.length === 1) query = query.eq("customer_id", customers.data[0].id);
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
export async function resolveTripDestination(source: Destination): Promise<LocationLookup> {
  if (!source.province.trim()) return classifyLocations(source, [], "none");
  if (!source.city.trim()) return classifyLocations(source, [], "none");
  const key = JSON.stringify([source.customer_name ?? "", destinationLookupKey(source)]);
  const saved = lookupCache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  const active = lookups.get(key); if (active) return active;
  const request = (async (): Promise<LocationLookup> => {
    try {
      const existing = await readSavedLocations(source);
      if (existing.length) return classifyLocations(source, existing, "store");
      const candidates = await searchLocations([source.ship_to, source.province, source.city, "Philippines"].join(", "));
      return classifyLocations(source, candidates, candidates[0]?.provider ?? "none");
    } catch {
      return { status: "lookup_failed", message: locationMessage(source, "lookup_failed"), candidates: [], source: "none" };
    }
  })();
  lookups.set(key, request);
  try {
    const result = await request;
    lookupCache.set(key, { result, expires: Date.now() + (result.status === "lookup_failed" ? 60000 : 600000) });
    if (lookupCache.size > 2000) lookupCache.delete(lookupCache.keys().next().value!);
    return result;
  } finally { lookups.delete(key); }
}

type SourceRow = { source_identity: string; values: Record<string, string | null> };
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
    const lookup = await resolveTripDestination(source);
    const decision = await resolveStore(source, provided[row.source_identity] ?? {});
    if (lookup.status === "found" && decision.verified !== true && !String(decision.latitude ?? "").trim() && !String(decision.longitude ?? "").trim()) {
      const candidate = lookup.candidates[0];
      Object.assign(decision, { address: candidate.display_name, province: source.province, city: source.city, latitude: String(candidate.latitude), longitude: String(candidate.longitude), verified: false });
    }
    decision.lookup = lookup;
    prepared[row.source_identity] = decision;
  }
  return prepared;
}

/** Follow-up writes never erase operational rows or previously reviewed points. */
export async function persistImportDestinationLocations(actor: string, batch: string, rows: SourceRow[], outcomes: Outcome[], decisions: Record<string, Decision>) {
  const owned = outcomes.filter(row => row.line_item_id && (row.status === "imported" || row.status === "skipped" && row.original_batch_id === batch));
  if (!owned.length) return;
  const lines = await db.from("trip_line_items").select("id,trip_id,trip_stop_id").in("id", owned.map(row => row.line_item_id!));
  if (lines.error) throw lines.error;
  const stops = await db.from("trip_stops").select("id,store_id").in("id", [...new Set((lines.data ?? []).map(row => row.trip_stop_id).filter(Boolean))]);
  if (stops.error) throw stops.error;
  const admins = await db.from("profiles").select("id").eq("role", "ADMIN");
  if (admins.error) throw admins.error;
  const seen = new Set<string>();
  for (const outcome of owned) {
    const row = rows.find(source => source.source_identity === outcome.source_identity);
    const line = lines.data?.find(item => item.id === outcome.line_item_id);
    const stop = stops.data?.find(item => item.id === line?.trip_stop_id);
    if (!row || !line || !stop?.store_id) continue;
    const source = parseDestination({ ship_to: row.values.ship_to, province: row.values.province, city: row.values.city, customer_name: row.values.customer_name });
    const decision = decisions[outcome.source_identity];
    if (!decision?.lookup) throw new Error("The imported destination is missing its location review.");
    const lookup = decision.lookup as LocationLookup;
    const identity = `${line.trip_id}:${stop.store_id}:${destinationLookupKey(source)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const latitude = decision.latitude == null || String(decision.latitude).trim() === "" ? NaN : Number(decision.latitude);
    const longitude = decision.longitude == null || String(decision.longitude).trim() === "" ? NaN : Number(decision.longitude);
    if (decision.verified !== true && decision.address && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
      // Fill only an empty, unverified point. A concurrent verified location wins.
      const saved = await db.from("customer_stores").update({ address: String(decision.address), latitude, longitude, location_verified: false })
        .eq("id", stop.store_id).eq("location_verified", false).is("latitude", null).is("longitude", null);
      if (saved.error) throw saved.error;
    }
    const event = uuidFor(`${batch}:${identity}:${lookup.status}:${lookup.message}`);
    const notifications = (admins.data ?? []).map(admin => ({ recipient_profile_id: admin.id, actor_profile_id: actor,
      notification_type: "report_mention", reference_type: "trip", reference_id: line.trip_id, trip_id: line.trip_id,
      event_key: event, message: lookup.message, metadata: { event_kind: "trip_location_review", report_key: "trip-booking", store_id: stop.store_id, ship_to: source.ship_to, province: source.province, city: source.city, location_status: lookup.status } }));
    if (notifications.length) {
      const notified = await db.from("admin_notifications").upsert(notifications, { onConflict: "recipient_profile_id,event_key", ignoreDuplicates: true });
      if (notified.error) throw notified.error;
    }
  }
}
