import { Request, Response } from "express";
import {
  createDropdownOption,
  listDropdownOptions,
  updateDropdownOption,
} from "../services/dropdown-option.service.js";
import { sendError, sendSuccess } from "../utils/api-response.js";

function handleError(res: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Dropdown option request failed.";
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : message.startsWith("Unable")
        ? 500
        : 400;
  return sendError(
    res,
    statusCode,
    message,
    statusCode === 409 ? "DROPDOWN_OPTION_IN_USE" : "DROPDOWN_OPTION_FAILED",
  );
}

export async function getDropdownOptions(req: Request, res: Response) {
  try {
    const result = await listDropdownOptions(req.query.field_key);
    return sendSuccess(
      res,
      200,
      "Dropdown options retrieved successfully",
      result,
    );
  } catch (error) {
    return handleError(res, error);
  }
}

export async function addDropdownOption(req: Request, res: Response) {
  try {
    const result = await createDropdownOption(req.body ?? {});
    return sendSuccess(res, 201, "Dropdown option added successfully", result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function editDropdownOption(req: Request, res: Response) {
  try {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : (req.params.id ?? "");
    const result = await updateDropdownOption(id, req.body ?? {});
    return sendSuccess(
      res,
      200,
      "Dropdown option updated successfully",
      result,
    );
  } catch (error) {
    return handleError(res, error);
  }
}
