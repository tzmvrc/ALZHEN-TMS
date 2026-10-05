import { Router } from "express";
import { listCalendarEvents } from "../controllers/calendar.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrStaff } from "../middleware/role.middleware.js";

const router = Router();
router.get("/events", authMiddleware, requireAdminOrStaff, listCalendarEvents);
export default router;
