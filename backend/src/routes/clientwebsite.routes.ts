import express, { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import * as controller from "../controllers/clientwebsite.controller.js";
const router = Router();
router.post(
  "/media",
  authMiddleware,
  requireAdmin,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "5mb",
  }),
  controller.upload,
);
router.get("/manage/:collection", authMiddleware, requireAdmin, controller.listAdmin);
router.get("/:collection", controller.list);
router.post("/:collection", authMiddleware, requireAdmin, controller.save);
router.put("/:collection/:id", authMiddleware, requireAdmin, controller.save);
router.delete(
  "/:collection/:id",
  authMiddleware,
  requireAdmin,
  controller.remove,
);
router.use(
  (
    err: { type?: string },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err.type === "entity.too.large") {
      res
        .status(413)
        .json({ error: "Image is too large. Maximum size is 5 MB." });
      return;
    }
    next(err);
  },
);
export default router;
