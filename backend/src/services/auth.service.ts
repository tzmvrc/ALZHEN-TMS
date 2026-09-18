import { supabaseAuth } from "../config/supabase.js";

import { getProfileByUserId } from "../models/profile.model.js";

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

  return profile;
}

export async function logoutUser() {
  return {
    success: true,
    message: "Logout successful",
    data: {},
  };
}
