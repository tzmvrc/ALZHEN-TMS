import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireAdminOrStaff } from "../middleware/role.middleware.js";
import * as controller from "../controllers/flexible-table.controller.js";

const router = Router();
router.use(authMiddleware, requireAdminOrStaff);

router.get("/", controller.listTables);
router.post("/", controller.createTable);
router.get("/sections/:sectionKey/tables", controller.listSectionTables);
router.post("/sections/:sectionKey/tables", controller.connectSectionTable);
router.delete("/sections/:sectionKey/tables/:tableId", controller.disconnectSectionTable);
router.get("/:tableId", controller.getTable);
router.patch("/:tableId", controller.updateTable);
router.patch("/:tableId/archive", controller.archiveTable);
router.get("/:tableId/audit", controller.getAudit);

router.post("/:tableId/columns", controller.createColumn);
router.patch("/:tableId/columns/:columnId", controller.updateColumn);
router.delete("/:tableId/columns/:columnId", controller.archiveColumn);

router.post("/:tableId/rows", controller.createRow);
router.patch("/:tableId/rows/:rowId", controller.updateRow);
router.delete("/:tableId/rows/:rowId", controller.archiveRow);
router.patch("/:tableId/rows/:rowId/cells/:columnId", controller.updateCell);

router.get("/:tableId/columns/:columnId/options", controller.listOptions);
router.post("/:tableId/columns/:columnId/options", controller.createOption);
router.patch("/:tableId/columns/:columnId/options/:optionId", controller.updateOption);

router.get("/:tableId/permissions", controller.listPermissions);
router.post("/:tableId/permissions", controller.createPermission);
router.patch("/:tableId/permissions/:permissionId", controller.updatePermission);
router.delete("/:tableId/permissions/:permissionId", controller.deletePermission);

export default router;
