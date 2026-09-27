import { Router } from "express";
import {
  getDatabaseSourceRows,
  listDatabaseSources,
} from "../controllers/database-browser.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware, requireAdmin);
router.get("/sources", listDatabaseSources);
router.get("/sources/:source", getDatabaseSourceRows);

export default router;