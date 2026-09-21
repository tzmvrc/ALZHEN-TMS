import { supabaseAdmin } from "../config/supabase.js";
import type { ProfileRow } from "./profile.model.js";

export type CreateUserProfileInput = {
  id: string;
  first_name: string;
  last_name: string;
  role: "ADMIN" | "TRUCKER";
  is_admin: boolean;
  created_by: string;
  profile_picture_path?: string | null;
};

export async function createUserProfile(
  profileData: CreateUserProfileInput,
): Promise<ProfileRow> {
  const payload = {
    ...profileData,
    profile_picture_path: profileData.profile_picture_path ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    console.error("Supabase profile insert error:", {
      userId: profileData.id,
      createdBy: profileData.created_by,
      role: profileData.role,
      isAdmin: profileData.is_admin,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw error;
  }

  return data as ProfileRow;
}
