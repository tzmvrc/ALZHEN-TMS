import type { Request, Response } from "express";
import { interpretTripReceipt, listTripReceipts, saveAdminReceiptText } from "../services/trip-receipt.service.js";
import { saveDriverReceiptOcr } from "../services/trucker.service.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import { decidePodReceipt, podDecisionHistory, podReviewCapabilities } from "../services/pod-review.service.js";

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
export async function reviewCapabilities(req:Request,res:Response){
  try {return sendSuccess(res,200,"POD review availability",podReviewCapabilities({profileId:req.user?.id??"",role:req.user?.role??""}));}
  catch(error){return failure(res,error);}
}
export async function reviewReceipt(req:Request,res:Response){
  try {return sendSuccess(res,200,"POD decision confirmed",await decidePodReceipt({profileId:req.user?.id??"",role:req.user?.role??""},param(req,"id"),param(req,"receiptId"),req.body??{}));}
  catch(error){return failure(res,error);}
}
export async function reviewHistory(req:Request,res:Response){
  try {return sendSuccess(res,200,"POD decision history",await podDecisionHistory({profileId:req.user?.id??"",role:req.user?.role??""},param(req,"id"),param(req,"receiptId")));}
  catch(error){return failure(res,error);}
}
export async function saveReceiptOcr(req: Request, res: Response) {
  try {
    if (!req.user?.id) throw new ApiError("Authentication required", 401);
    return sendSuccess(res, 200, "Receipt text saved", await saveAdminReceiptText(param(req, "id"), param(req, "receiptId"), req.user.id, req.body ?? {}));
  } catch (error) { return failure(res, error); }
}
export async function interpretReceipt(req: Request, res: Response) {
  try {
    if (!req.user?.id) throw new ApiError("Authentication required", 401);
    return sendSuccess(res, 200, "Interpretation requires staff review", await interpretTripReceipt(param(req, "id"), param(req, "receiptId"), {profileId:req.user.id,role:req.user.role ?? ""}, req.body ?? {}));
  } catch (error) { return failure(res, error); }
}
export async function saveDriverOcr(req: Request, res: Response) {
  try {
    if (!req.user?.id) throw new ApiError("Authentication required", 401);
    return sendSuccess(res, 200, "Receipt text processed", await saveDriverReceiptOcr(req.user.id, param(req, "id"), param(req, "stopId"), req.body ?? {}));
  } catch (error) { return failure(res, error); }
}
