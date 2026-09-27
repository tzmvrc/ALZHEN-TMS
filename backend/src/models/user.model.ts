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

export type DriverRow = {
  id: string;
  first_name: string;
  last_name: string;
  profile_id: string;
  contact_number: string | null;
  license_number: string | null;
  trucking_company_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export type CreateDriverInput = {
  first_name: string;
  last_name: string;
  profile_id: string;
  trucking_company_id?: string | null;
  contact_number?: string | null;
  license_number?: string | null;
  status?: string;
  notes?: string | null;
};

export async function createDriverForProfile(
  driverData: CreateDriverInput,
): Promise<DriverRow> {
  const payload = {
    first_name: driverData.first_name,
    last_name: driverData.last_name,
    profile_id: driverData.profile_id,
    trucking_company_id: driverData.trucking_company_id ?? null,
    contact_number: driverData.contact_number ?? null,
    license_number: driverData.license_number ?? null,
    status: driverData.status ?? "ACTIVE",
    notes: driverData.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("drivers")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    console.error("Supabase driver insert error:", {
      profileId: driverData.profile_id,
      firstName: driverData.first_name,
      lastName: driverData.last_name,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw error;
  }

  return data as DriverRow;
}
