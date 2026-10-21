import { supabaseAdmin as db } from "../config/supabase.js";
import { buildTripLineItemPayload } from "./trip.service.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";

export function validateProductRows(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new ApiError("Save 1–100 product rows at a time.", 400);
  const ids = new Set<string>();
  return input.map(row => {
    if (!row || typeof row !== "object" || !isValidUuid(row.id) || ids.has(row.id) || !row.values || typeof row.values !== "object" || Array.isArray(row.values)) throw new ApiError("Each new product row needs its own unique identity and field values.", 400);
    ids.add(row.id);
    let payload: Record<string, unknown>;
    try { payload = buildTripLineItemPayload(row.values); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid product values.", 400); }
    if (Object.keys(row.values).some(key => !(key in payload) && row.values[key] != null && row.values[key] !== "")) throw new ApiError("Unsupported product row field.", 400);
    if (!Object.entries(payload).some(([key, value]) => value !== null && value !== "" && !["stock_quantity", "item_status"].includes(key))) throw new ApiError("Enter a product, source reference, quantity or CBM before saving a new row. Blank placeholders are not saved.", 400);
    return { id: row.id as string, ...payload };
  });
}
export async function createProductRows(trip: string, stop: string, input: unknown) {
  if (!isValidUuid(trip) || !isValidUuid(stop)) throw new ApiError("Choose an existing trip and delivery stop.", 400);
  const rows = validateProductRows(input);
  const parent = await db.from("trip_stops").select("id, trip_id").eq("id", stop).eq("trip_id", trip).maybeSingle();
  if (parent.error) throw new ApiError("Unable to verify the delivery stop.", 503);
  if (!parent.data) throw new ApiError("The selected delivery stop does not belong to this trip.", 404);
  const ids = rows.map(row => row.id);
  const existing = await db.from("trip_line_items").select("id, trip_id, trip_stop_id").in("id", ids);
  if (existing.error) throw new ApiError("Unable to verify new row identities.", 503);
  if (existing.data?.some(row => row.trip_id !== trip || row.trip_stop_id !== stop)) throw new ApiError("A row identity belongs to another trip or stop.", 409);
  const result = await db.from("trip_line_items").upsert(rows.map(row => ({ ...row, trip_id: trip, trip_stop_id: stop })), { onConflict: "id", ignoreDuplicates: true });
  if (result.error) {
    if (["42703", "PGRST204"].includes(result.error.code)) throw new ApiError("This source field needs the reviewed trip-source migration. Use existing product fields or apply the approved migration first.", 503);
    throw new ApiError("New rows were not confirmed. Retry the same drafts; saved row identities prevent duplicates.", 503);
  }
  const confirmed = await db.from("trip_line_items").select("*").in("id", ids).eq("trip_id", trip).eq("trip_stop_id", stop);
  if (confirmed.error || confirmed.data?.length !== rows.length) throw new ApiError("Save acknowledgement is incomplete. Retry these same rows before leaving.", 503);
  const byId = new Map(confirmed.data.map(row => [row.id, row]));
  return ids.map(id => byId.get(id)!);
}
