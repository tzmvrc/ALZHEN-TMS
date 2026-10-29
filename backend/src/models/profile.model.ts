import { supabaseAdmin } from "../config/supabase.js";

export type ProfileRow = {
  id: string;
  role: string;
  crew_role?:"DRIVER"|"HELPER"|null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_path: string | null;
  created_by: string | null;
};

export async function getProfileByUserId(
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase profile query error:", {
      userId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data as ProfileRow | null;
}
