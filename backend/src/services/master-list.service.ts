import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { MASTER_RELATED_FIELDS } from "../config/master-list-columns.js";
import { schemaCapability } from "./schema-capability-cache.js";

export const masterListAvailable = schemaCapability(async () => {
  const { error } = await supabaseAdmin.from("v_trip_master_csv").select("trip_id").limit(0);
  if(error&&(error.code==="57014"||/timeout|AbortError|operation was aborted/i.test(error.message??"")))throw new ApiError("The report query took too long. Your records are unchanged. Retry loading in a moment.",503,"REPORT_READ_TIMEOUT");
  if (error && !["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)) throw new ApiError("Unable to load Master List layout.", 503);
  return !error;
}, 5 * 60_000);

export async function saveMasterListCell(actor: string, trip: string, input: Record<string, unknown>) {
  if (!isValidUuid(trip) || typeof input.field !== "string" || !MASTER_RELATED_FIELDS.includes(input.field)) throw new ApiError("Invalid Master List field.", 400);
  for (const field of ["stop_id", "line_item_id"]) if (input[field] != null && (typeof input[field] !== "string" || !isValidUuid(input[field] as string))) throw new ApiError("Invalid Master List row.", 400);
  if (input.value !== null && typeof input.value !== "string" && typeof input.value !== "number") throw new ApiError("Use text, a number, or an empty value.", 400);
  if (typeof input.value === "string" && input.value.length > 10000) throw new ApiError("Master List value is too long.", 400);
  const { data, error } = await supabaseAdmin.rpc("save_master_list_cell_v1", {
    p_actor: actor, p_trip: trip, p_stop: input.stop_id ?? null, p_line: input.line_item_id ?? null, p_field: input.field, p_value: input.value,
  });
  if (error) {
    if (["PGRST202", "42P01", "42703"].includes(error.code)) throw new ApiError("Saving this column requires the proposed Master List database update. No value was saved.", 503, "MASTER_LIST_SETUP_REQUIRED");
    throw new ApiError(error.message ?? "Unable to save Master List value.", error.code === "40001" ? 409 : 400);
  }
  return data;
}
