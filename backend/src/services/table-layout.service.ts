import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";

type Actor = { profileId: string; role: string };
const fields = "table_key,column_key,width_px,revision,updated_at,updated_by";
export function validateLayoutRequest(actor: Actor, table: string, column?: string, input?: Record<string, unknown>) {
  if (!["ADMIN", "STAFF"].includes(actor.role)) throw new ApiError("Only ADMIN or STAFF may change shared layouts.", 403);
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(table) || (column !== undefined && !/^[a-zA-Z0-9:_. -]{1,160}$/.test(column))) throw new ApiError("Invalid table or column identifier.", 400);
  if (input && (Object.keys(input).some((key) => !["width_px", "expected_revision"].includes(key)) || !Number.isInteger(input.width_px) || Number(input.width_px) < 60 || Number(input.width_px) > 1600 || !Number.isInteger(input.expected_revision) || Number(input.expected_revision) < 0 || Number(input.expected_revision) >= 2147483647)) throw new ApiError("Enter a width from 60 to 1600 pixels and a valid revision.", 400);
}
export async function getSharedWidths(actor: Actor, table: string) {
  validateLayoutRequest(actor, table);
  const { data, error } = await supabaseAdmin.from("shared_table_column_widths").select(fields).eq("table_key", table).order("column_key").limit(500);
  if (error) throw new ApiError("Shared column widths could not be loaded.", 503, "LAYOUT_READ_FAILED");
  return data ?? [];
}
export async function saveSharedWidth(actor: Actor, table: string, column: string, input: Record<string, unknown>) {
  validateLayoutRequest(actor, table, column, input);
  const revision = Number(input.expected_revision);
  const values = { width_px: input.width_px, revision: revision + 1, updated_at: new Date().toISOString(), updated_by: actor.profileId };
  const result = revision === 0
    ? await supabaseAdmin.from("shared_table_column_widths").insert({ table_key: table, column_key: column, ...values }).select(fields).maybeSingle()
    : await supabaseAdmin.from("shared_table_column_widths").update(values).eq("table_key", table).eq("column_key", column).eq("revision", revision).select(fields).maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data)) throw new ApiError("Another user changed this column. Reload its width and retry.", 409, "LAYOUT_CONFLICT");
  if (result.error) throw new ApiError("The column width was not saved. Retry the layout change.", 503, "LAYOUT_SAVE_FAILED");
  return result.data;
}
