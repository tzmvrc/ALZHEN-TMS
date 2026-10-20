import { supabaseAdmin } from "../config/supabase.js";
import { createTripReferenceCapability } from "./trip-reference.logic.js";

export const tripReferenceAvailable = createTripReferenceCapability(() =>
  supabaseAdmin.from("trips").select("trip_reference").limit(0),
);
