import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { schemaCapability } from "./schema-capability-cache.js";
import { deliveryAddress } from "./trip-delivery-address.logic.js";

const available = schemaCapability(async () => {
  const { error } = await db.from("trip_stops").select("delivery_location").limit(0);
  if (error && !["42703", "PGRST204"].includes(error.code)) throw new ApiError("Delivery address storage is unavailable. Your draft is safe.", 503, "TRIP_DELIVERY_LOCATION_UNAVAILABLE");
  return !error;
});
export async function requireTripDeliveryAddresses() {
  if (!await available()) throw new ApiError("Trip-only address saving needs an administrator update. Your draft is safe; no new trip rows were saved.", 503, "TRIP_DELIVERY_LOCATION_SETUP_REQUIRED");
}
export async function saveTripDeliveryAddress(stopId: string, input: unknown) {
  const point = deliveryAddress(input);
  if (!point) return;
  const result = await db.from("trip_stops").update({ delivery_location: point }).eq("id", stopId);
  if (result.error) throw new ApiError("The trip was saved, but its delivery address needs another save. Retry the same draft.", 503, "TRIP_LOCATION_FOLLOWUP_REQUIRED");
}
