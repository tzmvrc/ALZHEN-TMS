import type { Request, Response } from "express";
import { listTripReceipts, saveAdminReceiptText } from "../services/trip-receipt.service.js";
import { saveDriverReceiptOcr } from "../services/trucker.service.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";

const param = (req: Request, name: string) => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};
function failure(res: Response, error: unknown) {
  return sendError(res, error instanceof ApiError ? error.statusCode : 400,
    error instanceof Error ? error.message : "Unable to process receipt.",
    error instanceof ApiError ? error.code : "RECEIPT_REQUEST_FAILED");
}
export async function listReceipts(req: Request, res: Response) {
  try { return sendSuccess(res, 200, "Receipts retrieved", await listTripReceipts(param(req, "id"))); }
  catch (error) { return failure(res, error); }
}
export async function saveReceiptOcr(req: Request, res: Response) {
  try {
    if (!req.user?.id) throw new ApiError("Authentication required", 401);
    return sendSuccess(res, 200, "Receipt text saved", await saveAdminReceiptText(param(req, "id"), param(req, "receiptId"), req.user.id, req.body ?? {}));
  } catch (error) { return failure(res, error); }
}
export async function saveDriverOcr(req: Request, res: Response) {
  try {
    if (!req.user?.id) throw new ApiError("Authentication required", 401);
    return sendSuccess(res, 200, "Receipt text processed", await saveDriverReceiptOcr(req.user.id, param(req, "id"), param(req, "stopId"), req.body ?? {}));
  } catch (error) { return failure(res, error); }
}
