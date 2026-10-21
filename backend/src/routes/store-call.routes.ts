import {recordDeletionCapabilities,deletePhysicalRecord} from "../services/record-deletion.service.js";
import {sendSuccess} from "../utils/api-response.js";
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getStoreCall,
  updateStoreCall,
} from "../controllers/store-call.controller.js";

const router = Router();

router.get("/deletion-capabilities",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Record deletion capabilities",await recordDeletionCapabilities({id:req.user!.id,role:req.profile!.role}));}catch(error){next(error);}});
router.delete("/:id",authMiddleware,requireRole("ADMIN","STAFF"),async(req,res,next)=>{try{return sendSuccess(res,200,"Store call deleted",await deletePhysicalRecord({id:req.user!.id,role:req.profile!.role},"store_calls",String(req.params.id),req.body?.expected_version));}catch(error){next(error);}});
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getStoreCall);
router.patch(
  "/:id",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateStoreCall,
);

export default router;
