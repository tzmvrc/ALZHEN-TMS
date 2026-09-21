import { Request, Response } from "express";
import {
  UserServiceError,
  createUserAccount,
} from "../services/user.service.js";

export async function createUser(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await createUserAccount({
      ...req.body,
      created_by: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("User creation controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
}
