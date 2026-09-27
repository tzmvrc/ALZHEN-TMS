import { Request, Response } from "express";
import {
  DATABASE_SOURCES,
  getDatabaseSourcePage,
} from "../services/database-browser.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

export function listDatabaseSources(_req: Request, res: Response) {
  return sendSuccess(
    res,
    200,
    "Database sources retrieved successfully",
    DATABASE_SOURCES.map(({ name, label, kind }) => ({ name, label, kind })),
  );
}

export async function getDatabaseSourceRows(req: Request, res: Response) {
  try {
    const source = Array.isArray(req.params.source)
      ? req.params.source[0]
      : (req.params.source ?? "");
    const result = await getDatabaseSourcePage(
      source,
      req.query.page,
      req.query.limit,
    );
    return sendSuccess(res, 200, "Database rows retrieved successfully", result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read database source";
    const isMissing = message === "Database source not found";
    const isInputError = message.startsWith("page ") || message.startsWith("limit ");
    return sendError(
      res,
      isMissing ? 404 : isInputError ? 400 : 500,
      message,
      isMissing ? "DATABASE_SOURCE_NOT_FOUND" : "DATABASE_READ_FAILED",
    );
  }
}