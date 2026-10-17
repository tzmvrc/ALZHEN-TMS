import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import type { FlexActor, FlexValueType } from "../types/flexible-table.types.js";
import { assertCellParentTables, assertFlexAccess, calculateFlexAccess } from "./flexible-table.authorization.js";
import { badRequest, permissionFlags, readSectionConnections, requireCellVersion, requireName, requireSectionKey, requireUuid, requireVersion, validateCellValue, validateColumnConfiguration, validateSettings } from "./flexible-table.validation.js";

type TableRecord = Record<string, any>;
const SYSTEM_TRACKER_KEY = "alzhen_transmittal_tracker_v1";
const TABLE_FIELDS = "id, name, table_kind, report_key, settings, created_by, version, created_at, updated_at, archived_at";
const COLUMN_FIELDS = "id, table_id, name, position, value_type, input_mode, binding_scope, settings, is_hidden, is_archived, created_by, version, created_at, updated_at";
const ROW_FIELDS = "id, table_id, row_kind, source_entity_type, source_entity_id, position, created_by, version, created_at, updated_at, archived_at";
const CELL_FIELDS = "id, row_id, column_id, value, version, updated_by, created_at, updated_at";
const OPTION_FIELDS = "id, column_id, label, stored_value, position, color, is_active, created_by, created_at, updated_at";
const PERMISSION_FIELDS = "id, table_id, subject_type, subject_role, subject_profile_id, can_view, can_edit, can_manage, created_by, created_at, updated_at";

function failDb(operation: string, error: unknown): never {
  console.error(`Flexible table ${operation} failed:`, error);
  throw new ApiError(`Unable to ${operation} flexible table data.`, 500, "FLEX_TABLE_QUERY_FAILED");
}

async function recordAudit(tableId: string, actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown, requestId?: string) {
  const id = randomUUID();
  const { error } = await supabaseAdmin.from("flex_audit_events").insert({
    table_id: tableId,
    actor_profile_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: before ?? null,
    after_data: after ?? null,
    request_id: requestId && requestId.length <= 100 ? requestId : id,
  });
  if (error) {
    console.error("Flexible table mutation succeeded but audit recording failed:", { tableId, entityType, entityId, error });
    throw new ApiError("The change was saved, but its audit event could not be recorded.", 500, "FLEX_AUDIT_WRITE_FAILED");
  }
}

export async function getTableAccess(tableIdInput: unknown, actor: FlexActor, level: "view" | "edit" | "manage") {
  const tableId = requireUuid(tableIdInput, "table_id");
  const { data: table, error } = await supabaseAdmin.from("flex_tables").select(TABLE_FIELDS).eq("id", tableId).maybeSingle();
  if (error) failDb("load", error);
  if (!table || table.table_kind !== "CUSTOM" || table.archived_at) throw new ApiError("Flexible table not found.", 404, "FLEX_TABLE_NOT_FOUND");
  if (table.settings?.system_key === SYSTEM_TRACKER_KEY) throw new ApiError("This system-managed table is only available through the Transmittal Tracker.", 404, "FLEX_TABLE_NOT_FOUND");
  const isAdmin = actor.role === "ADMIN";
  const isOwner = table.created_by === actor.id;
  let permissionRows: { subject_type: string; subject_role: string | null; subject_profile_id: string | null; can_view: boolean; can_edit: boolean; can_manage: boolean }[] = [];
  if (!isAdmin && !isOwner) {
    const { data: permissions, error: permissionError } = await supabaseAdmin
      .from("flex_table_permissions")
      .select("subject_type, subject_role, subject_profile_id, can_view, can_edit, can_manage")
      .eq("table_id", tableId)
      .or(`and(subject_type.eq.ROLE,subject_role.eq.${actor.role}),and(subject_type.eq.PROFILE,subject_profile_id.eq.${actor.id})`);
    if (permissionError) failDb("check table permissions for", permissionError);
    permissionRows = (permissions ?? []).map((permission) => ({
      subject_type: permission.subject_type,
      subject_role: permission.subject_role,
      subject_profile_id: permission.subject_profile_id,
      can_view: permission.can_view,
      can_edit: permission.can_edit,
      can_manage: permission.can_manage,
    }));
  }

  const access = calculateFlexAccess(actor, table.created_by, permissionRows);
  assertFlexAccess(access, level);
  return { table: table as TableRecord, access };
}

