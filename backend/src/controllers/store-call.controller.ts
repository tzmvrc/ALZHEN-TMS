import { Request, Response } from "express";
import {
  getStoreCallById,
  updateStoreCallRecord,
} from "../services/store-call.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

function getParamString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export async function getStoreCall(req: Request, res: Response) {
  try {
    const storeCallId = getParamString(req.params.id);
    const result = await getStoreCallById(storeCallId);
    return sendSuccess(res, 200, "Store call retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch store call";
    if (message === "Store call not found") {
      return sendError(res, 404, message, "STORE_CALL_NOT_FOUND");
    }
    if (message.includes("Invalid") || message.includes("valid UUID")) {
      return sendError(res, 400, message, "STORE_CALL_INVALID_ID");
    }
    return sendError(res, 500, message, "STORE_CALL_QUERY_FAILED");
  }
}

export async function updateStoreCall(req: Request, res: Response) {
  try {
    const storeCallId = getParamString(req.params.id);
    const result = await updateStoreCallRecord(storeCallId, req.body ?? {});
    return sendSuccess(res, 200, "Store call updated successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update store call";
    if (message === "Store call not found") {
      return sendError(res, 404, message, "STORE_CALL_NOT_FOUND");
    }
    if (
      message.includes("Invalid") ||
      message.includes("must be a valid UUID") ||
      message.includes("must be a string") ||
      message.includes("must be a valid date string") ||
      message.includes("must be selected") ||
      message.includes("must be an active configured option") ||
      message.includes("must be READY, SENT, or CANCELLED") ||
      message.includes("field") ||
      message.includes("No valid store call fields")
    ) {
      return sendError(res, 400, message, "STORE_CALL_UPDATE_FAILED");
    }
    return sendError(res, 500, message, "STORE_CALL_UPDATE_FAILED");
  }
}
