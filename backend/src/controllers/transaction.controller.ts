import type { Request, Response } from "express";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import { setTransactionArchive, updateTransactionReference } from "../services/transaction.service.js";

const param = (req: Request, key: string) => Array.isArray(req.params[key]) ? req.params[key][0] : req.params[key];
async function respond(req: Request, res: Response, archive: boolean) {
  try {
    if (!req.appSession) throw new ApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    const actor = { id: req.appSession.profileId, role: req.appSession.role };
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Provide a JSON object.", 400, "INVALID_BODY");
    if (archive && Object.keys(body).some((key) => !["trip_stop_id", "archived"].includes(key))) throw new ApiError("Provide trip_stop_id and archived only.", 400, "INVALID_BODY");
    const result = archive
      ? await setTransactionArchive(actor, param(req, "id"), body.trip_stop_id, body.archived)
      : await updateTransactionReference(actor, param(req, "id"), param(req, "stopId"), body);
    return sendSuccess(res, 200, archive ? "Transaction archive status saved" : "Transmittal reference saved", result);
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error.statusCode, error.message, error.code);
    return sendError(res, 400, error instanceof Error ? error.message : "Unable to save transaction.", "TRANSACTION_SAVE_FAILED");
  }
}
export const archiveTransaction = (req: Request, res: Response) => respond(req, res, true);
export const saveTransactionReference = (req: Request, res: Response) => respond(req, res, false);
