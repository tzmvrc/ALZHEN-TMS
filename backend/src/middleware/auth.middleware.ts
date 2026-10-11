import { Request, Response, NextFunction } from "express";
import { supabaseAdmin, supabaseAuth } from "../config/supabase.js";
import {
  AppSessionError,
  assertActiveTruckerSession,
  assertAdminStaffSession,
} from "../services/app-session.service.js";

async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  skipSessionValidation = false,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication token is missing" });
    }

    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      console.error("Supabase getUser error:", {
        code: error?.code,
        message: error?.message,
        status: error?.status,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_admin, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Profile lookup error:", {
        userId: user.id,
        code: profileError.code,
        message: profileError.message,
      });
      return res.status(500).json({
        success: false,
        message: "User profile could not be loaded",
      });
    }

    const role = String(profile?.role ?? "UNKNOWN").trim().toUpperCase();
    const sessionId = req.header("x-app-session") ?? null;
    req.user = { ...user, role };
    req.appSession = { profileId: user.id, role, sessionId };

    if (!skipSessionValidation) {
      try {
        if (role === "TRUCKER") {
          await assertActiveTruckerSession(user.id, sessionId);
        } else if (role === "ADMIN" || role === "STAFF") {
          const active = await assertAdminStaffSession(user.id, role, sessionId);
          req.appSession.expiresAt = active.expiresAt;
        }
      } catch (sessionError) {
        if (sessionError instanceof AppSessionError) {
          return res.status(sessionError.status).json({
            success: false,
            code: sessionError.code,
            message: sessionError.message,
          });
        }
        throw sessionError;
      }
    }

    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication verification failed",
    });
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  return authenticate(req, res, next);
}

export function authMiddlewareSkipSessionValidation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return authenticate(req, res, next, true);
}
