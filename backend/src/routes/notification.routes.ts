import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { getNotifications, readAllNotifications, readNotification } from "../controllers/notification.controller.js";

const router = Router();
// Every controller derives the recipient from auth; no client recipient parameter.
router.get("/", authMiddleware, requireRole("ADMIN","STAFF","TRUCKER"), getNotifications);
router.patch("/read-all", authMiddleware, requireRole("ADMIN","STAFF","TRUCKER"), readAllNotifications);
router.patch("/:id/read", authMiddleware, requireRole("ADMIN","STAFF","TRUCKER"), readNotification);
export default router;
