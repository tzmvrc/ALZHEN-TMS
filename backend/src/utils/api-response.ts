import { Response } from "express";

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function sendSuccess(
  res: Response,
  statusCode: number,
  message: string,
  data: unknown,
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: string = "INTERNAL_SERVER_ERROR",
) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: { code },
  });
}
