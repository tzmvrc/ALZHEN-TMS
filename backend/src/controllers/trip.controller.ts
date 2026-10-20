import { Request, Response } from "express";
import {
  createTripLineItemRecord,
  createTripRecord,
  createTripStopRecord,
  deleteTripLineItemRecord,
  deleteTripRecord,
  deleteTripStopRecord,
  getTripByDispatchNumber,
  getTripById,
  getTripEvents,
  getTripLineItems,
  getTripList,
  getTripStops,
  getNextDispatchNumber,
  listDispatchOptions,
  resolveTripTypeByName,
  resolveProductByCode,
  updateTripLineItemRecord,
  updateTripUnscopedLineItemRecord,
  updateTripBillingRecord as updateTripBillingRecordData,
  updateTripRecord,
  updateTripStopRecord,
} from "../services/trip.service.js";
import { saveTripBundle } from "../services/trip-bundle.logic.js";
import { createTripAssignment } from "../services/assignment.service.js";
import { supabaseAdmin } from "../config/supabase.js";
import { sendError, sendSuccess } from "../utils/api-response.js";
import { notifyMentionAfterRemarksSave } from "../services/notification.service.js";

export async function listTrips(req: Request, res: Response) {
  try {
    const result = await getTripList(req.query as Record<string, string>);
    return sendSuccess(res, 200, "Trips retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trips";
    return sendError(
      res,
      message.includes("Invalid") || message.includes("must") ? 400 : 500,
      message,
      "TRIP_QUERY_FAILED",
    );
  }
}

export async function getTrip(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await getTripById(tripId);
    return sendSuccess(res, 200, "Trip retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trip";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(res, 400, message, "TRIP_QUERY_FAILED");
  }
}

export async function getTripByDispatch(req: Request, res: Response) {
  try {
    const dispatchNumber = Array.isArray(req.params.dispatchNumber)
      ? req.params.dispatchNumber[0]
      : (req.params.dispatchNumber ?? "");
    const result = await getTripByDispatchNumber(dispatchNumber);
    return sendSuccess(res, 200, "Trip resolved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to resolve trip";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(
      res,
      message.startsWith("Invalid") ? 400 : 500,
      message,
      "TRIP_LOOKUP_FAILED",
    );
  }
}

export async function nextDispatchNumber(req: Request, res: Response) {
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    const dispatchNumber = await getNextDispatchNumber(prefix);
    return sendSuccess(res, 200, "Dispatch number generated", { dispatch_number: dispatchNumber, trip_number: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate dispatch number";
    return sendError(res, message.startsWith("Invalid") ? 400 : 500, message, "TRIP_DISPATCH_GENERATE_FAILED");
  }
}

export async function listDispatches(req: Request, res: Response) {
  try {
    const rows = await listDispatchOptions(req.query.q);
    return sendSuccess(res, 200, "Dispatches retrieved successfully", rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch dispatches";
    return sendError(res, 500, message, "TRIP_DISPATCH_LIST_FAILED");
  }
}

export async function createTrip(req: Request, res: Response) {
  try {
    const result = req.body && "trip" in req.body
      ? await saveTripBundle(req.body, {
          createTrip: (input) => createTripRecord(input, req.user, req.profile),
          createStop: createTripStopRecord,
          createLine: createTripLineItemRecord,
          createAssignment: createTripAssignment,
          resolveTripType: resolveTripTypeByName,
          resolveProduct: resolveProductByCode,
          rollback: async (tripId) => {
            for (const table of ["trip_truck_assignments", "trip_line_items", "trip_stops", "trips"]) {
              const { error } = await supabaseAdmin.from(table).delete().eq(table === "trips" ? "id" : "trip_id", tripId);
              if (error) throw error;
            }
          },
        })
      : await createTripRecord(req.body, req.user, req.profile);
    return sendSuccess(res, 201, "Trip created successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create trip";
    if (message === "Dispatch number already exists.") {
      return sendError(res, 409, message, "TRIP_DISPATCH_EXISTS");
    }
    return sendError(
      res,
      message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("required") ||
        message.toLowerCase().includes("must") ||
        message.toLowerCase().includes("already exists")
        ? 400
        : 500,
      message,
      "TRIP_CREATE_FAILED",
    );
  }
}

export async function updateTrip(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const { _mention, ...updates } = req.body ?? {};
    const result = await updateTripRecord(
      tripId,
      updates,
      req.user,
      req.profile,
    );
    const warning = await notifyMentionAfterRemarksSave({ actorId: req.user!.id, referenceType: "trip", referenceId: tripId, remarks: updates.remarks, mention: _mention });
    return sendSuccess(res, 200, "Trip updated successfully", warning ? { ...result, _mention_notification_warning: warning } : result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update trip";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (message === "Dispatch number already exists.") {
      return sendError(res, 409, message, "TRIP_DISPATCH_EXISTS");
    }
    return sendError(
      res,
      message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("required") ||
        message.toLowerCase().includes("must") ||
        message.toLowerCase().includes("already exists")
        ? 400
        : 500,
      message,
      "TRIP_UPDATE_FAILED",
    );
  }
}

export async function deleteTrip(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await deleteTripRecord(tripId);
    return sendSuccess(res, 200, "Trip deleted successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete trip";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (message.includes("related records") || message.includes("not safe")) {
      return sendError(res, 409, message, "TRIP_DELETE_BLOCKED");
    }
    return sendError(res, 400, message, "TRIP_DELETE_FAILED");
  }
}

export async function getTripStopsById(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await getTripStops(tripId);
    return sendSuccess(res, 200, "Trip stops retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trip stops";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(res, 400, message, "TRIP_QUERY_FAILED");
  }
}

export async function createTripStop(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await createTripStopRecord(tripId, req.body ?? {});
    return sendSuccess(res, 201, "Trip stop created successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create trip stop";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message.includes("already exists") ||
      message.includes("blocked by existing operational records") ||
      message.includes("reference is invalid")
    ) {
      return sendError(res, 409, message, "TRIP_STOP_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("required")
        ? 400
        : 500,
      message,
      "TRIP_STOP_CREATE_FAILED",
    );
  }
}

export async function updateTripStop(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const stopId = Array.isArray(req.params.stopId)
      ? req.params.stopId[0]
      : (req.params.stopId ?? "");

    const { _mention, ...updates } = req.body ?? {};
    const result = await updateTripStopRecord(tripId, stopId, updates);
    const warning = await notifyMentionAfterRemarksSave({ actorId: req.user!.id, referenceType: "trip", referenceId: tripId, remarks: updates.remarks, mention: _mention });
    return sendSuccess(res, 200, "Trip stop updated successfully", warning ? { ...result, _mention_notification_warning: warning } : result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update trip stop";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Stop not found" ||
      message === "Stop does not belong to this trip"
    ) {
      return sendError(res, 404, message, "TRIP_STOP_NOT_FOUND");
    }
    if (
      message.includes("already exists") ||
      message.includes("sequence already exists")
    ) {
      return sendError(res, 409, message, "TRIP_STOP_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("required")
        ? 400
        : 500,
      message,
      "TRIP_STOP_UPDATE_FAILED",
    );
  }
}

export async function deleteTripStop(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const stopId = Array.isArray(req.params.stopId)
      ? req.params.stopId[0]
      : (req.params.stopId ?? "");

    const result = await deleteTripStopRecord(tripId, stopId);
    return sendSuccess(res, 200, "Trip stop deleted successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete trip stop";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Stop not found" ||
      message === "Stop not found for this trip" ||
      message === "Stop does not belong to this trip"
    ) {
      return sendError(res, 404, message, "TRIP_STOP_NOT_FOUND");
    }
    if (message.includes("blocked by existing operational records")) {
      return sendError(res, 409, message, "TRIP_STOP_DELETE_BLOCKED");
    }
    return sendError(
      res,
      message.includes("Invalid") || message.includes("must be") ? 400 : 500,
      message,
      "TRIP_STOP_DELETE_FAILED",
    );
  }
}

export async function getTripLineItemsById(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await getTripLineItems(tripId);
    return sendSuccess(
      res,
      200,
      "Trip line items retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch trip line items";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(res, 400, message, "TRIP_QUERY_FAILED");
  }
}

export async function createTripLineItem(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const stopId = Array.isArray(req.params.stopId)
      ? req.params.stopId[0]
      : (req.params.stopId ?? "");

    const result = await createTripLineItemRecord(
      tripId,
      stopId,
      req.body ?? {},
    );
    return sendSuccess(res, 201, "Trip line item created successfully", result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create trip line item";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Stop not found" ||
      message === "Stop does not belong to this trip"
    ) {
      return sendError(res, 404, message, "TRIP_STOP_NOT_FOUND");
    }
    if (message === "Product not found") {
      return sendError(res, 404, message, "PRODUCT_NOT_FOUND");
    }
    if (
      message.includes("already exists") ||
      message.includes("relationship is invalid") ||
      message.includes("duplicate")
    ) {
      return sendError(res, 409, message, "TRIP_LINE_ITEM_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("required")
        ? 400
        : 500,
      message,
      "TRIP_LINE_ITEM_CREATE_FAILED",
    );
  }
}

export async function updateTripLineItem(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const stopId = Array.isArray(req.params.stopId)
      ? req.params.stopId[0]
      : (req.params.stopId ?? "");
    const lineItemId = Array.isArray(req.params.lineItemId)
      ? req.params.lineItemId[0]
      : (req.params.lineItemId ?? "");

    const { _mention, ...updates } = req.body ?? {};
    const result = await updateTripLineItemRecord(
      tripId,
      stopId,
      lineItemId,
      updates,
    );
    const warning = await notifyMentionAfterRemarksSave({ actorId: req.user!.id, referenceType: "trip", referenceId: tripId, remarks: updates.remarks, mention: _mention });
    return sendSuccess(res, 200, "Trip line item updated successfully", warning ? { ...result, _mention_notification_warning: warning } : result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update trip line item";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Stop not found" ||
      message === "Stop does not belong to this trip" ||
      message === "Line item not found" ||
      message === "Line item does not belong to this trip" ||
      message === "Line item does not belong to this stop"
    ) {
      return sendError(res, 404, message, "TRIP_LINE_ITEM_NOT_FOUND");
    }
    if (message.includes("already exists") || message.includes("duplicate")) {
      return sendError(res, 409, message, "TRIP_LINE_ITEM_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("required")
        ? 400
        : 500,
      message,
      "TRIP_LINE_ITEM_UPDATE_FAILED",
    );
  }
}

export async function updateTripUnscopedLineItem(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
    const lineItemId = Array.isArray(req.params.lineItemId) ? req.params.lineItemId[0] : (req.params.lineItemId ?? "");
    const result = await updateTripUnscopedLineItemRecord(tripId, lineItemId, req.body ?? {});
    return sendSuccess(res, 200, "Trip line item updated successfully", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update trip line item";
    const notFound = ["Trip not found", "Line item not found", "Line item does not belong to this trip", "Line item does not belong to this stop"].includes(message);
    const conflict = message.includes("already exists") || message.includes("duplicate");
    const invalid = message.includes("Invalid") || message.includes("must be") || message.includes("field") || message.includes("required");
    return sendError(res, notFound ? 404 : conflict ? 409 : invalid ? 400 : 500, message, "TRIP_LINE_ITEM_UPDATE_FAILED");
  }
}

export async function deleteTripLineItem(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const stopId = Array.isArray(req.params.stopId)
      ? req.params.stopId[0]
      : (req.params.stopId ?? "");
    const lineItemId = Array.isArray(req.params.lineItemId)
      ? req.params.lineItemId[0]
      : (req.params.lineItemId ?? "");

    const result = await deleteTripLineItemRecord(tripId, stopId, lineItemId);
    return sendSuccess(res, 200, "Trip line item deleted successfully", result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to delete trip line item";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Stop not found" ||
      message === "Stop does not belong to this trip" ||
      message === "Line item not found" ||
      message === "Line item does not belong to this trip" ||
      message === "Line item does not belong to this stop"
    ) {
      return sendError(res, 404, message, "TRIP_LINE_ITEM_NOT_FOUND");
    }
    if (message.includes("blocked by existing dependent records")) {
      return sendError(res, 409, message, "TRIP_LINE_ITEM_DELETE_BLOCKED");
    }
    return sendError(
      res,
      message.includes("Invalid") || message.includes("must be") ? 400 : 500,
      message,
      "TRIP_LINE_ITEM_DELETE_FAILED",
    );
  }
}

export async function getTripHistory(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await getTripEvents(tripId);
    return sendSuccess(res, 200, "Trip events retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trip events";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(res, 400, message, "TRIP_QUERY_FAILED");
  }
}

export async function updateTripBilling(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
    const billingId = Array.isArray(req.params.billingId) ? req.params.billingId[0] : (req.params.billingId ?? "");
    const result = await updateTripBillingRecordData(tripId, billingId, req.body ?? {});
    return sendSuccess(res, 200, "Billing record updated successfully", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update billing record";
    const notFound = message === "Billing record not found" || message === "Billing record does not belong to this trip";
    const invalid = message.includes("Invalid") || message.includes("must be") || message.includes("Only ");
    return sendError(res, notFound ? 404 : invalid ? 400 : 500, message, "TRIP_BILLING_UPDATE_FAILED");
  }
}