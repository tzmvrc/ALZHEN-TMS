import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getCustomerLookup,
  getDriverLookup,
  getEligibleAssigneeLookup,
  getIncidentReasonLookup,
  getProductLookup,
  getProfileLookup,
  getStoreContactLookup,
  getStoreLookup,
  getTripTypeLookup,
  getTruckLookup,
  getTruckingCompanyLookup,
  getWarehouseLookup,
} from "../controllers/lookup.controller.js";

const router = Router();

router.get(
  "/assignees",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getEligibleAssigneeLookup,
);
router.get(
  "/trip-types",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTripTypeLookup,
);
router.get(
  "/warehouses",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getWarehouseLookup,
);
router.get(
  "/customers",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getCustomerLookup,
);
router.get(
  "/stores",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getStoreLookup,
);
router.get(
  "/products",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getProductLookup,
);
router.get(
  "/drivers",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getDriverLookup,
);
router.get(
  "/trucks",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTruckLookup,
);
router.get(
  "/trucking-companies",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getTruckingCompanyLookup,
);
router.get(
  "/profiles",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getProfileLookup,
);
router.get(
  "/store-contacts",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getStoreContactLookup,
);
router.get(
  "/incident-reasons",
  authMiddleware,
  requireRole("ADMIN", "STAFF"),
  getIncidentReasonLookup,
);

export default router;
