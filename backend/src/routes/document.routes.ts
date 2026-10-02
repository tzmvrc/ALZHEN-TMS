import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  verifyDocument,
} from "../controllers/document.controller.js";

const router = Router();

router.get("/", authMiddleware, requireRole("ADMIN", "STAFF"), listDocuments);
router.get("/:id", authMiddleware, requireRole("ADMIN", "STAFF"), getDocument);
router.post("/", authMiddleware, requireRole("ADMIN", "STAFF"), createDocument);
router.patch(
  "/:id",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  updateDocument,
);
router.patch(
  "/:id/verify",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  verifyDocument,
);

export default router;
