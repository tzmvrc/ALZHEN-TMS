import { supabaseAdmin } from "../config/supabase.js";
import { schemaCapability } from "./schema-capability-cache.js";
export const tripImportAvailable = schemaCapability(async () => {
  const { error } = await supabaseAdmin.from("trip_line_items").select("unit_cbm").limit(0);
  if (error && !["42703", "PGRST204", "PGRST205"].includes(error.code)) throw new Error("Unable to check source column availability.");
  return !error;
});
export const tripAllocationReportAvailable = schemaCapability(async () => {
  const {error}=await supabaseAdmin.from("v_trip_booking").select("line_allocated_quantity,line_allocated_cbm,assignment_stop_progress").limit(0);
  if(error&&!["42703","PGRST204","PGRST205"].includes(error.code))throw new Error("Unable to check allocation report columns.");
  return !error;
});
