import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrStaff } from "../middleware/role.middleware.js";
import { getNotifications, readAllNotifications, readNotification } from "../controllers/notification.controller.js";

const router = Router();
router.get("/", authMiddleware, requireAdminOrStaff, getNotifications);
router.patch("/read-all", authMiddleware, requireAdminOrStaff, readAllNotifications);
router.patch("/:id/read", authMiddleware, requireAdminOrStaff, readNotification);
export default router;
