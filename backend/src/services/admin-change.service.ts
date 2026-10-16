import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";

export async function listAdminChangeSignals(actor: { role: string }) {
  if (!["ADMIN", "STAFF"].includes(actor.role.toUpperCase())) throw new ApiError("Only ADMIN or STAFF may receive change signals.", 403, "CHANGE_SIGNALS_ACCESS_DENIED");
  const { data, error } = await supabaseAdmin.from("admin_change_signals").select("topic,revision").order("topic").limit(100);
  if (error) throw new ApiError("Change signals are temporarily unavailable.", 503, "CHANGE_SIGNALS_UNAVAILABLE");
  return data ?? [];
}
