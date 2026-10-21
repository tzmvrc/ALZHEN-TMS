import { supabaseAdmin } from "../config/supabase.js";
let checkedAt = 0, available = false;
export async function tripImportAvailable() {
  if (Date.now() - checkedAt < 5000) return available;
  const { error } = await supabaseAdmin.from("trip_line_items").select("unit_cbm").limit(0);
  if (error && !["42703", "PGRST204", "PGRST205"].includes(error.code)) throw new Error("Unable to check source column availability.");
  available = !error; checkedAt = Date.now();
  return available;
}
let allocationCheckedAt=0,allocationAvailable=false;
export async function tripAllocationReportAvailable(){
  if(Date.now()-allocationCheckedAt<5000)return allocationAvailable;
  const {error}=await supabaseAdmin.from("v_trip_booking").select("line_allocated_quantity,line_allocated_cbm,assignment_stop_progress").limit(0);
  if(error&&!["42703","PGRST204","PGRST205"].includes(error.code))throw new Error("Unable to check allocation report columns.");
  allocationAvailable=!error;allocationCheckedAt=Date.now();return allocationAvailable;
}
