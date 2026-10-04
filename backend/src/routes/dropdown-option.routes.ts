import { Router } from "express";
import {
  addDropdownOption,
  editDropdownOption,
  getDropdownOptions,
} from "../controllers/dropdown-option.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  requireAdminOrStaff,
} from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authMiddleware, requireAdminOrStaff, getDropdownOptions);
router.post("/", authMiddleware, requireAdminOrStaff, addDropdownOption);
router.patch("/:id", authMiddleware, requireAdminOrStaff, editDropdownOption);

export default router;
