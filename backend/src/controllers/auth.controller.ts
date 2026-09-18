import { Request, Response } from "express";
import {
  getCurrentUserProfile,
  loginUser,
  logoutUser,
} from "../services/auth.service.js";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const result = await loginUser(email, password);

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

    const result = await logoutUser();

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout failed";

    return res.status(500).json({
      success: false,
      message,
    });
  }
}
