import { Router } from "express";
import { saveDriverOcr } from "../controllers/trip-receipt.controller.js";
import express from "express";
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
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  uploadDriverPod,
);
router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listTruckers);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getTrucker);

export default router;
