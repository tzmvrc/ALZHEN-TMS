import { Request, Response, NextFunction } from "express";
import { supabaseAuth } from "../config/supabase.js";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;

    console.log("Authorization header present:", Boolean(authHeader));
    console.log(
      "Authorization header format valid:",
      !!authHeader && authHeader.toLowerCase().startsWith("bearer "),
    );

    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    console.log("Token length:", token.length);

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

    req.user = user;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed",
    });
  }
}
