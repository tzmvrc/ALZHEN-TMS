import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import { listAdminChangeSignals } from "../services/admin-change.service.js";
import { readCollaborationRecord } from "../services/collaboration-record.service.js";

const router = Router();
router.get("/records/:source/:id",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res)=>{
 try {return sendSuccess(res,200,"Authoritative spreadsheet record",await readCollaborationRecord(String(req.params.source),String(req.params.id)));}
 catch(error){if(error instanceof ApiError)return sendError(res,error.statusCode,error.message,error.code);return sendError(res,503,"Record unavailable.","COLLABORATION_READ_FAILED");}
});
router.get("/changes", authMiddleware, requireRole("ADMIN", "STAFF"), async (req, res) => {
  try {
    if (!req.appSession) return sendError(res, 401, "Authentication required.", "AUTHENTICATION_REQUIRED");
    return sendSuccess(res, 200, "Authorized change signals", await listAdminChangeSignals(req.appSession));
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error.statusCode, error.message, error.code);
    return sendError(res, 503, "Change signals are temporarily unavailable.", "CHANGE_SIGNALS_UNAVAILABLE");
  }
});
export default router;
