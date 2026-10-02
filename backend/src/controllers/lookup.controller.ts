import { Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/api-response.js";
import {
  getCustomers,
  getDrivers,
  getEligibleAssignees,
  getIncidentReasons,
  getProducts,
  getProfiles,
  getStores,
  getStoreContacts,
  getTripTypes,
  getTrucks,
  getTruckingCompanies,
  getWarehouses,
} from "../services/lookup.service.js";

function normalizeQuery(req: Request) {
  return req.query as Record<string, string | undefined>;
}

export async function getTripTypeLookup(req: Request, res: Response) {
  try {
    const data = await getTripTypes(normalizeQuery(req));
    return sendSuccess(res, 200, "Trip types retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trip types";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getWarehouseLookup(req: Request, res: Response) {
  try {
    const data = await getWarehouses(normalizeQuery(req));
    return sendSuccess(res, 200, "Warehouses retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch warehouses";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getCustomerLookup(req: Request, res: Response) {
  try {
    const data = await getCustomers(normalizeQuery(req));
    return sendSuccess(res, 200, "Customers retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch customers";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getStoreLookup(req: Request, res: Response) {
  try {
    const data = await getStores(normalizeQuery(req));
    return sendSuccess(res, 200, "Stores retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch stores";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getProductLookup(req: Request, res: Response) {
  try {
    const data = await getProducts(normalizeQuery(req));
    return sendSuccess(res, 200, "Products retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch products";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getDriverLookup(req: Request, res: Response) {
  try {
    const data = await getDrivers(normalizeQuery(req));
    return sendSuccess(res, 200, "Drivers retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch drivers";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getTruckLookup(req: Request, res: Response) {
  try {
    const data = await getTrucks(normalizeQuery(req));
    return sendSuccess(res, 200, "Trucks retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch trucks";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getTruckingCompanyLookup(req: Request, res: Response) {
  try {
    const data = await getTruckingCompanies(normalizeQuery(req));
    return sendSuccess(
      res,
      200,
      "Trucking companies retrieved successfully",
      data,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch trucking companies";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getProfileLookup(req: Request, res: Response) {
  try {
    const data = await getProfiles(normalizeQuery(req));
    return sendSuccess(res, 200, "Profiles retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch profiles";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getEligibleAssigneeLookup(req: Request, res: Response) {
  try {
    const data = await getEligibleAssignees(normalizeQuery(req));
    return sendSuccess(
      res,
      200,
      "Eligible assignees retrieved successfully",
      data,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch eligible assignees";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getStoreContactLookup(req: Request, res: Response) {
  try {
    const data = await getStoreContacts(normalizeQuery(req));
    return sendSuccess(res, 200, "Store contacts retrieved successfully", data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch store contacts";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}

export async function getIncidentReasonLookup(req: Request, res: Response) {
  try {
    const data = await getIncidentReasons(normalizeQuery(req));
    return sendSuccess(
      res,
      200,
      "Incident reasons retrieved successfully",
      data,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch incident reasons";
    return sendError(res, 500, message, "LOOKUP_QUERY_FAILED");
  }
}
