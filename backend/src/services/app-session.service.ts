import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { nextManilaMidnight, sessionHashesMatch, sha256SessionIdentifier } from "../utils/session-rules.js";

export class AppSessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = "AppSessionError";
  }
}

function storeUnavailable(error: { code?: string; message?: string }) {
  console.error("Application session store request failed:", {
    code: error.code,
    message: error.message,
  });
  return new AppSessionError("Session verification is temporarily unavailable.", "SESSION_STORE_UNAVAILABLE");
}

export async function registerAdminStaffSession(
  profileId: string,
  role: "ADMIN" | "STAFF",
  now = new Date(),
) {
  const sessionId = randomBytes(32).toString("base64url");
  const sessionIdHash = sha256SessionIdentifier(sessionId);
  const expiresAt = nextManilaMidnight(now).toISOString();
  const { error: insertError } = await supabaseAdmin
    .from("admin_staff_session_days")
    .insert({ session_hash: sessionIdHash, profile_id: profileId, role, expires_at: expiresAt });
  if (insertError) throw storeUnavailable(insertError);

  const { data, error } = await supabaseAdmin
    .from("admin_staff_session_days")
    .select("profile_id, role, expires_at")
    .eq("session_hash", sessionIdHash)
    .maybeSingle();
  if (error) throw storeUnavailable(error);
  if (!data || data.profile_id !== profileId || data.role !== role) {
    throw new AppSessionError("The authenticated session could not be verified.", "SESSION_INVALID", 401);
  }
  if (new Date(data.expires_at).getTime() <= now.getTime()) {
    throw new AppSessionError("Your session ended at midnight Manila time. Please sign in again.", "ADMIN_SESSION_EXPIRED", 401);
  }
  return { sessionId, expiresAt: data.expires_at as string };
}

export async function assertAdminStaffSession(
  profileId: string,
  role: "ADMIN" | "STAFF",
  sessionId: string | null,
  now = new Date(),
) {
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
    throw new AppSessionError("Please sign in again to continue.", "ADMIN_SESSION_UNREGISTERED", 401);
  }
  const sessionIdHash = sha256SessionIdentifier(sessionId);
  const { data, error } = await supabaseAdmin
    .from("admin_staff_session_days")
    .select("profile_id, role, expires_at")
    .eq("session_hash", sessionIdHash)
    .maybeSingle();
  if (error) throw storeUnavailable(error);
  if (!data || data.profile_id !== profileId || data.role !== role) {
    throw new AppSessionError("Please sign in again to continue.", "ADMIN_SESSION_UNREGISTERED", 401);
  }
  if (new Date(data.expires_at).getTime() <= now.getTime()) {
    throw new AppSessionError("Your session ended at midnight Manila time. Please sign in again.", "ADMIN_SESSION_EXPIRED", 401);
  }
  return { expiresAt: data.expires_at as string };
}

export async function createTruckerSession(profileId: string, db = supabaseAdmin) {
  const sessionId = randomBytes(32).toString("base64url");
  const sessionHash = sha256SessionIdentifier(sessionId);
  const { error } = await db
    .from("trucker_active_sessions")
    .upsert(
      { profile_id: profileId, session_hash: sessionHash, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" },
    );
  if (error) throw storeUnavailable(error);
  return sessionId;
}

export async function assertActiveTruckerSession(
  profileId: string,
  sessionId: string | null,
  db = supabaseAdmin,
) {
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
    throw new AppSessionError("This driver session is no longer active. Please sign in again.", "TRUCKER_SESSION_REPLACED", 401);
  }
  const expectedHash = sha256SessionIdentifier(sessionId);
  const { data, error } = await db
    .from("trucker_active_sessions")
    .select("session_hash")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw storeUnavailable(error);
  if (!data || !sessionHashesMatch(String(data.session_hash ?? ""), expectedHash)) {
    throw new AppSessionError("This account was signed in on another device. Please sign in again.", "TRUCKER_SESSION_REPLACED", 401);
  }
}

export async function removeCurrentTruckerSession(
  profileId: string,
  sessionId: string | null,
  db = supabaseAdmin,
) {
  if (!sessionId) return;
  const sessionHash = sha256SessionIdentifier(sessionId);
  const { error } = await db
    .from("trucker_active_sessions")
    .delete()
    .eq("profile_id", profileId)
    .eq("session_hash", sessionHash);
  if (error) throw storeUnavailable(error);
}

export async function removeCurrentAdminStaffSession(
  profileId: string,
  sessionId: string | null,
) {
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return;
  const sessionIdHash = sha256SessionIdentifier(sessionId);
  const { error } = await supabaseAdmin
    .from("admin_staff_session_days")
    .delete()
    .eq("profile_id", profileId)
    .eq("session_hash", sessionIdHash);
  if (error) throw storeUnavailable(error);
}
