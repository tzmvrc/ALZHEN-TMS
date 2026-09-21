import { Router } from "express";

import { createUser } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

const router = Router();

router.post("/", authMiddleware, requireAdmin, createUser);

export default router;
