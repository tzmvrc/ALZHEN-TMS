import { Request, Response } from "express";
import {
  createTripAssignment,
  deleteTripAssignment,
  getTripAssignments,
  updateTripAssignment,
} from "../services/assignment.service.js";
import { ApiError,sendError, sendSuccess } from "../utils/api-response.js";

export async function listTripAssignments(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");

    const result = await getTripAssignments(tripId);
    return sendSuccess(
      res,
      200,
      "Trip assignments retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch trip assignments";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    return sendError(
      res,
      message.includes("Invalid") || message.includes("must be") ? 400 : 500,
      message,
      "TRIP_ASSIGNMENT_QUERY_FAILED",
    );
  }
}

export async function createAssignment(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");

    const result = await createTripAssignment(tripId, req.body ?? {});
    return sendSuccess(res, 201, "Assignment created successfully", result);
  } catch (error) {
    if(error instanceof ApiError)return sendError(res,error.statusCode,error.message,error.code);
    const message =
      error instanceof Error ? error.message : "Unable to create assignment";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (message === "Driver not found") {
      return sendError(res, 404, message, "DRIVER_NOT_FOUND");
    }
    if (message === "Truck not found") {
      return sendError(res, 404, message, "TRUCK_NOT_FOUND");
    }
    if (message === "Trucking company not found") {
      return sendError(res, 404, message, "TRUCKING_COMPANY_NOT_FOUND");
    }
    if (
      message.includes("Assignment already exists") ||
      message.includes("relationship is invalid") ||
      message.includes("already exists")
    ) {
      return sendError(res, 409, message, "TRIP_ASSIGNMENT_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("not found")
        ? 400
        : 500,
      message,
      "TRIP_ASSIGNMENT_CREATE_FAILED",
    );
  }
}

export async function updateAssignment(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const assignmentId = Array.isArray(req.params.assignmentId)
      ? req.params.assignmentId[0]
      : (req.params.assignmentId ?? "");

    const result = await updateTripAssignment(
      tripId,
      assignmentId,
      req.body ?? {},
    );
    return sendSuccess(res, 200, "Assignment updated successfully", result);
  } catch (error) {
    if(error instanceof ApiError)return sendError(res,error.statusCode,error.message,error.code);
    const message =
      error instanceof Error ? error.message : "Unable to update assignment";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (message === "Assignment not found") {
      return sendError(res, 404, message, "TRIP_ASSIGNMENT_NOT_FOUND");
    }
    if (message === "Assignment does not belong to this trip") {
      return sendError(res, 404, message, "TRIP_ASSIGNMENT_NOT_FOUND");
    }
    if (
      message.includes("Assignment already exists") ||
      message.includes("relationship is invalid")
    ) {
      return sendError(res, 409, message, "TRIP_ASSIGNMENT_CONFLICT");
    }
    return sendError(
      res,
      message.includes("Invalid") ||
        message.includes("must be") ||
        message.includes("field") ||
        message.includes("not found")
        ? 400
        : 500,
      message,
      "TRIP_ASSIGNMENT_UPDATE_FAILED",
    );
  }
}

export async function deleteAssignment(req: Request, res: Response) {
  try {
    const tripId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const assignmentId = Array.isArray(req.params.assignmentId)
      ? req.params.assignmentId[0]
      : (req.params.assignmentId ?? "");

    const result = await deleteTripAssignment(tripId, assignmentId);
    return sendSuccess(res, 200, "Assignment deleted successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete assignment";
    if (message === "Trip not found") {
      return sendError(res, 404, message, "TRIP_NOT_FOUND");
    }
    if (
      message === "Assignment not found" ||
      message === "Assignment not found for this trip"
    ) {
      return sendError(res, 404, message, "TRIP_ASSIGNMENT_NOT_FOUND");
    }
    if (message.includes("blocked by existing dependent records")) {
      return sendError(res, 409, message, "TRIP_ASSIGNMENT_DELETE_BLOCKED");
    }
    return sendError(
      res,
      message.includes("Invalid") || message.includes("must be") ? 400 : 500,
      message,
      "TRIP_ASSIGNMENT_DELETE_FAILED",
    );
  }
}
