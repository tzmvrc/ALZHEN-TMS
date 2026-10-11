import type { Request, Response } from "express";
import * as service from "../services/flexible-table.service.js";
import { ApiError, sendError, sendSuccess } from "../utils/api-response.js";

function actorFromRequest(req: Request) {
  if (!req.profile || !req.user) throw new ApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return { id: req.profile.id, role: String(req.profile.role).toUpperCase() };
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new ApiError("Request body must be a JSON object.", 400, "INVALID_BODY");
  return req.body as Record<string, unknown>;
}

function requestId(req: Request) {
  const value = req.header("x-request-id");
  return value && value.length <= 100 ? value : undefined;
}

async function respond(res: Response, message: string, operation: () => Promise<unknown>, status: number | ((result: unknown) => number) = 200) {
  try {
    const result = await operation();
    return sendSuccess(res, typeof status === "function" ? status(result) : status, message, result);
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error.statusCode, error.message, error.code);
    console.error("Flexible table request failed:", error);
    return sendError(res, 500, "Unable to complete the flexible table request.", "FLEX_TABLE_INTERNAL_ERROR");
  }
}

export const listTables = (req: Request, res: Response) => respond(res, "Flexible tables retrieved successfully", () => service.listTables(actorFromRequest(req)));
export const createTable = (req: Request, res: Response) => respond(res, "Flexible table created successfully", () => service.createTable(actorFromRequest(req), body(req), requestId(req)), 201);
export const getTable = (req: Request, res: Response) => respond(res, "Flexible table retrieved successfully", () => service.getTable(actorFromRequest(req), param(req, "tableId")));
export const updateTable = (req: Request, res: Response) => respond(res, "Flexible table updated successfully", () => service.updateTable(actorFromRequest(req), param(req, "tableId"), body(req), requestId(req)));
export const archiveTable = (req: Request, res: Response) => respond(res, "Flexible table archived successfully", () => service.archiveTable(actorFromRequest(req), param(req, "tableId"), body(req), requestId(req)));
export const createColumn = (req: Request, res: Response) => respond(res, "Column created successfully", () => service.createColumn(actorFromRequest(req), param(req, "tableId"), body(req), requestId(req)), 201);
export const updateColumn = (req: Request, res: Response) => respond(res, "Column updated successfully", () => service.updateColumn(actorFromRequest(req), param(req, "tableId"), param(req, "columnId"), body(req), requestId(req)));
export const archiveColumn = (req: Request, res: Response) => respond(res, "Column archived successfully", () => service.archiveColumn(actorFromRequest(req), param(req, "tableId"), param(req, "columnId"), body(req), requestId(req)));
export const createRow = (req: Request, res: Response) => respond(res, "Row created successfully", () => service.createRow(actorFromRequest(req), param(req, "tableId"), body(req), requestId(req)), 201);
export const updateRow = (req: Request, res: Response) => respond(res, "Row updated successfully", () => service.updateRow(actorFromRequest(req), param(req, "tableId"), param(req, "rowId"), body(req), requestId(req)));
export const archiveRow = (req: Request, res: Response) => respond(res, "Row archived successfully", () => service.archiveRow(actorFromRequest(req), param(req, "tableId"), param(req, "rowId"), body(req), requestId(req)));
export const updateCell = (req: Request, res: Response) => respond(res, "Cell saved successfully", () => service.updateCell(actorFromRequest(req), param(req, "tableId"), param(req, "rowId"), param(req, "columnId"), body(req), requestId(req)));
export const listPermissions = (req: Request, res: Response) => respond(res, "Table permissions retrieved successfully", () => service.listPermissions(actorFromRequest(req), param(req, "tableId")));
export const createPermission = (req: Request, res: Response) => respond(res, "Table permission created successfully", () => service.createPermission(actorFromRequest(req), param(req, "tableId"), body(req), requestId(req)), 201);
export const updatePermission = (req: Request, res: Response) => respond(res, "Table permission updated successfully", () => service.updatePermission(actorFromRequest(req), param(req, "tableId"), param(req, "permissionId"), body(req), requestId(req)));
export const deletePermission = (req: Request, res: Response) => respond(res, "Table permission removed successfully", () => service.deletePermission(actorFromRequest(req), param(req, "tableId"), param(req, "permissionId"), requestId(req)));
export const listOptions = (req: Request, res: Response) => respond(res, "Dropdown options retrieved successfully", () => service.listOptions(actorFromRequest(req), param(req, "tableId"), param(req, "columnId")));
export const createOption = (req: Request, res: Response) => respond(res, "Dropdown option created successfully", () => service.createOption(actorFromRequest(req), param(req, "tableId"), param(req, "columnId"), body(req), requestId(req)), 201);
export const updateOption = (req: Request, res: Response) => respond(res, "Dropdown option updated successfully", () => service.updateOption(actorFromRequest(req), param(req, "tableId"), param(req, "columnId"), param(req, "optionId"), body(req), requestId(req)));
export const getAudit = (req: Request, res: Response) => respond(res, "Flexible table audit history retrieved successfully", () => service.getTableAudit(actorFromRequest(req), param(req, "tableId"), req.query.limit));
export const listSectionTables = (req: Request, res: Response) => respond(res, "Section flexible tables retrieved successfully", () => service.listSectionTables(actorFromRequest(req), param(req, "sectionKey")));
export const connectSectionTable = (req: Request, res: Response) => respond(res, "Flexible table connected to section successfully", () => {
  const requestBody = body(req);
  if (Object.keys(requestBody).some((key) => key !== "table_id")) throw new ApiError("Only table_id is accepted.", 400, "INVALID_FLEX_TABLE_INPUT");
  return service.setSectionTableConnection(actorFromRequest(req), param(req, "sectionKey"), requestBody.table_id, true, requestId(req));
});
export const disconnectSectionTable = (req: Request, res: Response) => respond(res, "Flexible table disconnected from section successfully", () => service.setSectionTableConnection(actorFromRequest(req), param(req, "sectionKey"), param(req, "tableId"), false, requestId(req)));
