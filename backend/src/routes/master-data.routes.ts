import { Router } from "express";
import express from "express";
import { create, list, listImages, removeImage, update, uploadImage } from "../controllers/master-data.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrStaff } from "../middleware/role.middleware.js";

const router = Router();
router.use(authMiddleware, requireAdminOrStaff);
router.get("/trucks/:truckId/images", listImages);
router.post("/trucks/:truckId/images", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), uploadImage);
router.delete("/trucks/:truckId/images/:imageId", removeImage);
router.get("/:resource", list);
router.post("/:resource", create);
router.patch("/:resource/:id", update);
export default router;
