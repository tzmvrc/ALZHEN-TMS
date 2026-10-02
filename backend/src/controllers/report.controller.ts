import { Request, Response } from "express";
import {
  getCombinedReport as getCombinedReportData,
  getDispatchMonitoringReport as getDispatchMonitoringReportData,
  getDispatchReport as getDispatchReportData,
  getPodDriveFilesReport as getPodDriveFilesReportData,
  getPodStatusReport as getPodStatusReportData,
  getReportColumns,
  getStoreCallingReport as getStoreCallingReportData,
  getTripBookingReport as getTripBookingReportData,
  getTripExceptionsReport as getTripExceptionsReportData,
} from "../services/report.service.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";

function handleReportError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  defaultCode = "REPORT_QUERY_FAILED",
) {
  if (error instanceof ApiError) {
    return sendError(res, error.statusCode, error.message, error.code);
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  return sendError(res, 400, message, defaultCode);
}

export async function getCombinedReport(req: Request, res: Response) {
  try {
    const result = await getCombinedReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Combined report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(res, error, "Unable to fetch combined report");
  }
}

export async function getDispatchReport(req: Request, res: Response) {
  try {
    const result = await getDispatchReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Dispatch report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(res, error, "Unable to fetch dispatch report");
  }
}

export async function getDispatchMonitoringReport(req: Request, res: Response) {
  try {
    const result = await getDispatchMonitoringReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Dispatch monitoring report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(
      res,
      error,
      "Unable to fetch dispatch monitoring report",
    );
  }
}

export async function getTripBookingReport(req: Request, res: Response) {
  try {
    const result = await getTripBookingReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Trip booking report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(res, error, "Unable to fetch trip booking report");
  }
}

export async function getStoreCallingReport(req: Request, res: Response) {
  try {
    const result = await getStoreCallingReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Store calling report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(
      res,
      error,
      "Unable to fetch store calling report",
    );
  }
}

export async function getPodStatusReport(req: Request, res: Response) {
  try {
    const result = await getPodStatusReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "POD status report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(res, error, "Unable to fetch POD status report");
  }
}

export async function getPodDriveFilesReport(req: Request, res: Response) {
  try {
    const result = await getPodDriveFilesReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "POD Drive files report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(
      res,
      error,
      "Unable to fetch POD Drive files report",
    );
  }
}

export async function getTripExceptionsReport(req: Request, res: Response) {
  try {
    const result = await getTripExceptionsReportData(
      req.query as Record<string, unknown>,
    );
    return sendSuccess(
      res,
      200,
      "Trip exceptions report retrieved successfully",
      result,
    );
  } catch (error) {
    return handleReportError(
      res,
      error,
      "Unable to fetch trip exceptions report",
    );
  }
}

export async function getReportColumnsByKey(req: Request, res: Response) {
  try {
    const reportKey = Array.isArray(req.params.reportKey)
      ? req.params.reportKey[0]
      : (req.params.reportKey ?? "");
    const result = await getReportColumns(reportKey);
    return sendSuccess(
      res,
      200,
      "Report columns retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch report columns";
    return sendError(res, 404, message, "REPORT_NOT_FOUND");
  }
}
