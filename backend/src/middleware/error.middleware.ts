import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-response.js";

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ApiError) {
    console.error("API error:", {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    });

    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: { code: error.code },
    });
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong";

  console.error("Unhandled API error:", error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again later.",
    error: { code: "INTERNAL_SERVER_ERROR" },
  });
}
