import { Request, Response } from "express";
import {
  getTripById,
  getTripByDispatchNumber,
  getTripEvents,
  getTripLineItems,
  getTripList,
  getTripStops,
} from "../services/trip.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

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
    const message = error instanceof Error ? error.message : "Unable to resolve trip";
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
