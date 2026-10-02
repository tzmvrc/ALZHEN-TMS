import { Request, Response } from "express";
import {
  createDocumentRecord,
  getDocumentById,
  getDocumentList,
  updateDocumentRecord,
  verifyDocumentRecord,
} from "../services/document.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

function getParamString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export async function listDocuments(req: Request, res: Response) {
  try {
    const result = await getDocumentList(req.query as Record<string, string>);
    return sendSuccess(res, 200, "Documents retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch documents";
    if (
      message.includes("must be a valid UUID") ||
      message.includes("Invalid")
    ) {
      return sendError(res, 400, message, "DOCUMENT_QUERY_FAILED");
    }
    return sendError(res, 500, message, "DOCUMENT_QUERY_FAILED");
  }
}

export async function getDocument(req: Request, res: Response) {
  try {
    const documentId = getParamString(req.params.id);
    const result = await getDocumentById(documentId);
    return sendSuccess(res, 200, "Document retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch document";
    if (message === "Document not found") {
      return sendError(res, 404, message, "DOCUMENT_NOT_FOUND");
    }
    if (message.includes("Invalid") || message.includes("valid UUID")) {
      return sendError(res, 400, message, "DOCUMENT_INVALID_ID");
    }
    return sendError(res, 500, message, "DOCUMENT_QUERY_FAILED");
  }
}

export async function createDocument(req: Request, res: Response) {
  try {
    if (!req.user?.id) {
      return sendError(res, 401, "Authentication required", "AUTH_REQUIRED");
    }

    const result = await createDocumentRecord(req.body ?? {}, req.user.id);
    return sendSuccess(res, 201, "Document created successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create document";
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
      message.includes("must be a valid UUID") ||
      message.includes("is required") ||
      message.includes("must be one of") ||
      message.includes("Invalid document field") ||
      message.includes("must be a string")
    ) {
      return sendError(res, 400, message, "DOCUMENT_CREATE_FAILED");
    }
    if (message.includes("Document references an invalid trip or stop")) {
      return sendError(res, 409, message, "DOCUMENT_REFERENCE_INVALID");
    }
    return sendError(res, 500, message, "DOCUMENT_CREATE_FAILED");
  }
}

export async function updateDocument(req: Request, res: Response) {
  try {
    const documentId = getParamString(req.params.id);
    const result = await updateDocumentRecord(documentId, req.body ?? {});
    return sendSuccess(res, 200, "Document updated successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update document";
    if (message === "Document not found") {
      return sendError(res, 404, message, "DOCUMENT_NOT_FOUND");
    }
    if (
      message.includes("Invalid document id") ||
      message.includes("must be a valid UUID") ||
      message.includes("Invalid or protected document field") ||
      message.includes("No valid document fields") ||
      message.includes("cannot be empty") ||
      message.includes("must be one of") ||
      message.includes("must be a string")
    ) {
      return sendError(res, 400, message, "DOCUMENT_UPDATE_FAILED");
    }
    return sendError(res, 500, message, "DOCUMENT_UPDATE_FAILED");
  }
}

export async function verifyDocument(req: Request, res: Response) {
  try {
    if (!req.user?.id) {
      return sendError(res, 401, "Authentication required", "AUTH_REQUIRED");
    }

    const documentId = getParamString(req.params.id);
    const result = await verifyDocumentRecord(documentId, req.user.id);
    return sendSuccess(res, 200, "Document verified successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify document";
    if (message === "Document not found") {
      return sendError(res, 404, message, "DOCUMENT_NOT_FOUND");
    }
    if (
      message.includes("Invalid document id") ||
      message.includes("must be a valid UUID")
    ) {
      return sendError(res, 400, message, "DOCUMENT_VERIFY_FAILED");
    }
    return sendError(res, 500, message, "DOCUMENT_VERIFY_FAILED");
  }
}
