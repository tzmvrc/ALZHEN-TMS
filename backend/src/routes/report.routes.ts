import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getCombinedReport,
  getDispatchMonitoringReport,
  getDispatchReport,
  getReportColumnsByKey,
  getStoreCallingReport,
  getTripBookingReport,
} from "../controllers/report.controller.js";

const router = Router();

router.get(
  "/combined",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getCombinedReport,
);
router.get(
  "/dispatch-monitoring",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getDispatchMonitoringReport,
);
router.get(
  "/dispatch",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getDispatchReport,
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
  "/:reportKey/columns",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getReportColumnsByKey,
);

export default router;
