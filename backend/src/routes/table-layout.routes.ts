import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";
import { getSharedWidths, saveSharedWidth } from "../services/table-layout.service.js";
import { getSharedDesign,saveSharedDesign } from "../services/table-design.service.js";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN", "STAFF"));
router.get("/:table/design",async(req,res)=>{try{return sendSuccess(res,200,"Shared design loaded",await getSharedDesign({profileId:req.appSession!.profileId,role:req.appSession!.role},String(req.params.table)));}catch(error){return sendError(res,error instanceof ApiError?error.statusCode:500,error instanceof Error?error.message:"Design unavailable",error instanceof ApiError?error.code:"SHARED_DESIGN_UNAVAILABLE");}});
router.patch("/:table/design/:column",async(req,res)=>{try{return sendSuccess(res,200,"Shared design saved",await saveSharedDesign({profileId:req.appSession!.profileId,role:req.appSession!.role},String(req.params.table),String(req.params.column),req.body??{}));}catch(error){return sendError(res,error instanceof ApiError?error.statusCode:500,error instanceof Error?error.message:"Design unavailable",error instanceof ApiError?error.code:"SHARED_DESIGN_UNAVAILABLE");}});
router.get("/:table", async (req, res) => {
  try { return sendSuccess(res, 200, "Shared widths loaded", await getSharedWidths({ profileId: req.appSession!.profileId, role: req.appSession!.role.toUpperCase() }, String(req.params.table))); }
  catch (error) { return sendError(res, error instanceof ApiError ? error.statusCode : 500, error instanceof ApiError ? error.message : "Unable to load layout", error instanceof ApiError ? error.code : "LAYOUT_FAILED"); }
});
router.patch("/:table/:column", async (req, res) => {
  try { return sendSuccess(res, 200, "Shared width saved", await saveSharedWidth({ profileId: req.appSession!.profileId, role: req.appSession!.role.toUpperCase() }, String(req.params.table), String(req.params.column), req.body ?? {})); }
  catch (error) { return sendError(res, error instanceof ApiError ? error.statusCode : 500, error instanceof ApiError ? error.message : "Unable to save layout", error instanceof ApiError ? error.code : "LAYOUT_FAILED"); }
});
export default router;
