import { ApiError } from "../utils/api-response.js";
import type { FlexInputMode, FlexValueType, FlexBindingScope } from "../types/flexible-table.types.js";

export const FLEX_VALUE_TYPES: readonly FlexValueType[] = ["TEXT", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
export const FLEX_INPUT_MODES: readonly FlexInputMode[] = ["TEXT", "DROPDOWN", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
export const FLEX_BINDING_SCOPES: readonly FlexBindingScope[] = ["CUSTOM_ROW", "TRIP", "STOP", "LINE_ITEM", "ASSIGNMENT", "BILLING", "STORE_CALL"];
export const FLEX_REPORT_KEYS = ["combined_report", "dispatch_monitoring", "dispatch_report", "trip_booking", "store_calling"] as const;
export const FLEX_SECTION_KEYS = [...FLEX_REPORT_KEYS, "fleet"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function badRequest(message: string, code = "INVALID_FLEX_TABLE_INPUT"): never {
  throw new ApiError(message, 400, code);
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) badRequest(`${field} must be a valid UUID.`, "INVALID_ID");
  return value;
}

export function requireSectionKey(value: unknown): (typeof FLEX_SECTION_KEYS)[number] {
  if (typeof value !== "string" || !FLEX_SECTION_KEYS.includes(value as (typeof FLEX_SECTION_KEYS)[number])) {
    badRequest("Unsupported flexible-table section.", "INVALID_FLEX_SECTION");
  }
  return value as (typeof FLEX_SECTION_KEYS)[number];
}

export function readSectionConnections(settingsValue: unknown): string[] {
  const settings = validateSettings(settingsValue);
  const connections = settings.section_connections;
  if (connections === undefined) return [];
  if (!Array.isArray(connections) || connections.some((key) => typeof key !== "string" || !FLEX_SECTION_KEYS.includes(key as (typeof FLEX_SECTION_KEYS)[number]))) {
    throw new ApiError("This table has invalid section connection settings.", 409, "INVALID_SECTION_CONNECTION_SETTINGS");
  }
  if (new Set(connections).size !== connections.length) {
    throw new ApiError("This table has duplicate section connection settings.", 409, "INVALID_SECTION_CONNECTION_SETTINGS");
  }
  return connections;
}

export function requireName(value: unknown, field = "name"): string {
  if (typeof value !== "string") badRequest(`${field} must be text.`);
  const name = value.trim();
  if (!name || name.length > 100) badRequest(`${field} must be 1–100 characters.`);
  return name;
}

export function requireVersion(value: unknown, field = "expected_version"): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) badRequest(`${field} must be a positive integer.`);
  return Number(value);
}

export function requireCellVersion(value: unknown, field = "expected_version"): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) badRequest(`${field} must be a non-negative integer.`);
  return Number(value);
}

export function validateSettings(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) badRequest("settings must be a JSON object.");
  return value as Record<string, unknown>;
}

export function validateColumnConfiguration(input: Record<string, unknown>) {
  const name = requireName(input.name);
  const valueType = input.value_type ?? "TEXT";
  const inputMode = input.input_mode ?? "TEXT";
  const bindingScope = input.binding_scope ?? "CUSTOM_ROW";
  if (!FLEX_VALUE_TYPES.includes(valueType as FlexValueType)) badRequest("Unsupported column value_type.");
  if (!FLEX_INPUT_MODES.includes(inputMode as FlexInputMode)) badRequest("Unsupported column input_mode.");
  if (!FLEX_BINDING_SCOPES.includes(bindingScope as FlexBindingScope)) badRequest("Unsupported column binding_scope.");
  if (inputMode === "DROPDOWN" && valueType !== "TEXT") badRequest("Dropdown columns must use TEXT values.");
  if (inputMode === "NUMBER" && valueType !== "NUMBER") badRequest("NUMBER input mode requires NUMBER value_type.");
  if (inputMode === "DATE" && valueType !== "DATE") badRequest("DATE input mode requires DATE value_type.");
  if (inputMode === "DATETIME" && valueType !== "DATETIME") badRequest("DATETIME input mode requires DATETIME value_type.");
  if (inputMode === "BOOLEAN" && valueType !== "BOOLEAN") badRequest("BOOLEAN input mode requires BOOLEAN value_type.");
  return {
    name,
    value_type: valueType as FlexValueType,
    input_mode: inputMode as FlexInputMode,
    binding_scope: bindingScope as FlexBindingScope,
    settings: validateSettings(input.settings),
  };
}

export function validateCellValue(value: unknown, valueType: FlexValueType): unknown {
  if (value === null || value === "") return null;
  switch (valueType) {
    case "TEXT":
      if (typeof value !== "string" || value.length > 10_000) badRequest("Cell value must be text up to 10,000 characters.");
      return value;
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) badRequest("Cell value must be a finite number.");
      return value;
    case "BOOLEAN":
      if (typeof value !== "boolean") badRequest("Cell value must be true or false.");
      return value;
    case "DATE":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) badRequest("Cell value must be a valid YYYY-MM-DD date.");
      return value;
    case "DATETIME":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || Number.isNaN(Date.parse(value))) badRequest("Cell value must be a valid datetime.");
      return value;
  }
}

export function permissionFlags(input: Record<string, unknown>) {
  const canView = input.can_view === true;
  const canEdit = input.can_edit === true;
  const canManage = input.can_manage === true;
  if ((input.can_view !== undefined && typeof input.can_view !== "boolean") || (input.can_edit !== undefined && typeof input.can_edit !== "boolean") || (input.can_manage !== undefined && typeof input.can_manage !== "boolean")) badRequest("Permission flags must be booleans.");
  if (canEdit && !canView) badRequest("Edit permission requires view permission.");
  if (canManage && !canEdit) badRequest("Manage permission requires edit permission.");
  return { can_view: canView, can_edit: canEdit, can_manage: canManage };
}
