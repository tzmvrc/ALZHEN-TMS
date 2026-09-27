import { Request, Response, NextFunction } from "express";
import { supabaseAdmin, supabaseAuth } from "../config/supabase.js";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
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

    req.user = {
      ...user,
      role: profile?.role ?? "UNKNOWN",
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed",
    });
  }
}
