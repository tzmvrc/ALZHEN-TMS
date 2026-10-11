import { supabaseAdmin } from "../config/supabase.js";
import { randomUUID } from "node:crypto";
import { imageMime } from "../models/clientwebsite.validation.js";
import {
  createDriverForProfile,
  createUserProfile,
} from "../models/user.model.js";

export class UserServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UserServiceError";
    this.statusCode = statusCode;
  }
}

export type CreateUserAccountInput = {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  is_admin?: unknown;
  contact_number?: unknown;
  license_number?: unknown;
  trucking_company_id?: unknown;
  driver_status?: unknown;
  driver_notes?: unknown;
  created_by: string;
};

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new UserServiceError(`${fieldName} is required.`, 400);
  }

  return value.trim();
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new UserServiceError("Please enter a valid email address.", 400);
  }

  return trimmed.toLowerCase();
}

function normalizeRole(value: unknown): "ADMIN" | "STAFF" | "TRUCKER" {
  if (value === "ADMIN" || value === "STAFF" || value === "TRUCKER") {
    return value;
  }

  throw new UserServiceError("Role must be ADMIN, STAFF, or TRUCKER.", 400);
}

async function rollbackCreatedUser(userId: string, profileId?: string) {
  if (profileId) {
    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", profileId);

    if (profileDeleteError) {
      console.error("Supabase profile rollback failed:", {
        userId,
        profileId,
        code: profileDeleteError.code,
        message: profileDeleteError.message,
      });
    }
  }

  const { error: authDeleteError } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    console.error("Supabase auth user rollback failed:", {
      userId,
      code: authDeleteError.code,
      message: authDeleteError.message,
      status: authDeleteError.status,
    });
  }
}

export async function createUserAccount(input: CreateUserAccountInput) {
  const firstName = normalizeRequiredString(input.first_name, "First name");
  const lastName = normalizeRequiredString(input.last_name, "Last name");
  const email = normalizeEmail(normalizeRequiredString(input.email, "Email"));
  const password = normalizeRequiredString(input.password, "Password");

  if (password.length < 8) {
    throw new UserServiceError(
      "Password must be at least 8 characters long.",
      400,
    );
  }

  const role = normalizeRole(input.role);

  if (typeof input.is_admin !== "boolean") {
    throw new UserServiceError("is_admin must be a boolean value.", 400);
  }

  if (role !== "ADMIN" && input.is_admin === true) {
    throw new UserServiceError(
      "Only ADMIN users can have admin privileges.",
      400,
    );
  }

  const normalizedIsAdmin = role === "ADMIN" ? input.is_admin : false;

  const driverFields = role === "TRUCKER" ? await normalizeDriverFields(input) : null;

  const { data: authUserData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role,
        is_admin: normalizedIsAdmin,
      },
    });

  if (authError) {
    const message = (authError.message ?? "").toLowerCase();

    if (
      /already registered|already exists|email.*exists|duplicate.*email/.test(
        message,
      )
    ) {
      throw new UserServiceError("A user with this email already exists.", 409);
    }

    console.error("Supabase user creation failed:", {
      email,
      role,
      isAdmin: normalizedIsAdmin,
      code: authError.code,
      message: authError.message,
      status: authError.status,
    });

    throw new UserServiceError(
      "Something went wrong. Please try again later.",
      500,
    );
  }

  const newUserId = authUserData?.user?.id;

  if (!newUserId) {
    throw new UserServiceError(
      "Unable to create the user account at this time.",
      500,
    );
  }

  try {
    const profile = await createUserProfile({
      id: newUserId,
      first_name: firstName,
      last_name: lastName,
      role,
      is_admin: normalizedIsAdmin,
      created_by: input.created_by,
      profile_picture_path: null,
    });

    let driver = null;

    if (role === "TRUCKER") {
      try {
        driver = await createDriverForProfile({
          first_name: firstName,
          last_name: lastName,
          profile_id: profile.id,
          ...(driverFields ?? {}),
        });
      } catch (error) {
        console.error(
          "TRUCKER driver creation failed after profile creation:",
          {
            userId: newUserId,
            profileId: profile.id,
            email,
            role,
            error,
          },
        );

        await rollbackCreatedUser(newUserId, profile.id);

        if (error instanceof UserServiceError) {
          throw error;
        }

        throw new UserServiceError(
          "Unable to create the trucker driver record at this time.",
          500,
        );
      }
    }

    return {
      user: {
        id: newUserId,
        email,
      },
      profile: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        is_admin: profile.is_admin,
        profile_picture_path: profile.profile_picture_path,
        created_by: profile.created_by,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      driver,
    };
  } catch (error) {
    if (error instanceof UserServiceError) {
      throw error;
    }

    console.error("User creation failed after auth user creation:", {
      userId: newUserId,
      role,
      isAdmin: normalizedIsAdmin,
      email,
      error,
    });

    await rollbackCreatedUser(newUserId);

    throw new UserServiceError(
      "Unable to create the user profile at this time.",
      500,
    );
  }
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 2000) throw new UserServiceError(`${label} is invalid.`, 400);
  return value.trim() || null;
}

async function normalizeDriverFields(input: { contact_number?: unknown; license_number?: unknown; trucking_company_id?: unknown; driver_status?: unknown; driver_notes?: unknown }) {
  const companyId = input.trucking_company_id;
  if (companyId && (typeof companyId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId))) {
    throw new UserServiceError("Select a valid trucking company.", 400);
  }
  if (companyId) {
    const { data } = await supabaseAdmin.from("trucking_companies").select("id").eq("id", companyId).maybeSingle();
    if (!data) throw new UserServiceError("The selected trucking company does not exist.", 400);
  }
  const status = input.driver_status === undefined || input.driver_status === "" ? "ACTIVE" : input.driver_status;
  if (status !== "ACTIVE" && status !== "INACTIVE") throw new UserServiceError("Driver status must be ACTIVE or INACTIVE.", 400);
  return {
    trucking_company_id: companyId ? String(companyId) : null,
    contact_number: optionalText(input.contact_number, "Contact number"),
    license_number: optionalText(input.license_number, "License number"),
    status,
    notes: optionalText(input.driver_notes, "Driver notes"),
  };
}

