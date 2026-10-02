import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  createAssignment,
  deleteAssignment,
  listTripAssignments,
  updateAssignment,
} from "../controllers/assignment.controller.js";
import {
  createTrip,
  createTripLineItem,
  createTripStop,
  deleteTrip,
  deleteTripLineItem,
  deleteTripStop,
  getTrip,
  getTripByDispatch,
  getTripHistory,
  getTripLineItemsById,
  getTripStopsById,
  listTrips,
  updateTrip,
  updateTripLineItem,
  updateTripStop,
} from "../controllers/trip.controller.js";

const router = Router();

router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listTrips);
router.post("/", authMiddleware, requireRole("ADMIN", "STAFF"), createTrip);
router.get(
  "/dispatch/:dispatchNumber",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripByDispatch,
);
router.get(
  "/:id/assignments",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  listTripAssignments,
);
router.post(
  "/:id/assignments",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  createAssignment,
);
router.patch(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateAssignment,
);
router.delete(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  deleteAssignment,
);
router.patch("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), updateTrip);
router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  deleteTrip,
);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getTrip);
router.get(
  "/:id/stops",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripStopsById,
);
router.post(
  "/:id/stops",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  createTripStop,
);
router.patch(
  "/:id/stops/:stopId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateTripStop,
);
router.delete(
  "/:id/stops/:stopId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  deleteTripStop,
);
router.get(
  "/:id/line-items",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripLineItemsById,
);
router.post(
  "/:id/stops/:stopId/line-items",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  createTripLineItem,
);
router.patch(
  "/:id/stops/:stopId/line-items/:lineItemId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateTripLineItem,
);
router.delete(
  "/:id/stops/:stopId/line-items/:lineItemId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  deleteTripLineItem,
);
router.get(
  "/:id/events",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripHistory,
);

export default router;
