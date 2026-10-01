import { Request, Response } from "express";
import { getTruckerById, getTruckerList } from "../services/trucker.service.js";
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
