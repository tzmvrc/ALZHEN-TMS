import userWorkspaceRoutes from "./user-workspace.routes.js";
import deviceSessionRoutes from './device-session.routes.js';
import { Router } from "express";
import express from "express";

import { createUser, listUsers, setProfilePicture, updateUser } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

const router = Router();
router.use(userWorkspaceRoutes);
router.use(deviceSessionRoutes);

router.post("/", authMiddleware, requireAdmin, createUser);
router.get("/", authMiddleware, requireAdmin, listUsers);
router.patch("/:id", authMiddleware, requireAdmin, updateUser);
router.post("/:id/profile-picture", authMiddleware, requireAdmin, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), setProfilePicture);

export default router;
