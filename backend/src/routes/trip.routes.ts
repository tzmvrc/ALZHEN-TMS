import { Router } from "express";
import {intakeCapabilities,getReceiptPages} from "../controllers/pod-intake.controller.js";
import { interpretReceipt, listReceipts, saveReceiptOcr, reviewCapabilities, reviewReceipt, reviewHistory } from "../controllers/trip-receipt.controller.js";
import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { removeTransaction, pendingTransactionCleanup, retryTransactionImages, saveTransactionReference, transactionChanges } from "../controllers/transaction.controller.js";
import {
  listImages,
  removeImage,
  uploadImage,
} from "../controllers/trip-image.controller.js";
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
  deleteTripLineItem,
  getTrip,
  getTripByDispatch,
  getTripHistory,
  getTripLineItemsById,
  getTripStopsById,
  listTrips,
  updateTrip,
  updateTripBilling,
  updateTripLineItem,
  updateTripUnscopedLineItem,
  updateTripStop,
} from "../controllers/trip.controller.js";

const router = Router();
router.get("/pod-intake-capabilities",authMiddleware,requireRole("ADMIN","STAFF"),intakeCapabilities);
router.get("/:id/receipts/:receiptId/pages",authMiddleware,requireRole("ADMIN","STAFF"),getReceiptPages);
router.get("/pod-review-capabilities",authMiddleware,requireRole("ADMIN","STAFF"),reviewCapabilities);
router.post("/:id/receipts/:receiptId/decision",authMiddleware,requireRole("ADMIN","STAFF"),reviewReceipt);
router.get("/:id/receipts/:receiptId/decisions",authMiddleware,requireRole("ADMIN","STAFF"),reviewHistory);
router.get("/:id/receipts", authMiddleware, requireRole("ADMIN", "STAFF"), listReceipts);
router.patch("/:id/receipts/:receiptId/ocr", authMiddleware, requireRole("ADMIN", "STAFF"), saveReceiptOcr);
router.post("/:id/receipts/:receiptId/interpret", authMiddleware, requireRole("ADMIN", "STAFF"), interpretReceipt);
router.get("/transaction-changes", authMiddleware, requireRole("ADMIN", "STAFF"), transactionChanges);
router.get("/transaction-cleanup", authMiddleware, requireRole("ADMIN", "STAFF"), pendingTransactionCleanup);
router.post("/transaction-cleanup/:operationId/retry", authMiddleware, requireRole("ADMIN", "STAFF"), retryTransactionImages);
router.patch("/:id/transaction-archive", authMiddleware, requireRole("ADMIN", "STAFF"), (_req, res) => { res.status(410).json({ success: false, message: "Transaction archiving has been retired. Use permanent deletion with confirmation." }); });
router.patch("/:id/stops/:stopId/transmittal-reference", authMiddleware, requireRole("ADMIN", "STAFF"), saveTransactionReference);

router.get(
  "/:id/images",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  listImages,
);
router.post(
  "/:id/images",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  uploadImage,
);
router.delete(
  "/:id/images/:imageId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  removeImage,
);
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
router.patch(
  "/:id/billings/:billingId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateTripBilling,
);
router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  removeTransaction,
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
  removeTransaction,
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
router.patch(
  "/:id/line-items/:lineItemId",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateTripUnscopedLineItem,
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
