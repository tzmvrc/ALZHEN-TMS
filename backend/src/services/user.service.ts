import { supabaseAdmin } from "../config/supabase.js";
import { createUserProfile } from "../models/user.model.js";

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

function normalizeRole(value: unknown): "ADMIN" | "TRUCKER" {
  if (value === "ADMIN" || value === "TRUCKER") {
    return value;
  }

  throw new UserServiceError("Role must be ADMIN or TRUCKER.", 400);
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

  if (role === "TRUCKER" && input.is_admin === true) {
    throw new UserServiceError(
      "TRUCKER users cannot have admin privileges.",
      400,
    );
  }

  const normalizedIsAdmin = role === "ADMIN" ? input.is_admin : false;

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
    };
  } catch (error) {
    const deletion = await supabaseAdmin.auth.admin.deleteUser(newUserId);

    if (deletion.error) {
      console.error("Supabase auth user rollback failed:", {
        userId: newUserId,
        code: deletion.error.code,
        message: deletion.error.message,
        status: deletion.error.status,
      });
    }

    if (error instanceof UserServiceError) {
      throw error;
    }

    console.error("Profile creation failed after auth user creation:", {
      userId: newUserId,
      role,
      isAdmin: normalizedIsAdmin,
      email,
    });

    throw new UserServiceError(
      "Unable to create the user profile at this time.",
      500,
    );
  }
}
