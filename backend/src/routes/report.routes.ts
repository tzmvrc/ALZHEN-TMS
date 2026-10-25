import { readSpreadsheetFormulas, saveSpreadsheetFormulas } from "../services/spreadsheet-formula.service.js";
import { readTripIssues,saveTripIssue,resolveTripIssue } from "../services/trip-issues.service.js";
import { sendSuccess,ApiError } from "../utils/api-response.js";
import { Router } from "express";
import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getCombinedReport,
  getDispatchMonitoringReport,
  getDispatchReport,
  getPodDriveFilesReport,
  getPodStatusReport,
  getReportColumnsByKey,
  getStoreCallingReport,
  getTripBookingReport,
  getTripExceptionsReport,
} from "../controllers/report.controller.js";
import * as transmittalTrackerController from "../controllers/transmittal-tracker.controller.js";
import * as operationsReportController from "../controllers/operations-report.controller.js";

const router = Router();
for(const [path,handler] of [["/formulas/read",readSpreadsheetFormulas],["/formulas/save",saveSpreadsheetFormulas],["/formulas/batch",saveSpreadsheetFormulas]] as const){router.post(path,authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))throw new ApiError("Invalid formula request.",400);return sendSuccess(res,200,"Formula request completed",await handler({profileId:req.profile!.id,role:String(req.profile!.role).toUpperCase()},req.body));}catch(error){next(error);}});}

router.get("/trip-issues/:source/:id",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Report trip resolved",await resolveTripIssue({profileId:req.profile!.id,role:String(req.profile!.role).toUpperCase()},String(req.params.source),String(req.params.id)));}catch(error){next(error);}});
router.get("/trip-issues",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{const ids=typeof req.query.trip_ids==="string"?req.query.trip_ids.split(",").filter(Boolean):undefined;const actor={profileId:req.profile!.id,role:String(req.profile!.role).toUpperCase()};return sendSuccess(res,200,"Trip issues retrieved",await readTripIssues(actor,ids));}catch(error){next(error);}});
router.post("/trip-issues",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))throw new ApiError("Invalid report input.",400);const actor={profileId:req.profile!.id,role:String(req.profile!.role).toUpperCase()};return sendSuccess(res,200,"Trip issue saved",await saveTripIssue(actor,req.body));}catch(error){next(error);}});


// Operational report writes authorize ADMIN/STAFF versus assigned TRUCKER
// accounts inside the service using the authenticated profile/session.
router.get("/operations/page", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.getPage);
router.get("/operations/overview", authMiddleware, operationsReportController.getOverview);
router.get("/operations/reporters", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.getReporters);
router.get("/operations/offload-transactions", authMiddleware, operationsReportController.getOffloadTransactions);
router.get("/operations/report-cleanup", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.getPendingReportCleanup);
router.post("/operations/report-cleanup/:sourceType/:operationId/retry", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.retryReportCleanup);
router.get("/operations/offload-cleanup", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.getPendingCleanup);
router.post("/operations/offload-cleanup/:operationId/retry", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.retryCleanup);
router.get("/operations/assigned", authMiddleware, operationsReportController.getAssigned);
router.get("/operations/trips/:tripId", authMiddleware, operationsReportController.getTripDetails);
router.patch("/operations/loading/:tripId/reports/:recordId", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.updateLoading);
router.put("/operations/loading/:tripId", authMiddleware, operationsReportController.saveLoading);
router.put("/operations/unloading/:tripId/stops/:stopId", authMiddleware, operationsReportController.saveUnloading);
router.post("/operations/backloads", authMiddleware, operationsReportController.createBackload);
router.patch("/operations/backloads/:recordId", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.updateBackload);
router.post("/operations/offloads", authMiddleware, operationsReportController.createOffload);
router.patch("/operations/offloads/:recordId", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.updateOffload);
router.patch("/operations/types/:sourceType/:recordId", authMiddleware, operationsReportController.updateEventType);
router.post("/operations/reports/delete", authMiddleware, requireRole("ADMIN", "STAFF"), operationsReportController.deleteReports);
router.delete("/operations/reports/:sourceType/:recordId", authMiddleware, operationsReportController.deleteReport);
router.post("/operations/conversions", authMiddleware, operationsReportController.convertReport);
router.post("/operations/events", authMiddleware, operationsReportController.submitEvent);
router.post(
  "/operations/:eventType/:recordId/receipts",
  authMiddleware,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  operationsReportController.uploadReceipt,
);
router.get("/operations/:eventType/:recordId/receipts", authMiddleware, operationsReportController.listReceipts);

router.get("/transmittal-tracker/page", authMiddleware, requireRole("ADMIN", "STAFF"), transmittalTrackerController.getTrackerPage);
router.get(
  "/transmittal-tracker",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  transmittalTrackerController.getTracker,
);
router.post(
  "/transmittal-tracker/initialize",
  authMiddleware,
  requireRole("ADMIN"),
  transmittalTrackerController.initializeTracker,
);
router.patch(
  "/transmittal-tracker/stops/:stopId/cells/:field",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  transmittalTrackerController.updateTrackerCell,
);

router.get(
  "/combined",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getCombinedReport,
);
router.get(
  "/dispatch",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getDispatchReport,
);
router.get(
  "/dispatch-monitoring",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getDispatchMonitoringReport,
);
router.get(
  "/trip-booking",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripBookingReport,
);
router.get(
  "/store-calling",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getStoreCallingReport,
);
router.get(
  "/pod-status",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getPodStatusReport,
);
router.get(
  "/pod-drive-files",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getPodDriveFilesReport,
);
router.get(
  "/trip-exceptions",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripExceptionsReport,
);
router.get(
  "/:reportKey/columns",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getReportColumnsByKey,
);

export default router;
