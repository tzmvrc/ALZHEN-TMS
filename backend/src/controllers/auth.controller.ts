import { Request, Response } from "express";
import {
  getCurrentUserProfile,
  loginAppUser,
  logoutAppSession,
} from "../services/auth.service.js";
import { AppSessionError } from "../services/app-session.service.js";
import {ApiError} from "../utils/api-response.js";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const result = await loginAppUser(email, password);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again later.";

    if (message === "Email and password are required.") {
      return res.status(400).json({ success: false, message });
    }

    if (message === "Please enter a valid email address.") {
      return res.status(400).json({ success: false, message });
    }

    if (message === "Invalid email or password.") {
      return res.status(401).json({ success: false, message });
    }
    if (message === "This account is not authorized to use the application.") {
      return res.status(401).json({ success: false, message: "Invalid account or login credentials." });
    }

    if (error instanceof AppSessionError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }

    if(error instanceof ApiError)return res.status(error.statusCode).json({success:false,code:error.code,message:error.message});

    console.error("Login controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
}

export async function me(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const profile = await getCurrentUserProfile(req.user.id);

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: {
        authUser: req.user,
        profile,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve user";

    const status = message === "User profile not found." ? 404 : 500;

    return res.status(status).json({
      success: false,
      message:
        status === 404
          ? "User profile not found."
          : "Something went wrong. Please try again later.",
    });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!req.appSession) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    const result = await logoutAppSession(req.appSession);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout failed";

    if (error instanceof AppSessionError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message,
    });
  }
}

export async function bootstrapSession(req: Request, res: Response) {
  try {
    const session = req.appSession;
    if (!session) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const profile = await getCurrentUserProfile(session.profileId);
    if (session.role === "TRUCKER") {
      return res.status(200).json({ success: true, data: { authUser: req.user, profile, role: session.role } });
    }
    if (session.role !== "ADMIN" && session.role !== "STAFF") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    return res.status(200).json({
      success: true,
      data: {
        authUser: req.user,
        profile,
        role: session.role,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof AppSessionError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error("Session bootstrap failed:", error);
    return res.status(503).json({ success: false, code: "SESSION_STORE_UNAVAILABLE", message: "Unable to verify this session. Please try again." });
  }
}

export function sessionHeartbeat(_req: Request, res: Response) {
  return res.status(200).json({ success: true, data: { active: true } });
}
