import { Router } from "express";
import { getTrucker, listTruckers } from "../controllers/trucker.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listTruckers);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getTrucker);

export default router;