function requirePosition(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 1_000_000) badRequest("position must be a non-negative integer.");
  return Number(value);
}

async function requireColumn(tableId: string, columnIdInput: unknown) {
  const columnId = requireUuid(columnIdInput, "column_id");
  const { data, error } = await supabaseAdmin.from("flex_columns").select(COLUMN_FIELDS).eq("id", columnId).eq("table_id", tableId).eq("is_archived", false).maybeSingle();
  if (error) failDb("validate column ownership for", error);
  if (!data) throw new ApiError("Column not found in this table.", 404, "FLEX_COLUMN_NOT_FOUND");
  return data as TableRecord;
}

async function requireRow(tableId: string, rowIdInput: unknown) {
  const rowId = requireUuid(rowIdInput, "row_id");
  const { data, error } = await supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("id", rowId).eq("table_id", tableId).is("archived_at", null).maybeSingle();
  if (error) failDb("validate row ownership for", error);
  if (!data) throw new ApiError("Row not found in this table.", 404, "FLEX_ROW_NOT_FOUND");
  if (data.row_kind !== "CUSTOM") throw new ApiError("Only custom rows can be changed here.", 409, "FLEX_SOURCE_ROW_READ_ONLY");
  return data as TableRecord;
}

async function updateVersioned(tableName: string, id: string, tableId: string, expectedVersionInput: unknown, patch: Record<string, unknown>, fields: string) {
  const expectedVersion = requireVersion(expectedVersionInput);
  const { data, error } = await supabaseAdmin.from(tableName).update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("table_id", tableId).eq("version", expectedVersion).select(fields).maybeSingle();
  if (error) {
    if (error.code === "23505") throw new ApiError("A record with this name already exists.", 409, "FLEX_DUPLICATE");
    failDb("update", error);
  }
  if (!data) throw new ApiError("This record changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
  return data as TableRecord;
}

export async function listTables(actor: FlexActor) {
  const { data: tables, error } = await supabaseAdmin.from("flex_tables").select(TABLE_FIELDS).eq("table_kind", "CUSTOM").is("archived_at", null).order("updated_at", { ascending: false });
  if (error) failDb("list", error);
  const visibleTables = (tables ?? []).filter((table) => table.settings?.system_key !== SYSTEM_TRACKER_KEY);
  if (actor.role === "ADMIN") return visibleTables.map((table) => ({ ...table, access: { can_view: true, can_edit: true, can_manage: true, is_owner: table.created_by === actor.id } }));
  const ids = visibleTables.map((table) => table.id as string);
  const [{ data: permissions, error: permissionError }] = ids.length ? await Promise.all([
    supabaseAdmin.from("flex_table_permissions").select("table_id, subject_type, subject_role, subject_profile_id, can_view, can_edit, can_manage").in("table_id", ids).or(`and(subject_type.eq.ROLE,subject_role.eq.${actor.role}),and(subject_type.eq.PROFILE,subject_profile_id.eq.${actor.id})`),
  ]) : [{ data: [], error: null } as any];
  if (permissionError) failDb("list permissions for", permissionError);
  const result = [];
  for (const table of visibleTables) {
    const own = table.created_by === actor.id;
    const matching = (permissions ?? []).filter((permission: TableRecord) => permission.table_id === table.id);
    const access = {
      can_view: own || matching.some((permission: TableRecord) => permission.can_view),
      can_edit: own || matching.some((permission: TableRecord) => permission.can_edit),
      can_manage: own || matching.some((permission: TableRecord) => permission.can_manage),
      is_owner: own,
    };
    if (access.can_view) result.push({ ...table, access });
  }
  return result;
}

export async function listSectionTables(actor: FlexActor, sectionKeyInput: unknown) {
  const sectionKey = requireSectionKey(sectionKeyInput);
  const tables = await listTables(actor);
  return tables.filter((table: TableRecord) => readSectionConnections(table.settings).includes(sectionKey));
}

export async function setSectionTableConnection(actor: FlexActor, sectionKeyInput: unknown, tableIdInput: unknown, connect: boolean, requestId?: string) {
  const sectionKey = requireSectionKey(sectionKeyInput);
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const existingConnections = readSectionConnections(table.settings);
  const isConnected = existingConnections.includes(sectionKey);
  if (isConnected === connect) return table;

  const nextConnections = connect
    ? [...existingConnections, sectionKey]
    : existingConnections.filter((key) => key !== sectionKey);
  const expectedVersion = requireVersion(table.version, "version");
  const nextSettings = { ...validateSettings(table.settings), section_connections: nextConnections };
  const { data, error } = await supabaseAdmin
    .from("flex_tables")
    .update({ settings: nextSettings, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq("id", table.id)
    .eq("version", expectedVersion)
    .is("archived_at", null)
    .select(TABLE_FIELDS)
    .maybeSingle();
  if (error) failDb(connect ? "connect table to section for" : "disconnect table from section for", error);
  if (!data) throw new ApiError("This table changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
  await recordAudit(table.id, actor.id, connect ? "connect-section" : "disconnect-section", "TABLE", table.id, table, data, requestId);
  return data;
}

export async function createTable(actor: FlexActor, input: Record<string, unknown>, requestId?: string) {
  const name = requireName(input.name);
  const settings = validateSettings(input.settings);
  if (Object.keys(input).some((key) => !["name", "settings"].includes(key))) badRequest("Only name and settings are accepted when creating a custom table.");
  const { data, error } = await supabaseAdmin.from("flex_tables").insert({ name, table_kind: "CUSTOM", report_key: null, settings, created_by: actor.id }).select(TABLE_FIELDS).single();
  if (error) {
    if (error.code === "23505") throw new ApiError("A custom table with that name already exists.", 409, "FLEX_DUPLICATE");
    failDb("create", error);
  }
  await recordAudit(data.id, actor.id, "create", "TABLE", data.id, null, data, requestId);
  return { ...data, access: { can_view: true, can_edit: true, can_manage: true, is_owner: true } };
}

export async function getTable(actor: FlexActor, tableId: unknown) {
  const { table, access } = await getTableAccess(tableId, actor, "view");
  const id = table.id as string;
  const [columnsResult, rowsResult] = await Promise.all([
    supabaseAdmin.from("flex_columns").select(COLUMN_FIELDS).eq("table_id", id).eq("is_archived", false).order("position").order("created_at"),
    supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("table_id", id).eq("row_kind", "CUSTOM").is("archived_at", null).order("position").order("created_at"),
  ]);
  if (columnsResult.error) failDb("load columns for", columnsResult.error);
  if (rowsResult.error) failDb("load rows for", rowsResult.error);
  const columns = columnsResult.data ?? [];
  const rows = rowsResult.data ?? [];
  const columnIds = columns.map((column) => column.id);
  const rowIds = rows.map((row) => row.id);
  const [cellsResult, optionsResult] = await Promise.all([
    rowIds.length ? supabaseAdmin.from("flex_cells").select(CELL_FIELDS).in("row_id", rowIds) : Promise.resolve({ data: [], error: null } as any),
    columnIds.length ? supabaseAdmin.from("flex_dropdown_options").select(OPTION_FIELDS).in("column_id", columnIds).eq("is_active", true).order("position") : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (cellsResult.error) failDb("load cells for", cellsResult.error);
  if (optionsResult.error) failDb("load dropdown options for", optionsResult.error);
  const cellsByRow: Record<string, TableRecord[]> = {};
  for (const cell of cellsResult.data ?? []) (cellsByRow[cell.row_id] ??= []).push(cell);
  return { table, access, columns, rows: rows.map((row) => ({ ...row, cells: cellsByRow[row.id] ?? [] })), options: optionsResult.data ?? [] };
}

export async function updateTable(actor: FlexActor, tableIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  if (Object.keys(input).some((key) => !["name", "expected_version"].includes(key))) badRequest("Unsupported table update field.");
  const expectedVersion = requireVersion(input.expected_version);
  const before = { name: table.name, version: table.version };
  const { data: updated, error } = await supabaseAdmin.from("flex_tables").update({ name: requireName(input.name), version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", table.id).eq("version", expectedVersion).select(TABLE_FIELDS).maybeSingle();
  if (error) {
    if (error.code === "23505") throw new ApiError("A custom table with that name already exists.", 409, "FLEX_DUPLICATE");
    failDb("update", error);
  }
  if (!updated) throw new ApiError("This table changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
  await recordAudit(table.id, actor.id, "update", "TABLE", table.id, before, updated, requestId);
  return updated;
}

export async function archiveTable(actor: FlexActor, tableIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  if (Object.keys(input).some((key) => key !== "expected_version")) badRequest("Unsupported table archive field.");
  const expectedVersion = requireVersion(input.expected_version);
  const { data, error } = await supabaseAdmin.from("flex_tables").update({ archived_at: new Date().toISOString(), version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", table.id).eq("version", expectedVersion).is("archived_at", null).select(TABLE_FIELDS).maybeSingle();
  if (error) failDb("archive", error);
  if (!data) throw new ApiError("This table changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
  await recordAudit(table.id, actor.id, "archive", "TABLE", table.id, table, data, requestId);
  return data;
}

export async function createColumn(actor: FlexActor, tableIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  if (Object.keys(input).some((key) => !["name", "value_type", "input_mode", "binding_scope", "settings", "position"].includes(key))) badRequest("Unsupported column field.");
  const config = validateColumnConfiguration(input);
  if (config.binding_scope !== "CUSTOM_ROW") badRequest("Source bindings are not enabled for custom tables.");
  const { data: last, error: positionError } = await supabaseAdmin.from("flex_columns").select("position").eq("table_id", table.id).eq("is_archived", false).order("position", { ascending: false }).limit(1).maybeSingle();
  if (positionError) failDb("load column order for", positionError);
  const position = input.position === undefined ? Number(last?.position ?? -1) + 1 : requirePosition(input.position);
  const { data, error } = await supabaseAdmin.from("flex_columns").insert({ table_id: table.id, ...config, position, is_hidden: false, is_archived: false, created_by: actor.id }).select(COLUMN_FIELDS).single();
  if (error) {
    if (error.code === "23505") throw new ApiError("A column with that name already exists.", 409, "FLEX_DUPLICATE");
    failDb("create column for", error);
  }
  await recordAudit(table.id, actor.id, "create", "COLUMN", data.id, null, data, requestId);
  return data;
}

export async function updateColumn(actor: FlexActor, tableIdInput: unknown, columnIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const column = await requireColumn(table.id, columnIdInput);
  const allowed = ["name", "position", "value_type", "input_mode", "binding_scope", "settings", "is_hidden", "expected_version"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) badRequest("Unsupported column update field.");
  const patch: TableRecord = {};
  if (input.name !== undefined || input.value_type !== undefined || input.input_mode !== undefined || input.binding_scope !== undefined || input.settings !== undefined) {
    const config = validateColumnConfiguration({ ...column, ...input });
    if (config.binding_scope !== "CUSTOM_ROW") badRequest("Source bindings are not enabled for custom tables.");
    if (config.value_type !== column.value_type) {
      const { data: existingCell, error: cellError } = await supabaseAdmin.from("flex_cells").select("id").eq("column_id", column.id).limit(1).maybeSingle();
      if (cellError) failDb("check existing values before changing column type for", cellError);
      if (existingCell) badRequest("A column type cannot be changed after cells have been saved. Add a new column to preserve existing values.", "FLEX_COLUMN_TYPE_IN_USE");
    }
    Object.assign(patch, config);
  }
  if (input.position !== undefined) patch.position = requirePosition(input.position);
  if (input.is_hidden !== undefined) {
    if (typeof input.is_hidden !== "boolean") badRequest("is_hidden must be a boolean.");
    patch.is_hidden = input.is_hidden;
  }
  const updated = await updateVersioned("flex_columns", column.id, table.id, input.expected_version, patch, COLUMN_FIELDS);
  await recordAudit(table.id, actor.id, input.position !== undefined ? "reorder" : input.is_hidden !== undefined ? "hide" : "update", "COLUMN", column.id, column, updated, requestId);
  return updated;
}

export async function archiveColumn(actor: FlexActor, tableIdInput: unknown, columnIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const column = await requireColumn(table.id, columnIdInput);
  if (Object.keys(input).some((key) => key !== "expected_version")) badRequest("Unsupported column archive field.");
  const updated = await updateVersioned("flex_columns", column.id, table.id, input.expected_version, { is_archived: true }, COLUMN_FIELDS);
  await recordAudit(table.id, actor.id, "archive", "COLUMN", column.id, column, updated, requestId);
  return updated;
}

export async function createRow(actor: FlexActor, tableIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "edit");
  if (Object.keys(input).some((key) => !["position"].includes(key))) badRequest("Only position is accepted when creating a custom row.");
  const { data: last, error: positionError } = await supabaseAdmin.from("flex_rows").select("position").eq("table_id", table.id).eq("row_kind", "CUSTOM").is("archived_at", null).order("position", { ascending: false }).limit(1).maybeSingle();
  if (positionError) failDb("load row order for", positionError);
  const position = input.position === undefined ? Number(last?.position ?? -1) + 1 : requirePosition(input.position);
  const { data, error } = await supabaseAdmin.from("flex_rows").insert({ table_id: table.id, row_kind: "CUSTOM", source_entity_type: null, source_entity_id: null, position, created_by: actor.id }).select(ROW_FIELDS).single();
  if (error) failDb("create row for", error);
  await recordAudit(table.id, actor.id, "create", "ROW", data.id, null, data, requestId);
  return { ...data, cells: [] };
}

export async function updateRow(actor: FlexActor, tableIdInput: unknown, rowIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "edit");
  const row = await requireRow(table.id, rowIdInput);
  if (Object.keys(input).some((key) => !["position", "expected_version"].includes(key))) badRequest("Unsupported row update field.");
  const updated = await updateVersioned("flex_rows", row.id, table.id, input.expected_version, { position: requirePosition(input.position) }, ROW_FIELDS);
  await recordAudit(table.id, actor.id, "reorder", "ROW", row.id, row, updated, requestId);
  return updated;
}

export async function archiveRow(actor: FlexActor, tableIdInput: unknown, rowIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "edit");
  const row = await requireRow(table.id, rowIdInput);
  if (Object.keys(input).some((key) => key !== "expected_version")) badRequest("Unsupported row archive field.");
  const expectedVersion = requireVersion(input.expected_version);
  const { data, error } = await supabaseAdmin.from("flex_rows").update({ archived_at: new Date().toISOString(), version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq("id", row.id).eq("table_id", table.id).eq("version", expectedVersion).is("archived_at", null).select(ROW_FIELDS).maybeSingle();
  if (error) failDb("archive row for", error);
  if (!data) throw new ApiError("This row changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
  await recordAudit(table.id, actor.id, "archive", "ROW", row.id, row, data, requestId);
  return data;
}

export async function updateCell(actor: FlexActor, tableIdInput: unknown, rowIdInput: unknown, columnIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "edit");
  const row = await requireRow(table.id, rowIdInput);
  const column = await requireColumn(table.id, columnIdInput);
  assertCellParentTables(table.id, row.table_id, column.table_id);
  if (column.binding_scope !== "CUSTOM_ROW") throw new ApiError("This column is not editable on custom rows.", 409, "FLEX_BINDING_SCOPE_MISMATCH");
  if (Object.keys(input).some((key) => !["value", "expected_version"].includes(key)) || !Object.hasOwn(input, "value")) badRequest("Provide value and expected_version only.");
  const expectedVersion = requireCellVersion(input.expected_version);
  const value = validateCellValue(input.value, column.value_type as FlexValueType);
  if (column.input_mode === "DROPDOWN" && value !== null) {
    if (typeof value !== "string") badRequest("Dropdown cell values must be stored text values.");
    const { data: option, error } = await supabaseAdmin.from("flex_dropdown_options").select("id").eq("column_id", column.id).eq("stored_value", value).eq("is_active", true).maybeSingle();
    if (error) failDb("validate dropdown option for", error);
    if (!option) badRequest("Select an active option from this column.", "INVALID_DROPDOWN_OPTION");
  }
  const { data: existing, error: lookupError } = await supabaseAdmin.from("flex_cells").select(CELL_FIELDS).eq("row_id", row.id).eq("column_id", column.id).maybeSingle();
  if (lookupError) failDb("load cell for", lookupError);
  let saved: TableRecord;
  if (existing) {
    const version = expectedVersion;
    if (version < 1 || existing.version !== version) throw new ApiError("This cell changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
    const { data, error } = await supabaseAdmin.from("flex_cells").update({ value, version: version + 1, updated_by: actor.id, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("version", version).select(CELL_FIELDS).maybeSingle();
    if (error) failDb("update cell for", error);
    if (!data) throw new ApiError("This cell changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
    saved = data;
  } else {
    if (expectedVersion !== 0) throw new ApiError("This cell was created by another editor. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
    const { data, error } = await supabaseAdmin.from("flex_cells").insert({ row_id: row.id, column_id: column.id, value, version: 1, updated_by: actor.id }).select(CELL_FIELDS).single();
    if (error) {
      if (error.code === "23505") throw new ApiError("This cell was created by another editor. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
      failDb("create cell for", error);
    }
    saved = data;
  }
  await recordAudit(table.id, actor.id, existing ? "update" : "create", "CELL", saved.id, existing, saved, requestId);
  return saved;
}

export async function listPermissions(actor: FlexActor, tableIdInput: unknown) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const { data, error } = await supabaseAdmin.from("flex_table_permissions").select(PERMISSION_FIELDS).eq("table_id", table.id).order("created_at");
  if (error) failDb("list table permissions for", error);
  return data ?? [];
}

async function validatePermissionSubject(input: Record<string, unknown>) {
  if (input.subject_type === "ROLE") {
    if (input.subject_role !== "STAFF" || input.subject_profile_id !== null && input.subject_profile_id !== undefined) badRequest("Only STAFF role permissions can be assigned here.");
    return { subject_type: "ROLE", subject_role: "STAFF", subject_profile_id: null };
  }
  if (input.subject_type === "PROFILE") {
    if (input.subject_role !== null && input.subject_role !== undefined) badRequest("Profile permissions cannot include subject_role.");
    const profileId = requireUuid(input.subject_profile_id, "subject_profile_id");
    const { data, error } = await supabaseAdmin.from("profiles").select("id, role").eq("id", profileId).maybeSingle();
    if (error) failDb("validate permission profile for", error);
    if (!data || data.role !== "STAFF") badRequest("Permissions may only be granted to STAFF profiles.", "INVALID_PERMISSION_SUBJECT");
    return { subject_type: "PROFILE", subject_role: null, subject_profile_id: profileId };
  }
  badRequest("subject_type must be ROLE or PROFILE.");
}

export async function createPermission(actor: FlexActor, tableIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const allowed = ["subject_type", "subject_role", "subject_profile_id", "can_view", "can_edit", "can_manage"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) badRequest("Unsupported permission field.");
  const subject = await validatePermissionSubject(input);
  const flags = permissionFlags(input);
  if (!flags.can_view) badRequest("A permission must include view access.");
  let query = supabaseAdmin.from("flex_table_permissions").select(PERMISSION_FIELDS).eq("table_id", table.id).eq("subject_type", subject.subject_type);
  query = subject.subject_type === "ROLE" ? query.eq("subject_role", subject.subject_role) : query.eq("subject_profile_id", subject.subject_profile_id);
  const { data: existing, error: lookupError } = await query.maybeSingle();
  if (lookupError) failDb("check existing permissions for", lookupError);
  if (existing) throw new ApiError("A permission already exists for this subject.", 409, "FLEX_DUPLICATE_PERMISSION");
  const { data, error } = await supabaseAdmin.from("flex_table_permissions").insert({ table_id: table.id, ...subject, ...flags, created_by: actor.id }).select(PERMISSION_FIELDS).single();
  if (error) {
    if (error.code === "23505") throw new ApiError("A permission already exists for this subject.", 409, "FLEX_DUPLICATE_PERMISSION");
    failDb("create permission for", error);
  }
  await recordAudit(table.id, actor.id, "grant", "PERMISSION", data.id, null, data, requestId);
  return data;
}

export async function updatePermission(actor: FlexActor, tableIdInput: unknown, permissionIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const permissionId = requireUuid(permissionIdInput, "permission_id");
  const { data: existing, error: lookupError } = await supabaseAdmin.from("flex_table_permissions").select(PERMISSION_FIELDS).eq("id", permissionId).eq("table_id", table.id).maybeSingle();
  if (lookupError) failDb("load permission for", lookupError);
  if (!existing) throw new ApiError("Permission not found.", 404, "FLEX_PERMISSION_NOT_FOUND");
  if (Object.keys(input).some((key) => !["can_view", "can_edit", "can_manage"].includes(key))) badRequest("Only permission flags can be updated.");
  const flags = permissionFlags({ can_view: input.can_view ?? existing.can_view, can_edit: input.can_edit ?? existing.can_edit, can_manage: input.can_manage ?? existing.can_manage });
  const { data, error } = await supabaseAdmin.from("flex_table_permissions").update({ ...flags, updated_at: new Date().toISOString() }).eq("id", permissionId).eq("table_id", table.id).select(PERMISSION_FIELDS).maybeSingle();
  if (error) failDb("update permission for", error);
  if (!data) throw new ApiError("Permission could not be updated.", 409, "FLEX_PERMISSION_CONFLICT");
  await recordAudit(table.id, actor.id, "update", "PERMISSION", permissionId, existing, data, requestId);
  return data;
}

export async function deletePermission(actor: FlexActor, tableIdInput: unknown, permissionIdInput: unknown, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const permissionId = requireUuid(permissionIdInput, "permission_id");
  const { data: existing, error: lookupError } = await supabaseAdmin.from("flex_table_permissions").select(PERMISSION_FIELDS).eq("id", permissionId).eq("table_id", table.id).maybeSingle();
  if (lookupError) failDb("load permission for", lookupError);
  if (!existing) throw new ApiError("Permission not found.", 404, "FLEX_PERMISSION_NOT_FOUND");
  const { error } = await supabaseAdmin.from("flex_table_permissions").delete().eq("id", permissionId).eq("table_id", table.id);
  if (error) failDb("delete permission for", error);
  await recordAudit(table.id, actor.id, "revoke", "PERMISSION", permissionId, existing, null, requestId);
  return { id: permissionId };
}

export async function listOptions(actor: FlexActor, tableIdInput: unknown, columnIdInput: unknown) {
  const { table } = await getTableAccess(tableIdInput, actor, "view");
  const column = await requireColumn(table.id, columnIdInput);
  if (column.input_mode !== "DROPDOWN") badRequest("This column is not configured as a dropdown.");
  const { data, error } = await supabaseAdmin.from("flex_dropdown_options").select(OPTION_FIELDS).eq("column_id", column.id).order("position").order("created_at");
  if (error) failDb("load dropdown options for", error);
  return data ?? [];
}

function validateOption(input: Record<string, unknown>, partial = false) {
  const patch: TableRecord = {};
  for (const key of Object.keys(input)) if (!["label", "stored_value", "position", "color", "is_active"].includes(key)) badRequest(`Unsupported dropdown option field: ${key}.`);
  if (!partial || input.label !== undefined) patch.label = requireName(input.label, "label");
  if (!partial || input.stored_value !== undefined) patch.stored_value = requireName(input.stored_value, "stored_value");
  if (input.position !== undefined) patch.position = requirePosition(input.position);
  if (input.color !== undefined) {
    if (input.color !== null && (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/i.test(input.color))) badRequest("color must be a six-digit hex color or null.");
    patch.color = input.color;
  }
  if (input.is_active !== undefined) {
    if (typeof input.is_active !== "boolean") badRequest("is_active must be a boolean.");
    patch.is_active = input.is_active;
  }
  return patch;
}

export async function createOption(actor: FlexActor, tableIdInput: unknown, columnIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const column = await requireColumn(table.id, columnIdInput);
  if (column.input_mode !== "DROPDOWN") badRequest("Configure the column as a dropdown before adding options.");
  const patch = validateOption(input);
  const { data: last, error: positionError } = await supabaseAdmin.from("flex_dropdown_options").select("position").eq("column_id", column.id).order("position", { ascending: false }).limit(1).maybeSingle();
  if (positionError) failDb("load dropdown option order for", positionError);
  const position = patch.position ?? Number(last?.position ?? -1) + 1;
  const { data, error } = await supabaseAdmin.from("flex_dropdown_options").insert({ column_id: column.id, ...patch, position, is_active: patch.is_active ?? true, created_by: actor.id }).select(OPTION_FIELDS).single();
  if (error) {
    if (error.code === "23505") throw new ApiError("That stored value already exists for this column.", 409, "FLEX_DUPLICATE_OPTION");
    failDb("create dropdown option for", error);
  }
  await recordAudit(table.id, actor.id, "create", "OPTION", data.id, null, data, requestId);
  return data;
}

export async function updateOption(actor: FlexActor, tableIdInput: unknown, columnIdInput: unknown, optionIdInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTableAccess(tableIdInput, actor, "manage");
  const column = await requireColumn(table.id, columnIdInput);
  const optionId = requireUuid(optionIdInput, "option_id");
  const { data: existing, error: lookupError } = await supabaseAdmin.from("flex_dropdown_options").select(OPTION_FIELDS).eq("id", optionId).eq("column_id", column.id).maybeSingle();
  if (lookupError) failDb("load dropdown option for", lookupError);
  if (!existing) throw new ApiError("Dropdown option not found.", 404, "FLEX_OPTION_NOT_FOUND");
  const patch = validateOption(input, true);
  if (!Object.keys(patch).length) badRequest("Provide at least one option field to update.");
  const { data, error } = await supabaseAdmin.from("flex_dropdown_options").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", optionId).eq("column_id", column.id).select(OPTION_FIELDS).maybeSingle();
  if (error) {
    if (error.code === "23505") throw new ApiError("That active stored value already exists for this column.", 409, "FLEX_DUPLICATE_OPTION");
    failDb("update dropdown option for", error);
  }
  await recordAudit(table.id, actor.id, patch.is_active === false ? "deactivate" : patch.is_active === true ? "activate" : patch.position !== undefined ? "reorder" : "update", "OPTION", optionId, existing, data, requestId);
  return data;
}

export async function getTableAudit(actor: FlexActor, tableIdInput: unknown, limitInput: unknown) {
  const { table } = await getTableAccess(tableIdInput, actor, "view");
  const limit = limitInput === undefined ? 100 : Number(limitInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) badRequest("limit must be between 1 and 200.");
  const { data, error } = await supabaseAdmin.from("flex_audit_events").select("id, table_id, actor_profile_id, action, entity_type, entity_id, before_data, after_data, request_id, created_at").eq("table_id", table.id).order("created_at", { ascending: false }).limit(limit);
  if (error) failDb("load audit history for", error);
  return data ?? [];
}
