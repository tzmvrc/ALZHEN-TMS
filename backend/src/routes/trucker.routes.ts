import { Router } from "express";
import {intakeCapabilities,prepareDriverPdf,getReceiptPages} from "../controllers/pod-intake.controller.js";
import { saveDriverOcr } from "../controllers/trip-receipt.controller.js";
import {podUploadBody} from "../middleware/pod-upload.middleware.js";
import {
  getMyAssignedTrips,
  getTrucker,
  listTruckers,
  updateDriverTrip,
  uploadDriverPod,
} from "../controllers/trucker.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();
router.get("/me/pod-intake-capabilities",authMiddleware,requireRole("TRUCKER"),intakeCapabilities);
router.post("/me/trips/:id/pod/prepare",authMiddleware,requireRole("TRUCKER"),podUploadBody,prepareDriverPdf);
router.get("/me/trips/:id/receipts/:receiptId/pages",authMiddleware,requireRole("TRUCKER"),getReceiptPages);
router.patch("/me/trips/:id/stops/:stopId/pod/ocr", authMiddleware, requireRole("TRUCKER"), saveDriverOcr);

router.get(
  "/me/trips",
  authMiddleware,
  requireRole("TRUCKER"),
  getMyAssignedTrips,
);
router.post(
  "/me/trip-status",
  authMiddleware,
  requireRole("TRUCKER"),
  updateDriverTrip,
);
router.post(
  "/me/trips/:id/pod",
  authMiddleware,
  requireRole("TRUCKER"),
  // Parse PDFs only to return the explicit disabled-intake validation; accepting
  // bytes here does not enable PDF Storage or OCR.
  podUploadBody,
  uploadDriverPod,
);
router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listTruckers);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getTrucker);

export default router;
