import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getTrip,
  getTripByDispatch,
  getTripHistory,
  getTripLineItemsById,
  getTripStopsById,
  listTrips,
} from "../controllers/trip.controller.js";

const router = Router();

router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listTrips);
router.get(
  "/dispatch/:dispatchNumber",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripByDispatch,
);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getTrip);
router.get(
  "/:id/stops",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripStopsById,
);
router.get(
  "/:id/line-items",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripLineItemsById,
);
router.get(
  "/:id/events",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripHistory,
);

export default router;
