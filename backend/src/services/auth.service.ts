import { supabaseAdmin, supabaseAuth } from "../config/supabase.js";

import { getProfileByUserId } from "../models/profile.model.js";
import { createTruckerSession, registerAdminStaffSession, removeCurrentAdminStaffSession, removeCurrentTruckerSession } from "./app-session.service.js";

export async function loginUser(email: string, password: string) {
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    throw new Error("Email and password are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: trimmedEmail,
    password: trimmedPassword,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";

    if (
      /invalid login|invalid credentials|email or password|auth/.test(message)
    ) {
      throw new Error("Invalid email or password.");
    }

    console.error("Supabase login error:", error);
    throw new Error("Something went wrong. Please try again later.");
  }

  if (!data.session || !data.user) {
    throw new Error("Something went wrong. Please try again later.");
  }

  return {
    user: data.user,
    session: data.session,
  };
}

export async function getCurrentUser(accessToken: string) {
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error("Invalid or expired authentication token");
  }

  return user;
}

export async function getCurrentUserProfile(userId: string) {
  const profile = await getProfileByUserId(userId);

  if (!profile) {
    throw new Error("User profile not found.");
  }

  const path = profile.profile_picture_path;
  let profilePictureUrl: string | null = null;
  if (path && /^https?:\/\//i.test(path)) profilePictureUrl = path;
  else if (path) {
    try {
      const { data } = await supabaseAdmin.storage.from("profile-pictures").createSignedUrl(path, 60 * 60);
      profilePictureUrl = data?.signedUrl ?? null;
    } catch { /* authentication must remain available if the private image is unavailable */ }
  }
  return { ...profile, profile_picture_url: profilePictureUrl };
}

export async function logoutUser() {
  return {
    success: true,
    message: "Logout successful",
    data: {},
  };
}

export async function loginAppUser(email: string, password: string) {
  const result = await loginUser(email, password);
  const profile = await getCurrentUserProfile(result.user.id);
  if ((profile as any).deactivated_at) throw new Error("This account is not authorized to use the application.");
  const role = String(profile.role).trim().toUpperCase();
  if (role === "TRUCKER") {
    const appSessionId = await createTruckerSession(result.user.id);
    return { authUser: result.user, profile, session: result.session, appSessionId, expiresAt: null };
  }
  if (role === "ADMIN" || role === "STAFF") {
    const registered = await registerAdminStaffSession(result.user.id, role);
    return { authUser: result.user, profile, session: result.session, appSessionId: registered.sessionId, expiresAt: registered.expiresAt };
  }
  throw new Error("This account is not authorized to use the application.");
}

export async function logoutAppSession(session: {
  profileId: string;
  role: string;
  sessionId: string | null;
}) {
  if (session.role === "TRUCKER") {
    await removeCurrentTruckerSession(session.profileId, session.sessionId);
  } else if (session.role === "ADMIN" || session.role === "STAFF") {
    await removeCurrentAdminStaffSession(session.profileId, session.sessionId);
  }
  return { success: true, message: "Logout successful", data: {} };
}
