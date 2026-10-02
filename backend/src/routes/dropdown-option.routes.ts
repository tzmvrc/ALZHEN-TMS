import { Router } from "express";
import {
  addDropdownOption,
  editDropdownOption,
  getDropdownOptions,
} from "../controllers/dropdown-option.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  requireAdmin,
  requireAdminOrStaff,
} from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authMiddleware, requireAdminOrStaff, getDropdownOptions);
router.post("/", authMiddleware, requireAdmin, addDropdownOption);
router.patch("/:id", authMiddleware, requireAdmin, editDropdownOption);

export default router;
