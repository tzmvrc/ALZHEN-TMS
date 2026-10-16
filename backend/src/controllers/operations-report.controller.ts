import type { Request, Response } from "express";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import * as service from "../services/operations-report.service.js";
import { withReportReadBudget } from "../services/report-read-budget.js";
import { listPendingOffloadCleanup, retryOffloadCleanup } from "../services/offload-deletion.service.js";

function actor(req: Request) {
  const session = req.appSession;
  if (!session?.profileId || !session.role) throw new ApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return { profileId: session.profileId, role: session.role.toUpperCase() };
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value ?? "";
}

async function respond(res: Response, operation: () => Promise<unknown>, message: string, status = 200) {
  try { return sendSuccess(res, status, message, await operation()); }
  catch (error) {
    if (error instanceof ApiError) return sendError(res, error.statusCode, error.message, error.code);
    console.error("Operational report request failed:", error);
    return sendError(res, 500, "Unable to complete the operational report request.", "OPERATIONAL_REPORT_FAILED");
  }
}

export const getOverview = (req: Request, res: Response) => respond(res, () => req.query.preload === "true" ? withReportReadBudget(() => service.getOperationsOverview(actor(req))) : service.getOperationsOverview(actor(req)), "Operational reports retrieved successfully");
export const getReporters = (req: Request, res: Response) => respond(res, () => service.listOperationsReporters(actor(req), typeof req.query.search === "string" ? req.query.search : ""), "Reporters retrieved successfully");
export const getOffloadTransactions = (req: Request, res: Response) => respond(res, () => service.searchOffloadTransactions(actor(req), typeof req.query.search === "string" ? req.query.search : "", req.query.page === undefined ? 1 : Number(req.query.page)), "DR transactions retrieved successfully");
export const getPendingCleanup = (req: Request, res: Response) => respond(res, () => listPendingOffloadCleanup(actor(req)), "Pending image cleanup retrieved");
export const retryCleanup = (req: Request, res: Response) => respond(res, () => retryOffloadCleanup(actor(req), param(req, "operationId")), "Image cleanup outcome retrieved");
export const getAssigned = (req: Request, res: Response) => respond(res, () => service.getAssignedOperations(actor(req)), "Assigned operational reports retrieved successfully");
export const getTripDetails = (req: Request, res: Response) => respond(res, () => service.getTripOperations(actor(req), param(req, "tripId")), "Trip operational details retrieved successfully");
export const saveLoading = (req: Request, res: Response) => respond(res, () => service.saveLoadingReport(actor(req), param(req, "tripId"), req.body), "Loading report saved successfully");
export const saveUnloading = (req: Request, res: Response) => respond(res, () => service.saveUnloadingReport(actor(req), param(req, "tripId"), param(req, "stopId"), req.body), "Unloading report saved successfully");
export const createBackload = (req: Request, res: Response) => respond(res, () => service.createBackload(actor(req), req.body), "Backload created successfully", 201);
export const updateBackload = (req: Request, res: Response) => respond(res, () => service.updateBackload(actor(req), param(req, "recordId"), req.body), "Backload updated successfully");
export const createOffload = (req: Request, res: Response) => respond(res, () => service.createOffload(actor(req), req.body), "Offload created successfully", 201);
export const updateOffload = (req: Request, res: Response) => respond(res, () => service.updateOffload(actor(req), param(req, "recordId"), req.body), "Offload updated successfully");
export const updateEventType = (req: Request, res: Response) => respond(res, () => service.updateOperationsEventType(actor(req), param(req, "sourceType"), param(req, "recordId"), req.body), "Event Type updated successfully");
export const deleteReport = (req: Request, res: Response) => respond(res, () => service.deleteOperationsReport(actor(req), param(req, "sourceType"), param(req, "recordId")), "Operational report deletion outcome retrieved");
export const convertReport = (req: Request, res: Response) => respond(res, () => service.convertOperationsReport(actor(req), req.body), "Operational report converted successfully");
export const submitEvent = (req: Request, res: Response) => respond(res, () => service.submitOperationsEvent(actor(req), req.body), "Operational event submitted successfully", 201);
export const uploadReceipt = (req: Request, res: Response) => respond(res, () => {
  if (!Buffer.isBuffer(req.body)) throw new ApiError("Choose a JPEG, PNG, or WebP image up to 5 MB.", 400, "INVALID_IMAGE");
  let fileName = String(req.headers["x-file-name"] ?? "");
  try { fileName = decodeURIComponent(fileName); }
  catch { throw new ApiError("Invalid image filename.", 400, "INVALID_IMAGE_NAME"); }
  return service.uploadOperationsReceipt(actor(req), param(req, "eventType"), param(req, "recordId"), req.body, String(req.headers["content-type"] ?? ""), fileName);
}, "Operational report image uploaded successfully", 201);
export const listReceipts = (req: Request, res: Response) => respond(res, () => service.listOperationsReceipts(actor(req), param(req, "eventType"), param(req, "recordId")), "Operational report images retrieved successfully");
