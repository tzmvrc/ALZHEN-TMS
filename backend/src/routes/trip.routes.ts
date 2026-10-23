import { finalizeImportCargo, setDefaultTripDriver } from "../services/trip-workflow.service.js";
import { parseDestination, resolveTripDestination } from "../services/trip-location.service.js";
import { listImportBatches, readImportBatch, saveImportDraft, rememberImportBatchError } from "../services/trip-import-recovery.service.js";
import {readTripConvoy,saveTripAllocations,saveAssignmentStops,saveAssignmentStopProgress} from "../services/trip-convoy.service.js";
import {deletePhysicalRecord} from "../services/record-deletion.service.js";
import {sendSuccess as sendRecordSuccess} from "../utils/api-response.js";
import {getTruckAvailability,getDriverAvailability} from "../services/truck-availability.service.js";
import { Router } from "express";
import { createProductRows } from "../services/trip-row-creation.service.js";
import { previewImport, commitImport } from "../controllers/trip-import.controller.js";
import {wholeTripImpact,deleteWholeTrips} from "../services/whole-trip-deletion.service.js";
import {ApiError,sendError,sendSuccess} from "../utils/api-response.js";
import {intakeCapabilities,getReceiptPages} from "../controllers/pod-intake.controller.js";
import { interpretReceipt, listReceipts, saveReceiptOcr, reviewCapabilities, reviewReceipt, reviewHistory } from "../controllers/trip-receipt.controller.js";
import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { pendingTransactionCleanup, retryTransactionImages, saveTransactionReference, transactionChanges } from "../controllers/transaction.controller.js";
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
  nextDispatchNumber,
  listDispatches,
  createTripLineItem,
  createTripStop,
  deleteTripLineItem,
  deleteTripStop,
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

