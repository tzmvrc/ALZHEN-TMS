import { Request, Response } from "express";
import { getReportColumns, getReportData } from "../services/report.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

export async function getCombinedReport(req: Request, res: Response) {
  try {
    const result = await getReportData(
      "combined",
      req.query as Record<string, string>,
    );
    return sendSuccess(
      res,
      200,
      "Combined report retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch combined report";
    const code =
      message === "Report not found"
        ? "REPORT_NOT_FOUND"
        : "REPORT_QUERY_FAILED";
    return sendError(
      res,
      message === "Report not found" ? 404 : 400,
      message,
      code,
    );
  }
}

export async function getDispatchMonitoringReport(req: Request, res: Response) {
  try {
    const result = await getReportData(
      "dispatch-monitoring",
      req.query as Record<string, string>,
    );
    return sendSuccess(
      res,
      200,
      "Dispatch monitoring report retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch dispatch monitoring report";
    const code =
      message === "Report not found"
        ? "REPORT_NOT_FOUND"
        : "REPORT_QUERY_FAILED";
    return sendError(
      res,
      message === "Report not found" ? 404 : 400,
      message,
      code,
    );
  }
}

export async function getDispatchReport(req: Request, res: Response) {
  try {
    const result = await getReportData(
      "dispatch",
      req.query as Record<string, string>,
    );
    return sendSuccess(
      res,
      200,
      "Dispatch report retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch dispatch report";
    const code =
      message === "Report not found"
        ? "REPORT_NOT_FOUND"
        : "REPORT_QUERY_FAILED";
    return sendError(
      res,
      message === "Report not found" ? 404 : 400,
      message,
      code,
    );
  }
}

export async function getTripBookingReport(req: Request, res: Response) {
  try {
    const result = await getReportData(
      "trip-booking",
      req.query as Record<string, string>,
    );
    return sendSuccess(
      res,
      200,
      "Trip booking report retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch trip booking report";
    const code =
      message === "Report not found"
        ? "REPORT_NOT_FOUND"
        : "REPORT_QUERY_FAILED";
    return sendError(
      res,
      message === "Report not found" ? 404 : 400,
      message,
      code,
    );
  }
}

export async function getStoreCallingReport(req: Request, res: Response) {
  try {
    const result = await getReportData(
      "store-calling",
      req.query as Record<string, string>,
    );
    return sendSuccess(
      res,
      200,
      "Store calling report retrieved successfully",
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to fetch store calling report";
    const code =
      message === "Report not found"
        ? "REPORT_NOT_FOUND"
        : "REPORT_QUERY_FAILED";
    return sendError(
      res,
      message === "Report not found" ? 404 : 400,
      message,
      code,
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
