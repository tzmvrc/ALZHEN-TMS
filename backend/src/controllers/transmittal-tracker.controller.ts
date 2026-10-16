import type { Request, Response } from "express";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import * as service from "../services/transmittal-tracker.service.js";
import { withReportReadBudget } from "../services/report-read-budget.js";

function actor(req: Request) {
  if (!req.profile || !req.user) throw new ApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return { id: req.profile.id, role: String(req.profile.role).toUpperCase() };
}

function requestId(req: Request) {
  const value = req.header("x-request-id");
  return value && value.length <= 100 ? value : undefined;
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function body(req: Request) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new ApiError("Request body must be a JSON object.", 400, "INVALID_BODY");
  return req.body as Record<string, unknown>;
}

async function respond(res: Response, operation: () => Promise<unknown>, message: string, status = 200) {
  try {
    return sendSuccess(res, status, message, await operation());
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error.statusCode, error.message, error.code);
    console.error("Transmittal Tracker request failed:", error);
    return sendError(res, 500, "Unable to complete the Transmittal Tracker request.", "TRANSMITTAL_TRACKER_FAILED");
  }
}

export const getTracker = (req: Request, res: Response) => respond(
  res,
  () => req.query.preload === "true" ? withReportReadBudget(() => service.getTracker(actor(req), req.query.search, requestId(req))) : service.getTracker(actor(req), req.query.search, requestId(req)),
  "Transmittal Tracker retrieved successfully",
);

export const initializeTracker = (req: Request, res: Response) => respond(
  res,
  () => service.initializeTracker(actor(req), requestId(req)),
  "Transmittal Tracker initialized successfully",
);

export const updateTrackerCell = (req: Request, res: Response) => respond(
  res,
  () => service.updateTrackerCell(actor(req), param(req, "stopId"), param(req, "field"), body(req), requestId(req)),
  "Transmittal Tracker value saved successfully",
);

export const getTrackerPage = (req: Request,res: Response)=>respond(res,()=>service.getTracker(actor(req),undefined,requestId(req),req.query),"Transmittal Tracker page retrieved successfully");
