import { Request, Response } from "express";
import {
  getDriverAssignedTrips,
  getTruckerById,
  getTruckerList,
  saveDriverTripReceipt,
  updateDriverTripStatus,
} from "../services/trucker.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";
import { TripImageError } from "../services/trip-image.service.js";

export async function listTruckers(req: Request, res: Response) {
  try {
    const result = await getTruckerList(req.query as Record<string, unknown>);
    return sendSuccess(res, 200, "Truckers retrieved successfully", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch truckers";
    return sendError(res, 400, message, "TRUCKER_QUERY_FAILED");
  }
}

export async function getTrucker(req: Request, res: Response) {
  try {
    const truckerId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await getTruckerById(truckerId);
    return sendSuccess(res, 200, "Trucker retrieved successfully", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch trucker";
    if (message === "Trucker not found") {
      return sendError(res, 404, message, "TRUCKER_NOT_FOUND");
    }
    return sendError(res, 400, message, "TRUCKER_QUERY_FAILED");
  }
}

export async function getMyAssignedTrips(req: Request, res: Response) {
  try {
    const profileId = req.user?.id ?? req.appSession?.profileId ?? null;
    if (!profileId) {
      return sendError(res, 401, "Authentication required", "TRUCKER_SESSION_REQUIRED");
    }

    const trips = await getDriverAssignedTrips(profileId);
    return sendSuccess(res, 200, "Assigned trips retrieved successfully", trips);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load assigned trips";
    return sendError(res, 500, message, "TRUCKER_ASSIGNED_TRIPS_FAILED");
  }
}

export async function updateDriverTrip(req: Request, res: Response) {
  try {
    const profileId = req.user?.id ?? req.appSession?.profileId ?? null;
    if (!profileId) {
      return sendError(res, 401, "Authentication required", "TRUCKER_SESSION_REQUIRED");
    }

    const result = await updateDriverTripStatus(profileId, req.body ?? {});
    return sendSuccess(
      res,
      200,
      "Trip status updated successfully",
      result,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update trip status";
    return sendError(res, 400, message, "TRUCKER_STATUS_UPDATE_FAILED");
  }
}

export async function uploadDriverPod(req: Request, res: Response) {
  try {
    const profileId = req.user?.id ?? req.appSession?.profileId ?? null;
    if (!profileId) {
      return sendError(res, 401, "Authentication required", "TRUCKER_SESSION_REQUIRED");
    }
    if (!Buffer.isBuffer(req.body)) {
      return sendError(res, 400, "Choose a receipt image up to 5 MB.", "POD_IMAGE_REQUIRED");
    }

    let fileName = String(req.headers["x-file-name"] ?? "");
    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      return sendError(res, 400, "Invalid receipt image filename.", "POD_IMAGE_INVALID");
    }
    const tripId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tripStopId = String(req.headers["x-trip-stop-id"] ?? "").trim();
    const drNumber = String(req.headers["x-dr-number"] ?? "").trim();
    const image = await saveDriverTripReceipt(
      profileId,
      tripId ?? "",
      tripStopId,
      req.body,
      String(req.headers["content-type"] ?? ""),
      fileName,
      drNumber,
    );
    return sendSuccess(res, 201, "Delivery receipt uploaded successfully", image);
  } catch (error) {
    if (error instanceof TripImageError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    const message = error instanceof Error ? error.message : "Unable to upload delivery receipt";
    return sendError(res, 500, message, "POD_UPLOAD_FAILED");
  }
}
