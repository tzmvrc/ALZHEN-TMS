import { Request, Response, NextFunction } from "express";
import { getProfileByUserId } from "../models/profile.model.js";

export function isManilaMidnight(date = new Date()): boolean {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  const [hour, minute, second] = formatted.split(":").map(Number);

  return hour === 0 && minute === 0 && second >= 0;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const profile = await getProfileByUserId(req.user.id);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    if (isManilaMidnight()) {
      return res.status(401).json({
        success: false,
        message:
          "Admin session expired at local midnight in Asia/Manila. Please sign in again.",
      });
    }

    if (profile.role !== "ADMIN" || !profile.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required",
      });
    }

    req.profile = profile;

    next();
  } catch (error) {
    console.error("Role middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
}
