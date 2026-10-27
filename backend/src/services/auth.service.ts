import { supabaseAdmin, supabaseAuth } from "../config/supabase.js";

import { getProfileByUserId, type ProfileRow } from "../models/profile.model.js";
import { createTruckerSession, registerAdminStaffSession, removeCurrentAdminStaffSession, removeCurrentTruckerSession } from "./app-session.service.js";
import {ApiError} from "../utils/api-response.js";
import {browserMetadata,registerDeviceSession,revokeOwnDeviceSession} from './device-session.service.js';

function signInUnavailable(){return new ApiError("Sign-in is temporarily unavailable because the database or authentication service is not responding. Please try again shortly.",503,"AUTH_SERVICE_UNAVAILABLE");}

export async function loginUser(email: string, password: string) {
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    throw new Error("Email and password are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  let result;
  try { result = await supabaseAuth.auth.signInWithPassword({email:trimmedEmail,password:trimmedPassword}); }
  catch { throw signInUnavailable(); }
  const {data,error}=result;

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if(!error.status||error.status>=500||["AuthRetryableFetchError","AuthUnknownError"].includes(error.name)){
      console.error("Sign-in provider unavailable",{status:error.status,code:error.code});
      throw signInUnavailable();
    }

    if (
      error.code==="invalid_credentials" || /invalid login|invalid credentials|email or password/.test(message)
    ) {
      throw new Error("Invalid email or password.");
    }

    console.error("Supabase login error:", error);
    throw new Error("Something went wrong. Please try again later.");
  }

  if (!data.session || !data.user) {
    throw signInUnavailable();
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

export async function getCurrentUserProfile(userId: string, verifiedProfile?:ProfileRow) {
  const profile = verifiedProfile?.id===userId?verifiedProfile:await getProfileByUserId(userId);

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

export async function loginAppUser(email: string, password: string, metadata=browserMetadata('')) {
  const result = await loginUser(email, password);
  let profile;
  try { profile = await getCurrentUserProfile(result.user.id); }
  catch(error){
    if(error instanceof TypeError || (error&&typeof error==="object"&&"code" in error) || (error instanceof Error&&/timeout|aborted|fetch failed/i.test(error.message)))throw signInUnavailable();
    throw error;
  }
  if ((profile as any).deactivated_at) throw new Error("This account is not authorized to use the application.");
  if ((profile as any).locked_at) throw new ApiError('Your account has been locked by an administrator. Please contact your administrator for assistance.',403,'ACCOUNT_LOCKED');
  const role = String(profile.role).trim().toUpperCase();
  if (role === "TRUCKER") {
    const appSessionId = await createTruckerSession(result.user.id);
    await registerDeviceSession(result.user.id,appSessionId,result.session.access_token,metadata);
    return { authUser: result.user, profile, session: result.session, appSessionId, expiresAt: null };
  }
  if (role === "ADMIN" || role === "STAFF") {
    const registered = await registerAdminStaffSession(result.user.id, role);
    await registerDeviceSession(result.user.id,registered.sessionId,result.session.access_token,metadata);
    return { authUser: result.user, profile, session: result.session, appSessionId: registered.sessionId, expiresAt: registered.expiresAt };
  }
  throw new Error("This account is not authorized to use the application.");
}

export async function logoutAppSession(session: {
  profileId: string;
  role: string;
  sessionId: string | null;
}) {
  await revokeOwnDeviceSession(session.profileId,session.sessionId);
  if (session.role === "TRUCKER") {
    await removeCurrentTruckerSession(session.profileId, session.sessionId);
  } else if (session.role === "ADMIN" || session.role === "STAFF") {
    await removeCurrentAdminStaffSession(session.profileId, session.sessionId);
  }
  return { success: true, message: "Logout successful", data: {} };
}
