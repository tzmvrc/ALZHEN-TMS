import { Router } from "express";
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

const router = Router();

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
