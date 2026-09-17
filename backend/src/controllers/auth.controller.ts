import { Request, Response } from "express";
import { getCurrentUserProfile, loginUser } from "../services/auth.service.js";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await loginUser(email, password);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";

    return res.status(401).json({
      success: false,
      message,
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

    const status = message === "User profile not found" ? 404 : 500;

    return res.status(status).json({
      success: false,
      message,
    });
  }
}
