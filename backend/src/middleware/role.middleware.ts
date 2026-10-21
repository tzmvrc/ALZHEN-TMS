import { Request, Response, NextFunction } from "express";
import { getProfileByUserId } from "../models/profile.model.js";

export function normalizeRole(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // authMiddleware already read this identity from the live database for this request.
      const profile = req.profile?.id===req.user.id ? req.profile : await getProfileByUserId(req.user.id);

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "User profile not found",
        });
      }

      const normalizedRole = normalizeRole(profile.role);
      const allowed = allowedRoles.map((role) => normalizeRole(role));

      if (!allowed.includes(normalizedRole)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Insufficient role permissions.",
        });
      }

      req.profile = profile;
      req.user = {
        ...req.user,
        role: normalizedRole,
      } as typeof req.user & { role: string };

      next();
    } catch (error) {
      console.error("Role middleware error:", error);

      return res.status(500).json({
        success: false,
        message: "Authorization check failed",
      });
    }
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireAdminOrStaff = requireRole("ADMIN", "STAFF");
