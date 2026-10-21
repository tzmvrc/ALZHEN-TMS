import type { Request, Response } from "express";
import { previewTripImport, commitTripImport } from "../services/trip-import.service.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import { rememberImportBatchError } from "../services/trip-import-recovery.service.js";

export async function previewImport(req: Request, res: Response) {
  try { return sendSuccess(res, 200, "Import preview ready", await previewTripImport(req.body?.files)); }
  catch (error) { return failure(res, error); }
}
export async function commitImport(req: Request, res: Response) {
  try { return sendSuccess(res, 200, "Import chunk processed", await commitTripImport(req.body, req.profile?.id ?? req.user!.id)); }
  catch (error) { await rememberImportBatchError(req.profile?.id ?? req.user!.id,req.body?.batch_id,error);return failure(res, error); }
}
function failure(res: Response, error: unknown) {
  return sendError(res, error instanceof ApiError ? error.statusCode : 500, error instanceof Error ? error.message : "Import failed. Retry using the same batch.", error instanceof ApiError ? error.code : "TRIP_IMPORT_FAILED");
}
