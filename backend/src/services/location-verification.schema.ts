import { supabaseAdmin } from "../config/supabase.js";
import {schemaCapability} from "./schema-capability-cache.js";
export const locationVerificationAvailable=schemaCapability(async()=>{
  const result = await supabaseAdmin.from("customer_stores").select("location_verified").limit(0);
  if (result.error && !["42703", "PGRST204", "PGRST205"].includes(result.error.code)) throw new Error("Unable to verify location schema availability.");
  return !result.error;
});
