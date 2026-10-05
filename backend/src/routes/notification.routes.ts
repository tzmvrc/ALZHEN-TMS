import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { getNotifications, readAllNotifications, readNotification } from "../controllers/notification.controller.js";

const router = Router();
router.get("/", authMiddleware, requireAdmin, getNotifications);
router.patch("/read-all", authMiddleware, requireAdmin, readAllNotifications);
router.patch("/:id/read", authMiddleware, requireAdmin, readNotification);
export default router;
