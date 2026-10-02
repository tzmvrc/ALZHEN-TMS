import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getStoreCall,
  updateStoreCall,
} from "../controllers/store-call.controller.js";

const router = Router();

router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getStoreCall);
router.patch(
  "/:id",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateStoreCall,
);

export default router;