import { saveMasterListCell } from "../services/master-list.service.js";
const router = Router();
router.patch("/:id/master-list-cell", authMiddleware, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
  try { return sendSuccess(res, 200, "Master List value saved", await saveMasterListCell(req.profile!.id, String(req.params.id), req.body ?? {})); }
  catch (error) { next(error); }
});
router.get("/import/location", authMiddleware, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
  try {
    const query = req.query.q;
    if (query !== undefined && (typeof query !== "string" || query.length > 300)) throw new ApiError("Use an address search of 300 characters or fewer.", 400);
    return sendSuccess(res, 200, "Destination location review", await resolveTripDestination(parseDestination(req.query), typeof query === "string" ? query : ""));
  }
  catch (error) { next(error); }
});
router.get("/driver-availability",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Driver availability",await getDriverAvailability(typeof req.query.start==="string"?req.query.start:undefined,typeof req.query.end==="string"?req.query.end:undefined,typeof req.query.exclude_trip_id==="string"?req.query.exclude_trip_id:undefined));}catch(error){next(error);}});
router.post("/default-driver",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Default driver saved",await setDefaultTripDriver(req.body,req.profile!.id));}catch(error){next(error);}});
router.get("/import/batches",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Import batches",await listImportBatches(req.profile!.id));}catch(error){next(error);}});
router.get("/import/batches/:batchId",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Import recovery",await readImportBatch(req.profile!.id,String(req.params.batchId)));}catch(error){next(error);}});
router.post("/import/batches/:batchId/draft",authMiddleware,requireRole("ADMIN","STAFF"),express.json({limit:"16mb"}),async(req,res,next)=>{try{return sendSuccess(res,200,"Import draft saved",await saveImportDraft(req.profile!.id,String(req.params.batchId),req.body));}catch(error){next(error);}});
router.post("/import/allocate",authMiddleware,requireRole("ADMIN","STAFF"),express.json({limit:"2mb"}),async(req,res,next)=>{try{return sendSuccess(res,200,"Import cargo confirmed",await finalizeImportCargo(req.body,req.profile!.id));}catch(error){await rememberImportBatchError(req.profile!.id,req.body?.batch_id,error);next(error);}});
router.post("/:id/stops/:stopId/line-items/batch", authMiddleware, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
  try { return sendSuccess(res, 201, "Product rows saved", await createProductRows(String(req.params.id), String(req.params.stopId), req.body?.rows)); }
  catch (error) { next(error); }
});
router.post("/import/preview", authMiddleware, requireRole("ADMIN", "STAFF"), express.json({ limit: "20mb" }), previewImport);
router.post("/import/commit", authMiddleware, requireRole("ADMIN", "STAFF"), express.json({ limit: "2mb" }), commitImport);
router.get("/whole-delete/capabilities",authMiddleware,requireRole("ADMIN"),(_req,res)=>sendSuccess(res,200,"Whole-trip deletion capabilities",{enabled:process.env.WHOLE_TRIP_DELETE_ENABLED==="true",max_unique_trips:20,password_required:false}));
router.post("/whole-delete/impact",authMiddleware,requireRole("ADMIN"),async(req,res)=>{try{return sendSuccess(res,200,"Whole-trip deletion impact",await wholeTripImpact({id:req.user!.id,role:req.user!.role!},req.body?.trip_ids));}catch(e){return sendError(res,e instanceof ApiError?e.statusCode:503,e instanceof Error?e.message:"Impact unavailable");}});
router.post("/whole-delete",authMiddleware,requireRole("ADMIN"),async(req,res)=>{try{const password=req.body?.current_password;if(req.body)delete req.body.current_password;return sendSuccess(res,200,"Whole-trip deletion committed",await deleteWholeTrips({id:req.user!.id,role:req.user!.role!},req.body?.trip_ids,{password,accessToken:req.headers.authorization?.replace(/^Bearer\s+/i,"").trim()??"",appSessionId:req.appSession?.sessionId??null}));}catch(e){return sendError(res,e instanceof ApiError?e.statusCode:503,e instanceof Error?e.message:"Deletion unavailable",e instanceof ApiError?e.code:undefined);}});
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
// Must stay above "/:id" routes, otherwise "next-dispatch-number" is read as a trip id.
router.get("/truck-availability",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res)=>{try{const result=await getTruckAvailability(typeof req.query.start==="string"?req.query.start:undefined,typeof req.query.end==="string"?req.query.end:undefined,typeof req.query.exclude_trip_id==="string"?req.query.exclude_trip_id:undefined);return sendSuccess(res,200,"Truck availability",result);}catch(error){return sendError(res,error instanceof ApiError?error.statusCode:503,"Unable to check truck availability. Check the schedule and try again.");}});
router.get("/next-dispatch-number", authMiddleware, requireRole("ADMIN", "STAFF"), nextDispatchNumber);
router.get("/dispatches", authMiddleware, requireRole("ADMIN", "STAFF"), listDispatches);
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
  requireRole("ADMIN"),
  (_req,res)=>sendError(res,410,"Use Delete Entire Trip with explicit confirmation.","EXPLICIT_WHOLE_TRIP_DELETE_REQUIRED"),
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

router.delete("/:id/stops/:stopId/record-only",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendRecordSuccess(res,200,"Empty delivery stop deleted",await deletePhysicalRecord({id:req.user!.id,role:req.profile!.role},"trip_stops",String(req.params.stopId),req.body?.expected_version,String(req.params.id)));}catch(error){next(error);}});
router.get("/:id/convoy",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendRecordSuccess(res,200,"Trip convoy",await readTripConvoy({id:req.user!.id,role:req.profile!.role},String(req.params.id)));}catch(error){next(error);}});
router.post("/:id/convoy/allocations",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendRecordSuccess(res,200,"Cargo allocations saved",await saveTripAllocations({id:req.user!.id,role:req.profile!.role},String(req.params.id),req.body?.changes));}catch(error){next(error);}});
router.put("/:id/convoy/assignments/:assignmentId/stops",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendRecordSuccess(res,200,"Truck stops saved",await saveAssignmentStops({id:req.user!.id,role:req.profile!.role},String(req.params.id),String(req.params.assignmentId),req.body??{}));}catch(error){next(error);}});
router.patch("/:id/convoy/stops/:responsibilityId",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendRecordSuccess(res,200,"Truck stop progress saved",await saveAssignmentStopProgress({id:req.user!.id,role:req.profile!.role},String(req.params.id),String(req.params.responsibilityId),req.body??{}));}catch(error){next(error);}});
export default router;
