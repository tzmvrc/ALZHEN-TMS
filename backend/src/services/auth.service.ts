import { supabaseAuth } from "../config/supabase.js";

import { getProfileByUserId } from "../models/profile.model.js";

export async function loginUser(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session || !data.user) {
    throw new Error("Authentication failed");
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
    throw new Error("User profile not found");
  }

  return profile;
}
