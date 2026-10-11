import { Router } from "express";

import {
  bootstrapSession,
  login,
  logout,
  me,
  sessionHeartbeat,
} from "../controllers/auth.controller.js";
import {
  authMiddleware,
  authMiddlewareSkipSessionValidation,
} from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post(
  "/session/bootstrap",
  authMiddleware,
  bootstrapSession,
);
router.post("/logout", authMiddlewareSkipSessionValidation, logout);
router.post("/session/heartbeat", authMiddleware, sessionHeartbeat);
router.get("/me", authMiddleware, me);

export default router;
