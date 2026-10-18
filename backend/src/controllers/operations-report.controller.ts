import type { Request, Response } from "express";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import * as service from "../services/operations-report.service.js";
import { requireReportUuid } from "../services/operations-report.logic.js";
import { withReportReadBudget } from "../services/report-read-budget.js";
import { listPendingOffloadCleanup, retryOffloadCleanup, listPendingBackloadCleanup, retryBackloadCleanup } from "../services/offload-deletion.service.js";

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

export const getPage = (req: Request, res: Response) => respond(res, () => service.getOperationsPage(actor(req), req.query), "Operations page retrieved successfully");
export const getOverview = (req: Request, res: Response) => respond(res, () => req.query.preload === "true" ? withReportReadBudget(() => service.getOperationsOverview(actor(req))) : service.getOperationsOverview(actor(req)), "Operational reports retrieved successfully");
export const getReporters = (req: Request, res: Response) => respond(res, () => service.listOperationsReporters(actor(req), typeof req.query.search === "string" ? req.query.search : ""), "Reporters retrieved successfully");
export const getOffloadTransactions = (req: Request, res: Response) => respond(res, () => service.searchOffloadTransactions(actor(req), typeof req.query.search === "string" ? req.query.search : "", req.query.page === undefined ? 1 : Number(req.query.page)), "DR transactions retrieved successfully");
export const getPendingCleanup = (req: Request, res: Response) => respond(res, () => listPendingOffloadCleanup(actor(req)), "Pending image cleanup retrieved");
export const retryCleanup = (req: Request, res: Response) => respond(res, () => retryOffloadCleanup(actor(req), param(req, "operationId")), "Image cleanup outcome retrieved");
export const getAssigned = (req: Request, res: Response) => respond(res, () => service.getAssignedOperations(actor(req)), "Assigned operational reports retrieved successfully");
export const getTripDetails = (req: Request, res: Response) => respond(res, () => service.getTripOperations(actor(req), param(req, "tripId")), "Trip operational details retrieved successfully");
export const updateLoading = (req: Request, res: Response) => respond(res, () => service.saveLoadingReport(actor(req), param(req, "tripId"), req.body, param(req, "recordId")), "Loading report updated successfully");
export const saveLoading = (req: Request, res: Response) => respond(res, () => service.saveLoadingReport(actor(req), param(req, "tripId"), req.body), "Loading report saved successfully");
export const saveUnloading = (req: Request, res: Response) => respond(res, () => service.saveUnloadingReport(actor(req), param(req, "tripId"), param(req, "stopId"), req.body), "Unloading report saved successfully");
function submissionBody(req: Request) {
  requireReportUuid(req.body?.request_id, "request_id");
  return req.body;
}
export const createBackload = (req: Request, res: Response) => respond(res, () => service.createBackload(actor(req), submissionBody(req)), "Backload created successfully", 201);
export const updateBackload = (req: Request, res: Response) => respond(res, () => service.updateBackload(actor(req), param(req, "recordId"), req.body), "Backload updated successfully");
export const createOffload = (req: Request, res: Response) => respond(res, () => service.createOffload(actor(req), submissionBody(req)), "Offload created successfully", 201);
export const updateOffload = (req: Request, res: Response) => respond(res, () => service.updateOffload(actor(req), param(req, "recordId"), req.body), "Offload updated successfully");
export const updateEventType = (req: Request, res: Response) => respond(res, () => service.updateOperationsEventType(actor(req), param(req, "sourceType"), param(req, "recordId"), req.body), "Event Type updated successfully");
function deletionCredentials(req:Request){
 const password=req.body?.current_password;
 if(req.body)delete req.body.current_password;
 return {password,accessToken:req.headers.authorization?.replace(/^Bearer\s+/i,"").trim()??"",appSessionId:req.appSession?.sessionId??null};
}
export const deleteReport = (req:Request,res:Response)=>respond(res,()=>service.deleteOperationsReport(actor(req),param(req,"sourceType"),param(req,"recordId"),deletionCredentials(req)),"Operational report deletion outcome retrieved");
export const deleteReports = (req:Request,res:Response)=>respond(res,()=>service.deleteOperationsReports(actor(req),req.body?.targets,deletionCredentials(req)),"Operational report deletion outcomes retrieved");
export const convertReport = (req: Request, res: Response) => respond(res, () => service.convertOperationsReport(actor(req), req.body), "Operational report converted successfully");
export const submitEvent = (req: Request, res: Response) => respond(res, () => service.submitOperationsEvent(actor(req), submissionBody(req)), "Operational event submitted successfully", 201);
export const uploadReceipt = (req: Request, res: Response) => respond(res, () => {
  if (!Buffer.isBuffer(req.body)) throw new ApiError("Choose a JPEG, PNG, or WebP image up to 5 MB.", 400, "INVALID_IMAGE");
  let fileName = String(req.headers["x-file-name"] ?? "");
  try { fileName = decodeURIComponent(fileName); }
  catch { throw new ApiError("Invalid image filename.", 400, "INVALID_IMAGE_NAME"); }
  const requestId = requireReportUuid(req.get("X-Upload-Request-Id"), "upload_request_id");
  return service.uploadOperationsReceipt(actor(req), param(req, "eventType"), param(req, "recordId"), req.body, String(req.headers["content-type"] ?? ""), fileName, requestId);
}, "Operational report image uploaded successfully", 201);
export const listReceipts = (req: Request, res: Response) => respond(res, () => service.listOperationsReceipts(actor(req), param(req, "eventType"), param(req, "recordId")), "Operational report images retrieved successfully");

export const getPendingReportCleanup=(req:Request,res:Response)=>respond(res,async()=>{
 const owner=actor(req),[offloads,backloads]=await Promise.all([listPendingOffloadCleanup(owner),listPendingBackloadCleanup(owner)]);
 return [...offloads.map(row=>({...row,source_type:"OFFLOAD"})),...backloads.map(row=>({...row,source_type:"BACKLOAD"}))];
},"Pending report image cleanup retrieved");
export const retryReportCleanup=(req:Request,res:Response)=>respond(res,()=>{
 const source=param(req,"sourceType").toUpperCase();
 if(!["OFFLOAD","BACKLOAD"].includes(source))throw new ApiError("Invalid cleanup report type.",400,"INVALID_SOURCE_TYPE");
 return (source==="OFFLOAD"?retryOffloadCleanup:retryBackloadCleanup)(actor(req),param(req,"operationId"));
},"Report image cleanup outcome retrieved");
