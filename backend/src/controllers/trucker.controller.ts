import { Request, Response } from "express";
import {
  getDriverAssignedTrips,
  getTruckerById,
  getTruckerList,
} from "../services/trucker.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

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

/** Older clients must reload rather than write trip-wide milestones without assignment ownership. */
export async function updateDriverTrip(_req: Request,res: Response){return sendError(res,409,"Reload My trips to use the assignment-specific delivery workflow.","DELIVERY_WORKFLOW_REQUIRED");}
export async function uploadDriverPod(_req: Request,res: Response){return sendError(res,409,"Reload My trips and use Upload POD. Receipt upload no longer completes a delivery automatically.","DELIVERY_WORKFLOW_REQUIRED");}
