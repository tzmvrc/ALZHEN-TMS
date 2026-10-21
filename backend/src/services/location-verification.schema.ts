import { supabaseAdmin } from "../config/supabase.js";
let checkedAt = 0, available = false;
export async function locationVerificationAvailable() {
  if (Date.now() - checkedAt < 5000) return available;
  const result = await supabaseAdmin.from("customer_stores").select("location_verified").limit(0);
  if (result.error && !["42703", "PGRST204", "PGRST205"].includes(result.error.code)) throw new Error("Unable to verify location schema availability.");
  available = !result.error; checkedAt = Date.now(); return available;
}