export type ManagedUser = {
  id: string; first_name: string | null; last_name: string | null; role: "ADMIN" | "STAFF" | "TRUCKER"; is_admin: boolean;
  profile_picture_path: string | null; email: string | null; driver: Record<string, unknown> | null;
};

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const { data: profileRows, error } = await supabaseAdmin.from("profiles")
    .select("id,first_name,last_name,role,is_admin,profile_picture_path")
    .in("role", ["ADMIN", "STAFF", "TRUCKER"]).order("created_at", { ascending: false });
  if (error) throw new UserServiceError("Unable to load user profiles.", 502);
  const profiles = profileRows ?? [];
  const ids = profiles.map((profile) => profile.id);
  const [{ data: driverRows, error: driverError }, authResult] = await Promise.all([
    ids.length ? supabaseAdmin.from("drivers").select("id,profile_id,contact_number,license_number,trucking_company_id,status,notes").in("profile_id", ids) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (driverError || authResult.error) throw new UserServiceError("Unable to load managed user details.", 502);
  const driverByProfile = new Map((driverRows ?? []).map((driver) => [driver.profile_id, driver]));
  const emailById = new Map((authResult.data.users ?? []).map((user) => [user.id, user.email ?? null]));
  return Promise.all(profiles.map(async (profile) => {
    const path = profile.profile_picture_path;
    let profilePictureUrl = typeof path === "string" && /^https?:\/\//i.test(path) ? path : null;
    if (path && !profilePictureUrl) {
      try {
        const { data } = await supabaseAdmin.storage.from("profile-pictures").createSignedUrl(path, 60 * 60);
        profilePictureUrl = data?.signedUrl ?? null;
      } catch { /* the user row remains available if its private image is unavailable */ }
    }
    return {
      ...profile,
      role: profile.role as ManagedUser["role"],
      is_admin: Boolean(profile.is_admin),
      profile_picture_path: path,
      profile_picture_url: profilePictureUrl,
      email: emailById.get(profile.id) ?? null,
      driver: driverByProfile.get(profile.id) ?? null,
    };
  }));
}

export async function updateManagedUser(id: string, input: Record<string, unknown>) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new UserServiceError("Invalid user id.", 400);
  const firstName = normalizeRequiredString(input.first_name, "First name");
  const lastName = normalizeRequiredString(input.last_name, "Last name");
  const email = normalizeEmail(normalizeRequiredString(input.email, "Email"));
  const { data: profile, error: profileReadError } = await supabaseAdmin.from("profiles").select("id,role,is_admin").eq("id", id).maybeSingle();
  if (profileReadError || !profile || !["ADMIN", "STAFF", "TRUCKER"].includes(String(profile.role))) throw new UserServiceError("User profile not found.", 404);
  const role = profile.role as "ADMIN" | "STAFF" | "TRUCKER";
  let driverFields: Awaited<ReturnType<typeof normalizeDriverFields>> | null = null;
  if (role === "TRUCKER") driverFields = await normalizeDriverFields(input);
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, { email, email_confirm: true, user_metadata: { first_name: firstName, last_name: lastName } });
  if (authError) throw new UserServiceError(/already|exists|duplicate/i.test(authError.message) ? "A user with this email already exists." : "Unable to update the Auth user.", /already|exists|duplicate/i.test(authError.message) ? 409 : 502);
  const { error: profileError } = await supabaseAdmin.from("profiles").update({ first_name: firstName, last_name: lastName, updated_at: new Date().toISOString() }).eq("id", id);
  if (profileError) throw new UserServiceError("Auth email was updated but the profile could not be updated. Refresh and retry.", 502);
  if (driverFields) {
    const { data: driver, error: driverError } = await supabaseAdmin.from("drivers").update({ ...driverFields, first_name: firstName, last_name: lastName, updated_at: new Date().toISOString() }).eq("profile_id", id).select("id").maybeSingle();
    if (driverError || !driver) throw new UserServiceError("Profile was updated but its driver record could not be found or updated.", 502);
  }
  return { id, first_name: firstName, last_name: lastName, email, role };
}

export async function uploadProfilePicture(id: string, body: Buffer, mime: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new UserServiceError("Invalid user id.", 400);
  if (!body.length || body.length > 5 * 1024 * 1024) throw new UserServiceError("Choose an image up to 5 MB.", 400);
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mime)) throw new UserServiceError("Use a JPEG, PNG, or WebP image.", 400);
  if (imageMime(body) !== mime) throw new UserServiceError("The selected file does not match its image type.", 400);
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const path = `${id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage.from("profile-pictures").upload(path, body, { contentType: mime, upsert: false });
  if (uploadError) throw new UserServiceError("Profile picture upload failed. Check the existing private profile-pictures bucket.", 502);
  const { error: updateError } = await supabaseAdmin.from("profiles").update({ profile_picture_path: path, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) {
    await supabaseAdmin.storage.from("profile-pictures").remove([path]);
    throw new UserServiceError("Picture uploaded but could not be attached to the profile.", 502);
  }
  const { data } = await supabaseAdmin.storage.from("profile-pictures").createSignedUrl(path, 60 * 60);
  return { path, signed_url: data?.signedUrl ?? null };
}
